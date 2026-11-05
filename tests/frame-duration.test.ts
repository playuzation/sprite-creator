import { describe, expect, it } from 'vitest';
import {
  addLayer, addLayerMask, createSprite, duplicateFrame, exportGif, exportWebp, frameDuration, loadProject,
  MAX_FRAME_DURATION, MIN_FRAME_DURATION, saveProject, setFrameDuration,
} from '../src/sprite';

describe('프레임별 표시 시간', () => {
  it('기존 프레임은 기본 FPS, 개별 시간은 FPS와 독립적으로 사용한다', () => {
    const s = createSprite(2, 1);
    duplicateFrame(s, 0);
    expect(frameDuration(s, 0)).toBe(100);
    setFrameDuration(s, 1, 350);
    s.fps = 20;
    expect(frameDuration(s, 0)).toBe(50);
    expect(frameDuration(s, 1)).toBe(350);
    setFrameDuration(s, 1);
    expect(frameDuration(s, 1)).toBe(50);
    expect(s.frames[1].duration).toBeUndefined();
  });

  it('프레임 복제 시 시간도 복사하고 독립적으로 수정한다', () => {
    const s = createSprite(2, 1);
    setFrameDuration(s, 0, 250);
    duplicateFrame(s, 0);
    setFrameDuration(s, 1, 500);
    expect(s.frames.map((f) => f.duration)).toEqual([250, 500]);
  });

  it('시간이 없는 예전 JSON과 새 JSON 모두 저장·불러오기 된다', async () => {
    const s = createSprite(2, 1);
    s.fps = 8;
    const old = await loadProject(await saveProject(s));
    expect(old.frames[0].duration).toBeUndefined();
    expect(frameDuration(old, 0)).toBe(125);
    setFrameDuration(s, 0, 123);
    duplicateFrame(s, 0);
    setFrameDuration(s, 1, MAX_FRAME_DURATION);
    expect(await loadProject(await saveProject(s))).toEqual(s);
  });

  it('범위 밖·소수·잘못된 시간을 거부한다', async () => {
    const s = createSprite(1, 1);
    const file = JSON.parse(await saveProject(s));
    for (const value of [0, -1, MIN_FRAME_DURATION - 1, MAX_FRAME_DURATION + 1, 10.5, NaN, Infinity]) {
      expect(() => setFrameDuration(s, 0, value)).toThrow();
    }
    for (const value of [0, -1, 600001, 10.5, null, '100', true]) {
      file.frames[0].duration = value;
      await expect(loadProject(JSON.stringify(file))).rejects.toThrow('표시 시간');
    }
    expect(s.frames[0].duration).toBeUndefined();
  });

  it('GIF는 프레임별 시간을 10ms 단위로 내보낸다', () => {
    const s = createSprite(2, 1);
    s.frames[0].cels[0].fill(1);
    setFrameDuration(s, 0, 123);
    duplicateFrame(s, 0);
    setFrameDuration(s, 1, 450);
    const gif = exportGif(s);
    const delays = [];
    for (let i = 0; i < gif.length - 7; i++) {
      if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4) delays.push(gif[i + 4] | (gif[i + 5] << 8));
    }
    expect(delays).toEqual([12, 45]);
  });

  it('WebP는 선택한 순서대로 각 프레임 시간을 내보낸다', () => {
    const s = createSprite(2, 1);
    setFrameDuration(s, 0, 123);
    duplicateFrame(s, 0);
    setFrameDuration(s, 1, 456);
    const file = exportWebp(s, [1, 0]);
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const durations = [];
    for (let p = 12; p + 8 <= file.length;) {
      const type = String.fromCharCode(...file.subarray(p, p + 4));
      const length = view.getUint32(p + 4, true);
      if (type === 'ANMF') durations.push(file[p + 20] | (file[p + 21] << 8) | (file[p + 22] << 16));
      p += 8 + length + length % 2;
    }
    expect(durations).toEqual([456, 123]);
  });
});


it('마스크·다중 레이어·표시 시간을 함께 복제하고 독립 편집·저장한다', async () => {
  const s = createSprite(2, 1);
  addLayer(s, 1, 'vector');
  s.frames[0].cels[0][0] = 1;
  s.frames[0].shapes[1].push({ points: [{ x: 0.5, y: 0.5 }], curve: false, width: 1, antialias: false, color: 2 });
  addLayerMask(s, 0);
  addLayerMask(s, 1);
  setFrameDuration(s, 0, 350);
  duplicateFrame(s, 0);
  expect(s.frames[1]).toEqual(s.frames[0]);
  s.frames[1].cels[0][0] = 3;
  s.frames[1].shapes[1][0].points[0].x = 1.5;
  s.frames[1].masks![0]![0] = 0;
  s.frames[1].masks![1]![1] = 0;
  setFrameDuration(s, 1, 750);
  expect(s.frames[0].cels[0][0]).toBe(1);
  expect(s.frames[0].shapes[1][0].points[0].x).toBe(0.5);
  expect([...s.frames[0].masks![0]!]).toEqual([1, 1]);
  expect([...s.frames[0].masks![1]!]).toEqual([1, 1]);
  expect(s.frames[0].duration).toBe(350);
  expect(await loadProject(await saveProject(s))).toEqual(s);
});
