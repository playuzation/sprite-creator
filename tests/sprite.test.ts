import { describe, expect, it } from 'vitest';
import {
  MAX_COLORS,
  addColor,
  copyRegion,
  pasteRegion,
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
  resizeCanvas,
  scaleSprite,
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

/** w x h 스프라이트에 픽셀 값을 채워 만든다. */
function spriteOf(width: number, height: number, pixels: number[]) {
  const sprite = createSprite(width, height);
  sprite.frames[0].cels[0].set(pixels);
  return sprite;
}

/** 셀을 행 단위 문자열로 (보기 쉬운 비교용) */
function rows(sprite: ReturnType<typeof createSprite>, frame = 0, layer = 0) {
  const cel = sprite.frames[frame].cels[layer];
  return Array.from({ length: sprite.height }, (_, y) => cel.slice(y * sprite.width, (y + 1) * sprite.width).join(''));
}

describe('resizeCanvas', () => {
  it('늘리면 기준 위치에 그림을 붙이고 나머지는 투명하게 채운다', () => {
    const grow = (x: number, y: number) => {
      const sprite = spriteOf(2, 2, [1, 2, 3, 4]);
      resizeCanvas(sprite, 4, 3, { x, y });
      return rows(sprite);
    };
    expect(grow(0, 0)).toEqual(['1200', '3400', '0000']);
    expect(grow(0.5, 0.5)).toEqual(['0120', '0340', '0000']); // 홀수 차이(세로 1)는 아래쪽에 붙임
    expect(grow(1, 1)).toEqual(['0000', '0012', '0034']);
    expect(grow(0.5, 0)).toEqual(['0120', '0340', '0000']);
    expect(grow(1, 0.5)).toEqual(['0012', '0034', '0000']);
  });

  it('줄이면 기준 위치 쪽을 남기고 잘라낸다', () => {
    // prettier-ignore
    const pixels = [
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 1, 2, 3,
      4, 5, 6, 7,
    ];
    const shrink = (x: number, y: number) => {
      const sprite = spriteOf(4, 4, pixels);
      resizeCanvas(sprite, 2, 2, { x, y });
      return rows(sprite);
    };
    expect(shrink(0, 0)).toEqual(['12', '56']);
    expect(shrink(0.5, 0.5)).toEqual(['67', '12']);
    expect(shrink(1, 1)).toEqual(['23', '67']);
    expect(shrink(0, 1)).toEqual(['91', '45']);
  });

  it('벡터 패스도 그림과 함께 옮기고, 크기는 1~1024만 허용한다', () => {
    const sprite = createSprite(2, 2);
    sprite.path.points = [{ x: 0.5, y: 1.5 }];
    resizeCanvas(sprite, 6, 4, { x: 0.5, y: 1 });
    expect(sprite.path.points).toEqual([{ x: 2.5, y: 3.5 }]);
    expect(() => resizeCanvas(sprite, 2000, 1)).toThrow(RangeError);
  });
});

describe('scaleSprite', () => {
  it('늘리면 각 픽셀이 커지고, 비율도 바꿀 수 있다', () => {
    const double = spriteOf(2, 2, [1, 2, 3, 4]);
    scaleSprite(double, 4, 4);
    expect(rows(double)).toEqual(['1122', '1122', '3344', '3344']);

    const tall = spriteOf(2, 1, [1, 2]);
    scaleSprite(tall, 2, 3);
    expect(rows(tall)).toEqual(['12', '12', '12']);
  });

  it('줄이면 새 픽셀 중심에 가장 가까운 원래 픽셀을 가져와 팔레트 색만 남는다', () => {
    const sprite = spriteOf(4, 1, [1, 2, 3, 4]);
    scaleSprite(sprite, 2, 1);
    expect(rows(sprite)).toEqual(['24']);
  });

  it('모든 프레임·레이어와 벡터 패스를 함께 바꾸고, 크기는 1~1024만 허용한다', () => {
    const sprite = spriteOf(2, 2, [1, 2, 3, 4]);
    addLayer(sprite, 1);
    sprite.frames[0].cels[1].set([0, 5, 0, 0]);
    duplicateFrame(sprite, 0);
    sprite.path.points = [{ x: 1, y: 0.5 }];
    scaleSprite(sprite, 4, 2);
    expect(rows(sprite, 1, 0)).toEqual(['1122', '3344']);
    expect(rows(sprite, 1, 1)).toEqual(['0055', '0000']);
    expect(sprite.path.points).toEqual([{ x: 2, y: 0.5 }]);
    expect(() => scaleSprite(sprite, 0, 2)).toThrow(RangeError);
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

  it('선택 영역(clip)이 있으면 그 안의 픽셀만 바꾼다', () => {
    const line = new Uint8Array(5);
    drawLine(line, 5, 0, 0, 4, 0, 1, { x: 1, y: 0, width: 3, height: 1 });
    expect([...line]).toEqual([0, 1, 1, 1, 0]);

    // 아래 행으로 이어진 영역이지만, 선택 영역(위 두 행) 밖으로는 퍼지지 않는다.
    // prettier-ignore
    const cel = new Uint8Array([
      0, 1, 0,
      0, 1, 0,
      0, 0, 0,
    ]);
    floodFill(cel, 3, 0, 0, 2, { x: 0, y: 0, width: 3, height: 2 });
    expect([...cel]).toEqual([2, 1, 0, 2, 1, 0, 0, 0, 0]);
    floodFill(cel, 3, 0, 2, 2, { x: 0, y: 0, width: 3, height: 2 });
    expect(cel[6]).toBe(0);
  });

  it('영역을 복사하고 붙인다 (캔버스 밖은 투명/버림, overwrite가 false면 투명은 아래가 보임)', () => {
    // prettier-ignore
    const cel = new Uint8Array([
      1, 2, 0,
      3, 0, 4,
    ]);
    expect([...copyRegion(cel, 3, { x: 1, y: 0, width: 3, height: 2 })]).toEqual([2, 0, 0, 0, 4, 0]);

    const target = new Uint8Array(6).fill(9);
    pasteRegion(target, 3, { x: 1, y: 1, width: 2, height: 2 }, Uint8Array.of(1, 0, 2, 3), false);
    expect([...target]).toEqual([9, 9, 9, 9, 1, 9]);
    pasteRegion(target, 3, { x: 1, y: 1, width: 2, height: 2 }, Uint8Array.of(1, 0, 2, 3), true);
    expect([...target]).toEqual([9, 9, 9, 9, 1, 0]);
  });
});
