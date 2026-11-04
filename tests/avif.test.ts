import { describe, expect, it } from 'vitest';
import { muxAvif } from '../src/codec/avif';

// 실제 AV1 압축은 브라우저(WebCodecs)에서만 되므로, 여기서는 가짜 AV1 데이터로 파일 구조를 확인한다.
// 시퀀스 헤더 OBU: High 프로필(1), 레벨 8, 티어 0
const SEQUENCE_HEADER = [0x0a, 0x04, 0x20, 0x00, 0x00, 0x40];
const frame = (...payload: number[]) => Uint8Array.from([0x32, payload.length, ...payload]); // 프레임 OBU
const first = (...payload: number[]) => Uint8Array.from([...SEQUENCE_HEADER, ...frame(...payload)]);

/** ISOBMFF 상자 찾기: 경로(예: ['moov', 'trak'])의 상자들 */
function find(file: Uint8Array, path: string[], start = 0, end = file.length, prefix = 0): { start: number; end: number }[] {
  const u32 = (at: number) => ((file[at] << 24) | (file[at + 1] << 16) | (file[at + 2] << 8) | file[at + 3]) >>> 0;
  const found = [];
  for (let p = start + prefix; p + 8 <= end && u32(p) >= 8; p += u32(p)) {
    if (String.fromCharCode(...file.subarray(p + 4, p + 8)) !== path[0]) continue;
    const box = { start: p + 8, end: p + u32(p) };
    // meta·iref는 버전·플래그 4바이트 뒤에 하위 상자가 온다.
    const skip = path[0] === 'meta' || path[0] === 'iref' ? 4 : 0;
    found.push(...(path.length === 1 ? [box] : find(file, path.slice(1), box.start, box.end, skip)));
  }
  return found;
}

const u32At = (file: Uint8Array, at: number) => ((file[at] << 24) | (file[at + 1] << 16) | (file[at + 2] << 8) | file[at + 3]) >>> 0;

describe('muxAvif', () => {
  it('정지 이미지: 색과 알파(보조 이미지) 항목이 각자의 데이터를 가리킨다', () => {
    const color = [first(1, 2, 3)];
    const alpha = [first(9, 9)];
    const file = muxAvif({ width: 4, height: 3, color, alpha, frameMs: 100 });
    const [ftyp] = find(file, ['ftyp']);
    expect(String.fromCharCode(...file.subarray(ftyp.start, ftyp.start + 4))).toBe('avif');
    expect(find(file, ['moov'])).toHaveLength(0);

    // iloc: 항목 2개, 각 (번호, 0, 덩어리 1개, 위치, 길이)
    const [iloc] = find(file, ['meta', 'iloc']);
    const entry = (i: number) => iloc.start + 8 + i * 14;
    for (const [i, data] of [color[0], alpha[0]].entries()) {
      const [offset, length] = [u32At(file, entry(i) + 6), u32At(file, entry(i) + 10)];
      expect(file.subarray(offset, offset + length)).toEqual(data);
    }
    // av1C: 시퀀스 헤더의 프로필·레벨과 4:4:4, 뒤에 시퀀스 헤더 OBU
    const [av1C] = find(file, ['meta', 'iprp', 'ipco', 'av1C']);
    expect([...file.subarray(av1C.start, av1C.end)]).toEqual([0x81, 0x28, 0x00, 0x00, ...SEQUENCE_HEADER]);
    expect(find(file, ['meta', 'iref', 'auxl'])).toHaveLength(1);
    expect(find(file, ['meta', 'iprp', 'ipco', 'auxC'])).toHaveLength(1);
  });

  it('애니메이션: 색·알파 트랙의 표본이 순서대로 이어지고, 프레임 길이와 무한 반복이 적힌다', () => {
    const color = [first(1), frame(2, 2), frame(3, 3, 3)];
    const alpha = [first(7), frame(8), frame(9)];
    const file = muxAvif({ width: 4, height: 3, color, alpha, frameMs: 125 });
    const [ftyp] = find(file, ['ftyp']);
    expect(String.fromCharCode(...file.subarray(ftyp.start, ftyp.start + 4))).toBe('avis');
    const tracks = find(file, ['moov', 'trak']);
    expect(tracks).toHaveLength(2);
    for (const [track, samples] of [[tracks[0], color], [tracks[1], alpha]] as const) {
      const box = (...path: string[]) => find(file, path, track.start, track.end)[0];
      const stsz = box('mdia', 'minf', 'stbl', 'stsz');
      const stco = box('mdia', 'minf', 'stbl', 'stco');
      const stts = box('mdia', 'minf', 'stbl', 'stts');
      expect(u32At(file, stsz.start + 8)).toBe(3);
      expect(samples.map((_, i) => u32At(file, stsz.start + 12 + i * 4))).toEqual(samples.map((s) => s.length));
      const offset = u32At(file, stco.start + 8);
      expect(file.subarray(offset, offset + samples.reduce((n, s) => n + s.length, 0))).toEqual(Uint8Array.from(samples.flatMap((s) => [...s])));
      expect([u32At(file, stts.start + 8), u32At(file, stts.start + 12)]).toEqual([3, 125]);
      // tkhd(버전 1)의 길이는 '정하지 않음', elst는 반복(플래그 1)
      const tkhd = box('tkhd');
      expect([...file.subarray(tkhd.start + 28, tkhd.start + 36)]).toEqual(Array(8).fill(0xff));
      expect(u32At(file, box('edts', 'elst').start)).toBe(0x01000001);
    }
    expect(find(file, ['moov', 'trak', 'tref', 'auxl'])).toHaveLength(1);
  });
});
