import { describe, expect, it } from 'vitest';
import {
  MAX_COLORS,
  addColor,
  addLayer,
  compositeFrame,
  createSprite,
  drawLine,
  duplicateFrame,
  floodFill,
  moveLayer,
  removeColor,
  removeFrame,
  removeLayer,
  renderFrameRGBA,
  resizeSprite,
} from '../src/sprite';

describe('createSprite', () => {
  it('기본은 128x128 투명 캔버스, 레이어 1개, 프레임 1개다', () => {
    const sprite = createSprite();
    expect([sprite.width, sprite.height]).toEqual([128, 128]);
    expect(sprite.layers).toHaveLength(1);
    expect(sprite.frames).toHaveLength(1);
    expect(sprite.frames[0].cels[0].every((v) => v === 0)).toBe(true);
    expect(sprite.palette.length).toBeLessThanOrEqual(MAX_COLORS);
  });

  it('1~1024 정수 크기만 허용한다', () => {
    expect(createSprite(1024, 1024).frames[0].cels[0]).toHaveLength(1024 * 1024);
    expect(createSprite(1, 3).frames[0].cels[0]).toHaveLength(3);
    for (const [w, h] of [[0, 10], [1025, 10], [10, 1025], [10.5, 10]]) {
      expect(() => createSprite(w, h)).toThrow(RangeError);
    }
  });
});

describe('palette', () => {
  it('최대 32색까지 추가할 수 있다', () => {
    const sprite = createSprite(2, 2);
    while (sprite.palette.length < MAX_COLORS) addColor(sprite, '#ABCDEF');
    expect(sprite.palette.at(-1)).toBe('#abcdef');
    expect(() => addColor(sprite, '#000000')).toThrow(RangeError);
    expect(() => addColor(createSprite(), 'red')).toThrow(TypeError);
  });

  it('색을 지우면 그 색 픽셀은 투명해지고 뒤쪽 색 픽셀은 당겨진다', () => {
    const sprite = createSprite(4, 1);
    sprite.frames[0].cels[0].set([1, 2, 3, 0]);
    removeColor(sprite, 1);
    expect([...sprite.frames[0].cels[0]]).toEqual([1, 0, 2, 0]);
    expect(sprite.palette).toHaveLength(15);
  });
});

describe('layers', () => {
  it('레이어 추가/삭제/이동이 모든 프레임에 적용된다', () => {
    const sprite = createSprite(2, 1);
    duplicateFrame(sprite, 0);
    addLayer(sprite, 1);
    expect(sprite.layers).toHaveLength(2);
    sprite.frames.forEach((frame) => expect(frame.cels).toHaveLength(2));

    sprite.frames[1].cels[1][0] = 5;
    moveLayer(sprite, 1, 0);
    expect(sprite.frames[1].cels[0][0]).toBe(5);

    removeLayer(sprite, 0);
    sprite.frames.forEach((frame) => expect(frame.cels).toHaveLength(1));
    expect(() => removeLayer(sprite, 0)).toThrow(RangeError);
  });
});

describe('frames', () => {
  it('프레임 추가는 현재 프레임의 모든 레이어를 독립적으로 복사한다', () => {
    const sprite = createSprite(2, 2);
    addLayer(sprite, 1);
    sprite.frames[0].cels[0][0] = 1;
    sprite.frames[0].cels[1][3] = 2;

    duplicateFrame(sprite, 0);
    expect(sprite.frames).toHaveLength(2);
    expect([...sprite.frames[1].cels[0]]).toEqual([1, 0, 0, 0]);
    expect([...sprite.frames[1].cels[1]]).toEqual([0, 0, 0, 2]);

    sprite.frames[1].cels[0][1] = 3;
    expect(sprite.frames[0].cels[0][1]).toBe(0);

    removeFrame(sprite, 0);
    expect(() => removeFrame(sprite, 0)).toThrow(RangeError);
  });
});

describe('resizeSprite', () => {
  it('왼쪽 위 기준으로 자르거나 투명하게 늘린다', () => {
    const sprite = createSprite(2, 2);
    sprite.frames[0].cels[0].set([1, 2, 3, 4]);
    resizeSprite(sprite, 3, 1);
    expect([sprite.width, sprite.height]).toEqual([3, 1]);
    expect([...sprite.frames[0].cels[0]]).toEqual([1, 2, 0]);
    expect(() => resizeSprite(sprite, 2000, 1)).toThrow(RangeError);
  });
});

describe('render', () => {
  it('보이는 레이어 중 위쪽 픽셀이 보이고, 빈 곳은 투명하다', () => {
    const sprite = createSprite(3, 1);
    addLayer(sprite, 1);
    sprite.frames[0].cels[0].set([1, 1, 0]);
    sprite.frames[0].cels[1].set([2, 0, 0]);
    expect([...compositeFrame(sprite, 0)]).toEqual([2, 1, 0]);

    sprite.layers[1].visible = false;
    expect([...compositeFrame(sprite, 0)]).toEqual([1, 1, 0]);

    sprite.palette[0] = '#102030';
    expect([...renderFrameRGBA(sprite, 0)]).toEqual([16, 32, 48, 255, 16, 32, 48, 255, 0, 0, 0, 0]);
  });
});

describe('draw', () => {
  it('직선은 끊김 없이 칠하고 캔버스 밖은 무시한다', () => {
    const cel = new Uint8Array(9);
    drawLine(cel, 3, -1, -1, 3, 3, 1);
    expect([...cel]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('채우기는 이어진 같은 색 영역만 채운다', () => {
    // prettier-ignore
    const cel = new Uint8Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ]);
    floodFill(cel, 3, 0, 0, 2);
    expect([...cel]).toEqual([2, 1, 0, 2, 1, 0, 2, 1, 0]);
  });
});
