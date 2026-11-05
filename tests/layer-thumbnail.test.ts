import { createPixelFixture } from './fixtures';
import { describe, expect, it } from 'vitest';
import { addLayer, addLayerMask, createPath, duplicateFrame, renderFrameRGBA, renderLayerRGBA } from '../src/sprite';

describe('레이어 썸네일 렌더링', () => {
  it('다른 레이어의 픽셀을 섞지 않고 숨김 레이어도 내용을 보여준다', () => {
    const s = createPixelFixture(2, 1);
    s.palette = ['#ff0000', '#0000ff'];
    s.frames[0].cels[0].set([1, 0]);
    addLayer(s, 1);
    s.frames[0].cels[1].set([0, 2]);
    s.layers[1].visible = false;
    expect([...renderLayerRGBA(s, 0, 0)]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect([...renderLayerRGBA(s, 0, 1)]).toEqual([0, 0, 0, 0, 0, 0, 255, 255]);
    expect(s.layers[1].visible).toBe(false);
    expect(renderFrameRGBA(s, 0)).toEqual(renderLayerRGBA(s, 0, 0));
  });

  it('현재 프레임·팔레트·픽셀 변경과 출력 버퍼 재사용을 반영한다', () => {
    const s = createPixelFixture(1, 1);
    s.palette = ['#ff0000', '#00ff00'];
    s.frames[0].cels[0][0] = 1;
    duplicateFrame(s, 0);
    s.frames[1].cels[0][0] = 2;
    const out = renderLayerRGBA(s, 0, 0);
    expect([...out]).toEqual([255, 0, 0, 255]);
    expect(renderLayerRGBA(s, 1, 0, out)).toBe(out);
    expect([...out]).toEqual([0, 255, 0, 255]);
    s.palette[1] = '#0000ff';
    expect([...renderLayerRGBA(s, 1, 0)]).toEqual([0, 0, 255, 255]);
    s.frames[1].cels[0][0] = 0;
    expect([...renderLayerRGBA(s, 1, 0, out)]).toEqual([0, 0, 0, 0]);
  });

  it('마스크 적용 전환을 반영하고 원본 픽셀을 유지한다', () => {
    const s = createPixelFixture(1, 1);
    s.frames[0].cels[0][0] = 1;
    addLayerMask(s, 0);
    s.frames[0].masks![0]![0] = 0;
    expect(renderLayerRGBA(s, 0, 0)[3]).toBe(0);
    s.layers[0].maskEnabled = false;
    expect(renderLayerRGBA(s, 0, 0)[3]).toBe(255);
    expect(s.frames[0].cels[0][0]).toBe(1);
  });

  it('벡터 도형을 단독으로 그리고 보호·숨김·아래 레이어 상태를 변경하지 않는다', () => {
    const s = createPixelFixture(2, 1);
    s.palette = ['#ff0000', '#0000ff'];
    s.frames[0].cels[0].fill(1);
    addLayer(s, 1, 'vector');
    s.layers[1].locked = true;
    s.layers[1].visible = false;
    s.frames[0].shapes[1].push({ ...createPath(), points: [{ x: 0.5, y: 0.5 }], color: 2 });
    expect([...renderLayerRGBA(s, 0, 1)]).toEqual([0, 0, 255, 255, 0, 0, 0, 0]);
    expect([...s.frames[0].cels[0]]).toEqual([1, 1]);
    expect(s.layers[1]).toMatchObject({ locked: true, visible: false });
  });
});
