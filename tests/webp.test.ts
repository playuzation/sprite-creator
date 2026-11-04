import { describe, expect, it } from 'vitest';
import { encodeWebp } from '../src/codec';

/** 검증용 최소 VP8L 디코더: 이 인코더가 쓰는 기능(변환·색 캐시 없음, 허프만 묶음 하나, 위·왼쪽 역참조)만 읽는다. */
function decodeVp8l(data: Uint8Array) {
  let bit = 0;
  const read = (count: number) => {
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    return value;
  };
  expect(read(8)).toBe(0x2f);
  const [width, height] = [read(14) + 1, read(14) + 1];
  read(1);
  expect([read(3), read(1), read(1), read(1)]).toEqual([0, 0, 0, 0]); // 버전, 변환·색 캐시·메타 부호 없음

  const huffman = (lengths: Uint8Array) => {
    const symbols = [...lengths.keys()].filter((s) => lengths[s] > 0).sort((a, b) => lengths[a] - lengths[b] || a - b);
    if (symbols.length === 1) return () => symbols[0];
    const table = new Map<string, number>();
    let code = 0;
    symbols.forEach((symbol, i) => {
      if (i > 0) code = (code + 1) << (lengths[symbol] - lengths[symbols[i - 1]]);
      table.set(`${lengths[symbol]}:${code}`, symbol);
    });
    return () => {
      for (let length = 1, code = 0; length <= 15; length++) {
        code = (code << 1) | read(1);
        const symbol = table.get(`${length}:${code}`);
        if (symbol !== undefined) return symbol;
      }
      throw new Error('잘못된 허프만 부호');
    };
  };
  const readCode = (size: number) => {
    const lengths = new Uint8Array(size);
    if (read(1)) {
      const count = read(1) + 1;
      const first = read(read(1) ? 8 : 1);
      if (count === 1) return () => first;
      lengths[first] = lengths[read(8)] = 1;
      return huffman(lengths);
    }
    const order = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const codeLengths = new Uint8Array(19);
    for (let i = 0, count = read(4) + 4; i < count; i++) codeLengths[order[i]] = read(3);
    expect(read(1)).toBe(0);
    const next = huffman(codeLengths);
    for (let i = 0, previous = 8; i < size; ) {
      const symbol = next();
      if (symbol < 16) {
        lengths[i++] = symbol;
        if (symbol) previous = symbol;
        continue;
      }
      const [bits, base, value] = symbol === 16 ? [2, 3, previous] : symbol === 17 ? [3, 3, 0] : [7, 11, 0];
      for (let n = read(bits) + base; n > 0; n--) lengths[i++] = value;
    }
    return huffman(lengths);
  };
  const [green, red, blue, alpha, distance] = [280, 256, 256, 256, 40].map(readCode);
  const prefixValue = (code: number) => {
    if (code < 4) return code + 1;
    const extra = (code - 2) >> 1;
    return ((2 + (code & 1)) << extra) + read(extra) + 1;
  };
  const pixels = new Uint32Array(width * height);
  for (let i = 0; i < pixels.length; ) {
    const g = green();
    if (g < 256) {
      const [r, b, a] = [red(), blue(), alpha()];
      pixels[i++] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
      continue;
    }
    const length = prefixValue(g - 256);
    const code = prefixValue(distance());
    const offset = code === 1 ? width : code === 2 ? 1 : code - 120;
    for (let n = 0; n < length; n++, i++) pixels[i] = pixels[i - offset];
  }
  return { width, height, pixels };
}

/** RIFF 덩어리 목록 */
function chunks(file: Uint8Array) {
  const text = (at: number) => String.fromCharCode(...file.subarray(at, at + 4));
  const u32 = (at: number) => (file[at] | (file[at + 1] << 8) | (file[at + 2] << 16) | (file[at + 3] << 24)) >>> 0;
  expect([text(0), u32(4), text(8)]).toEqual(['RIFF', file.length - 8, 'WEBP']);
  const list: { type: string; data: Uint8Array }[] = [];
  for (let p = 12; p < file.length; p += 8 + u32(p + 4) + (u32(p + 4) % 2)) {
    list.push({ type: text(p), data: file.subarray(p + 8, p + 8 + u32(p + 4)) });
  }
  return list;
}

/** 인코더처럼 RGBA를 ARGB로 (완전히 투명한 픽셀은 0) */
const argb = (rgba: Uint8Array) =>
  Uint32Array.from({ length: rgba.length / 4 }, (_, i) =>
    rgba[i * 4 + 3] ? ((rgba[i * 4 + 3] << 24) | (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]) >>> 0 : 0,
  );

const COLORS = [[20, 12, 28, 255], [208, 70, 72, 255], [109, 170, 44, 255], [222, 238, 214, 255], [0, 0, 0, 0]];
/** 투명 픽셀과 같은 색이 이어지는 구간이 많은 픽셀 그림 */
const art = (w: number, h: number, frame: number) =>
  Uint8Array.from({ length: w * h * 4 }, (_, i) => COLORS[(Math.floor((i >> 2) % w / 3) * 3 + Math.floor((i >> 2) / w / 2) * 5 + frame * 7) % 5][i & 3]);
let seed = 7;
/** 색이 많아 일반 허프만 부호를 쓰게 되는 잡음 */
const noise = (w: number, h: number) =>
  Uint8Array.from({ length: w * h * 4 }, (_, i) => ((seed = (seed * 48271) % 2147483647) % 256) | (i % 4 === 3 ? 0x80 : 0));

describe('encodeWebp', () => {
  it('정지 이미지는 VP8L 하나로, 투명 픽셀·반복 구간·많은 색을 손실 없이 담는다', () => {
    for (const [w, h, rgba] of [[37, 23, art(37, 23, 0)], [300, 200, art(300, 200, 1)], [40, 30, noise(40, 30)], [1, 1, Uint8Array.of(1, 2, 3, 4)]] as const) {
      const list = chunks(encodeWebp({ width: w, height: h, frames: [rgba], frameMs: 100 }));
      expect(list.map((c) => c.type)).toEqual(['VP8L']);
      const image = decodeVp8l(list[0].data);
      expect([image.width, image.height]).toEqual([w, h]);
      expect(image.pixels).toEqual(argb(rgba));
    }
  });

  it('애니메이션은 무한 반복하고, 프레임마다 길이를 담아 캔버스 전체를 덮어쓴다', () => {
    const frames = [0, 1, 2].map((f) => art(16, 9, f));
    const list = chunks(encodeWebp({ width: 16, height: 9, frames, frameMs: 125 }));
    expect(list.map((c) => c.type)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF', 'ANMF']);
    expect([...list[0].data]).toEqual([0x12, 0, 0, 0, 15, 0, 0, 8, 0, 0]); // 알파 + 애니메이션, 16x9
    expect([...list[1].data]).toEqual([0, 0, 0, 0, 0, 0]); // 투명 배경, 반복 0 = 무한
    list.slice(2).forEach(({ data }, i) => {
      expect([...data.subarray(12, 16)]).toEqual([125, 0, 0, 0x02]); // 125ms, 섞지 않음
      expect(String.fromCharCode(...data.subarray(16, 20))).toBe('VP8L');
      expect(decodeVp8l(data.subarray(24)).pixels).toEqual(argb(frames[i]));
    });
  });
});
