import { createPixelFixture } from './fixtures';
import { describe, expect, it } from 'vitest';
import {
  MAX_COLORS,
  createSprite,
  isValidSize,
  addColor,
  copyRegion,
  pasteRegion,
  addLayer,
  compositeFrame,
  createPath,
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
  type VectorShape,
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

  it('16~4096 사이의 모든 정수 크기를 허용한다', () => {
    for (let n = 16; n <= 4096; n++) expect(isValidSize(n)).toBe(true);
    expect(createSprite(4096, 4096).frames[0].cels[0]).toHaveLength(4096 * 4096);
    expect(createSprite(17, 31).frames[0].cels[0]).toHaveLength(527);
    for (const [w, h] of [[0, 16], [15, 16], [16, 15], [4097, 16], [16, 4097], [16.5, 16], [NaN, 16], [Infinity, 16]]) {
      expect(() => createSprite(w, h)).toThrow(RangeError);
    }
  });
});

describe('palette', () => {
  it('최대 32색까지 추가할 수 있다', () => {
    const sprite = createPixelFixture(2, 2);
    while (sprite.palette.length < MAX_COLORS) addColor(sprite, '#ABCDEF');
    expect(sprite.palette.at(-1)).toBe('#abcdef');
    expect(() => addColor(sprite, '#000000')).toThrow(RangeError);
    expect(() => addColor(createPixelFixture(), 'red')).toThrow(TypeError);
  });

  it('색을 지우면 그 색 픽셀은 투명해지고 뒤쪽 색 픽셀은 당겨진다', () => {
    const sprite = createPixelFixture(4, 1);
    sprite.frames[0].cels[0].set([1, 2, 3, 0]);
    removeColor(sprite, 1);
    expect([...sprite.frames[0].cels[0]]).toEqual([1, 0, 2, 0]);
    expect(sprite.palette).toHaveLength(15);
  });
});

