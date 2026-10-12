import { describe, expect, it } from 'vitest';
import { encodeGif } from '../src/codec';
import { addColor, compositeFrame, createSprite, duplicateFrame, exportGif } from '../src/sprite';

/** 검증용 최소 GIF 디코더 (전역 색상표, 확장 블록, LZW) */
function decodeGif(bytes: Uint8Array) {
  let p = 0;
  const u16 = () => bytes[p++] | (bytes[p++] << 8);
  const subBlocks = () => {
    const out: number[] = [];
    for (let size = bytes[p++]; size > 0; size = bytes[p++]) out.push(...bytes.subarray(p, (p += size)));
    return Uint8Array.from(out);
  };
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  p = 6;
  const width = u16();
  const height = u16();
  const tableSize = 2 << (bytes[p] & 7);
  p += 3 + tableSize * 3;
  let loop = false;
  let control = { disposal: 0, delay: 0, transparent: -1 };
  const frames: (typeof control & { indices: Uint8Array })[] = [];
  for (;;) {
    const block = bytes[p++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[p++];
      const data = subBlocks();
      if (label === 0xff) loop = String.fromCharCode(...data.subarray(0, 11)) === 'NETSCAPE2.0' && data[13] === 0;
      if (label === 0xf9) control = { disposal: (data[0] >> 2) & 7, delay: data[1] | (data[2] << 8), transparent: data[0] & 1 ? data[3] : -1 };
    } else if (block === 0x2c) {
      p += 9;
      const minCodeSize = bytes[p++];
      frames.push({ ...control, indices: lzwDecode(subBlocks(), minCodeSize, width * height) });
    } else {
      throw new Error(`알 수 없는 블록 ${block}`);
    }
  }
  return { header, width, height, tableSize, loop, frames };
}

function lzwDecode(data: Uint8Array, minCodeSize: number, length: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const out = new Uint8Array(length);
  let table: number[][] = [];
  let codeSize = minCodeSize + 1;
  let previous: number[] | undefined;
  let written = 0;
  for (let bit = 0; ; ) {
    let code = 0;
    for (let i = 0; i < codeSize; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    if (code === clearCode) {
      table = Array.from({ length: clearCode + 2 }, (_, i) => [i]);
      codeSize = minCodeSize + 1;
      previous = undefined;
      continue;
    }
    if (code === clearCode + 1) break;
    const entry = code < table.length ? table[code] : [...previous!, previous![0]];
    out.set(entry, written);
    written += entry.length;
    if (previous) {
      table.push([...previous, entry[0]]);
      if (table.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    previous = entry;
  }
  expect(written).toBe(length);
  return out;
}

describe('encodeGif', () => {
  it('큰 프레임도 LZW로 손실 없이 압축한다 (코드 크기 증가 및 표 초기화 포함)', () => {
    let seed = 1;
    const random = () => (seed = (seed * 48271) % 2147483647) % 33;
    const frames = [Uint8Array.from({ length: 300 * 200 }, random), new Uint8Array(300 * 200).fill(7)];
    const palette = Array.from({ length: 33 }, (_, i) => [i, i, i] as [number, number, number]);
    const gif = decodeGif(encodeGif({ width: 300, height: 200, palette, frames, delayCs: 5, transparentIndex: 0 }));
    expect(gif.tableSize).toBe(64);
    expect(gif.frames.map((f) => f.indices)).toEqual(frames);
  });

  it('1x1, 2색 GIF도 만든다', () => {
    const frames = [Uint8Array.of(1)];
    const gif = decodeGif(encodeGif({ width: 1, height: 1, palette: [[0, 0, 0], [255, 0, 0]], frames, delayCs: 10, transparentIndex: 0 }));
    expect(gif.frames[0].indices).toEqual(frames[0]);
  });
});

describe('exportGif', () => {
  it('모든 프레임을 투명 배경 무한 반복 애니메이션으로 내보낸다', () => {
    const sprite = createSprite(16, 8);
    addColor(sprite, '#ff0000');
    sprite.frames[0].cels[0].fill(17, 0, 20);
    duplicateFrame(sprite, 0);
    sprite.frames[1].cels[0].fill(1, 40, 60);
    sprite.fps = 20;

    const gif = decodeGif(exportGif(sprite));
    expect(gif.header).toBe('GIF89a');
    expect([gif.width, gif.height]).toEqual([16, 8]);
    expect(gif.loop).toBe(true);
    expect(gif.frames).toHaveLength(2);
    gif.frames.forEach((frame, i) => {
      expect(frame).toMatchObject({ disposal: 2, delay: 5, transparent: 0 });
      expect(frame.indices).toEqual(compositeFrame(sprite, i));
    });
  });
});