describe('layers', () => {
  it('레이어 추가/삭제/이동이 모든 프레임에 적용된다', () => {
    const sprite = createPixelFixture(2, 1);
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
    const sprite = createPixelFixture(2, 2);
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
  const sprite = createPixelFixture(width, height);
  sprite.frames[0].cels[0].set(pixels);
  return sprite;
}

/** 셀을 행 단위 문자열로 (보기 쉬운 비교용) */
function rows(sprite: ReturnType<typeof createPixelFixture>, frame = 0, layer = 0) {
  const cel = sprite.frames[frame].cels[layer];
  return Array.from({ length: sprite.height }, (_, y) => cel.slice(y * sprite.width, (y + 1) * sprite.width).join(''));
}

describe('resizeCanvas', () => {
  it('9개 기준 위치로 확장·잘라내며 픽셀과 패스를 옮긴다', () => {
    for (const x of [0, 0.5, 1]) for (const y of [0, 0.5, 1]) {
      const s = createSprite(16, 16);
      s.frames[0].cels[0][0] = 1;
      s.path.points = [{ x: 0.5, y: 0.5 }];
      resizeCanvas(s, 20, 18, { x, y });
      const dx = 4 * x, dy = 2 * y;
      expect(s.frames[0].cels[0][dy * 20 + dx]).toBe(1);
      expect(s.frames[0].cels[0].filter(Boolean)).toHaveLength(1);
      expect(s.path.points).toEqual([{ x: dx + 0.5, y: dy + 0.5 }]);
      resizeCanvas(s, 16, 16, { x, y });
      expect(s.frames[0].cels[0][0]).toBe(1);
      expect(s.path.points).toEqual([{ x: 0.5, y: 0.5 }]);
    }
  });
  it('범위를 벗어난 크기는 원본을 바꾸지 않고 거부한다', () => {
    const s = createSprite(16, 16);
    for (const n of [0, 15, 4097, 16.5]) expect(() => resizeCanvas(s, n, 16)).toThrow(RangeError);
    expect(s.width).toBe(16);
  });
});

describe('scaleSprite', () => {
  it('최근접 이웃으로 늘리거나 줄이고 모든 프레임·레이어·패스도 변환한다', () => {
    const s = createSprite(16, 16);
    s.frames[0].cels[0][0] = 1;
    addLayer(s, 1);
    s.frames[0].cels[1][0] = 2;
    duplicateFrame(s, 0);
    s.path.points = [{ x: 1, y: 0.5 }];
    scaleSprite(s, 32, 16);
    expect([...s.frames[1].cels[0].slice(0, 4)]).toEqual([1, 1, 0, 0]);
    expect([...s.frames[1].cels[1].slice(0, 4)]).toEqual([2, 2, 0, 0]);
    expect(s.path.points).toEqual([{ x: 2, y: 0.5 }]);
    scaleSprite(s, 16, 16);
    expect(s.frames[0].cels[0][0]).toBe(1);
    expect(s.path.points).toEqual([{ x: 1, y: 0.5 }]);
    for (const n of [15, 4097]) expect(() => scaleSprite(s, n, 16)).toThrow(RangeError);
  });
});

describe('render', () => {
  it('보이는 레이어 중 위쪽 픽셀이 보이고, 빈 곳은 투명하다', () => {
    const sprite = createPixelFixture(3, 1);
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

/** 기본 설정(직선, 두께 1, 안티에일리어싱 끔)의 도형 */
const shape = (options: Partial<VectorShape>): VectorShape => ({ ...createPath(), color: 1, ...options });

/** 합성한 프레임을 행 단위 문자열로 */
function compositeRows(sprite: ReturnType<typeof createPixelFixture>, frame = 0) {
  const pixels = compositeFrame(sprite, frame);
  return Array.from({ length: sprite.height }, (_, y) => pixels.slice(y * sprite.width, (y + 1) * sprite.width).join(''));
}

describe('vector layers', () => {
  it('도형 목록은 레이어 추가·삭제·이동을 따라가고, 프레임을 추가하면 독립적으로 복사된다', () => {
    const sprite = createPixelFixture(4, 4);
    addLayer(sprite, 1, 'vector');
    expect(sprite.layers.map((layer) => layer.kind)).toEqual(['pixel', 'vector']);
    const line = shape({ points: [{ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }] });
    sprite.frames[0].shapes[1].push(line);

    duplicateFrame(sprite, 0);
    expect(sprite.frames[1].shapes).toEqual([[], [line]]);
    sprite.frames[1].shapes[1][0].points[0].x = 2;
    expect(line.points[0].x).toBe(0.5);

    moveLayer(sprite, 1, 0);
    expect(sprite.frames[0].shapes).toEqual([[line], []]);
    removeLayer(sprite, 0);
    expect(sprite.frames.map((frame) => frame.shapes)).toEqual([[[]], [[]]]);
  });

  it('합성할 때 도형을 앞쪽부터 픽셀로 그리고(셀에는 굽지 않음), 숨긴 벡터 레이어는 빠진다', () => {
    const sprite = createPixelFixture(4, 4);
    addLayer(sprite, 1, 'vector');
    sprite.frames[0].shapes[1].push(
      shape({ points: [{ x: 0.5, y: 1.5 }, { x: 3.5, y: 1.5 }], color: 1 }),
      shape({ points: [{ x: 1.5, y: 0.5 }, { x: 1.5, y: 3.5 }], color: 2 }),
    );
    expect(compositeRows(sprite)).toEqual(['0200', '1211', '0200', '0200']);
    expect(sprite.frames[0].cels[1].every((value) => value === 0)).toBe(true);
    sprite.layers[1].visible = false;
    expect(compositeRows(sprite)).toEqual(['0000', '0000', '0000', '0000']);
  });

  it('안티에일리어싱은 그 아래에 보이는 그림과 섞는다', () => {
    const sprite = createPixelFixture(4, 4);
    sprite.palette = ['#000000', '#ffffff', '#808080'];
    sprite.frames[0].cels[0].fill(2);
    addLayer(sprite, 1, 'vector');
    // 두 행의 경계(y = 2)를 지나는 검정 선: 흰 바탕 위에서는 회색, 바탕을 숨기면 투명 위라 절반 걸친 픽셀은 선 색
    sprite.frames[0].shapes[1].push(shape({ points: [{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }], antialias: true }));
    expect(compositeRows(sprite)).toEqual(['2222', '3333', '3333', '2222']);
    sprite.layers[0].visible = false;
    expect(compositeRows(sprite)).toEqual(['0000', '1111', '1111', '0000']);
  });

  it('캔버스 변경은 도형을 옮기고, 해상도 변경은 도형을 늘리며 선 두께도 바꾼다 (1~32)', () => {
    const sprite = createSprite(16, 16);
    addLayer(sprite, 1, 'vector');
    const [thin, thick] = [shape({ points: [{ x: 0.5, y: 1.5 }], width: 3 }), shape({ points: [{ x: 1, y: 1 }], width: 20 })];
    sprite.frames[0].shapes[1].push(thin, thick);
    resizeCanvas(sprite, 20, 18, { x: 0.5, y: 1 });
    expect(thin.points).toEqual([{ x: 2.5, y: 3.5 }]);
    scaleSprite(sprite, 40, 36);
    expect(thin.points).toEqual([{ x: 5, y: 7 }]);
    expect([thin.width, thick.width]).toEqual([6, 32]);
    // 가로만 절반: 두께는 두 비율의 기하 평균(√0.5)만큼
    scaleSprite(sprite, 20, 36);
    expect(thin.points).toEqual([{ x: 2.5, y: 7 }]);
    expect(thin.width).toBe(4);
  });

  it('색을 지우면 그 색의 도형은 지워지고 뒤쪽 색의 도형은 당겨진다', () => {
    const sprite = createPixelFixture(2, 2);
    addLayer(sprite, 1, 'vector');
    sprite.frames[0].shapes[1].push(...[1, 2, 3].map((color) => shape({ points: [{ x: 0, y: 0 }], color })));
    removeColor(sprite, 1);
    expect(sprite.frames[0].shapes[1].map((s) => s.color)).toEqual([1, 2]);
  });
});


it('캔버스 확장 시 홀수 여백의 남는 픽셀은 오른쪽·아래에 붙는다', () => {
  const s = createSprite(16, 16);
  s.frames[0].cels[0].fill(1);
  resizeCanvas(s, 19, 19, { x: 0.5, y: 0.5 });
  expect(s.frames[0].cels[0][0]).toBe(0);
  expect(s.frames[0].cels[0][20]).toBe(1);
  expect(s.frames[0].cels[0][17 * 19 + 17]).toBe(0);
});

it('축소는 픽셀 중심의 최근접 이웃을 고르고 비표준 정수 크기로도 확대한다', () => {
  const s = createSprite(32, 16);
  for (let i = 0; i < s.frames[0].cels[0].length; i++) s.frames[0].cels[0][i] = i % 2 + 1;
  scaleSprite(s, 16, 16);
  expect(s.frames[0].cels[0].every((v) => v === 2)).toBe(true);
  scaleSprite(s, 17, 31);
  expect(s.frames[0].cels[0]).toHaveLength(17 * 31);
  expect(s.frames[0].cels[0].every((v) => v === 2)).toBe(true);
});

it('1024를 넘는 좌표에서도 4096번째 픽셀까지 편집한다', () => {
  const s = createSprite(4096, 16);
  drawLine(s.frames[0].cels[0], s.width, 1023, 0, 4095, 0, 1);
  for (const x of [1023, 1024, 2048, 4095]) expect(s.frames[0].cels[0][x]).toBe(1);
  expect(s.frames[0].cels[0][1022]).toBe(0);
});
