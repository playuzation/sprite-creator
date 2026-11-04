import { describe, expect, it } from 'vitest';
import { addLayer, createPath, createSprite, distanceToPath, drawLine, drawPath, pathPoints, type Point, type VectorPath } from '../src/sprite';

/** 흰 배경 레이어 위에 빈 레이어가 있는 스프라이트 (팔레트: 1 검정, 2 흰색, 3 회색) */
function spriteOnWhite(width: number, height: number) {
  const sprite = createSprite(width, height);
  sprite.palette = ['#000000', '#ffffff', '#808080'];
  sprite.frames[0].cels[0].fill(2);
  addLayer(sprite, 1);
  return sprite;
}

const path = (points: Point[], options: Partial<VectorPath> = {}): VectorPath => ({ ...createPath(), points, ...options });
const antialiased = (points: Point[]) => path(points, { antialias: true });
/** 4x4 셀을 행 단위 문자열로 (보기 쉬운 비교용) */
const rows = (cel: Uint8Array, width: number) => Array.from({ length: cel.length / width }, (_, y) => cel.slice(y * width, (y + 1) * width).join(''));

describe('drawPath', () => {
  it('안티에일리어싱을 끄면 각 점이 놓인 픽셀을 브레젠험 직선으로 잇는다', () => {
    const sprite = createSprite(8, 8);
    drawPath(sprite, 0, 0, path([{ x: 0.2, y: 0.7 }, { x: 5.9, y: 3.1 }, { x: 7.5, y: 7.5 }]), 3);
    const expected = new Uint8Array(64);
    drawLine(expected, 8, 0, 0, 5, 3, 3);
    drawLine(expected, 8, 5, 3, 7, 7, 3);
    expect(sprite.frames[0].cels[0]).toEqual(expected);
  });

  it('안티에일리어싱을 켜면 걸친 비율만큼 아래 색과 섞은 가장 가까운 팔레트 색으로 칠한다', () => {
    // 두 행의 경계(y = 2)를 지나는 선: 행 1과 2에 절반씩 걸쳐 검정+흰색 → 회색
    const half = spriteOnWhite(4, 4);
    drawPath(half, 0, 1, antialiased([{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }]), 1);
    expect(rows(half.frames[0].cels[1], 4)).toEqual(['0000', '3333', '3333', '0000']);

    // 픽셀 중심을 지나는 선: 한 행에 온전히 걸쳐 선 색 그대로
    const full = spriteOnWhite(4, 4);
    drawPath(full, 0, 1, antialiased([{ x: 0.5, y: 1.5 }, { x: 3.5, y: 1.5 }]), 1);
    expect(rows(full.frames[0].cels[1], 4)).toEqual(['0000', '1111', '0000', '0000']);
  });

  it('두 색 사이에 있지 않은 색(엉뚱한 색조)은 쓰지 않고, 사이 색이 없으면 걸친 비율에 따라 선 색이나 아래 색이 된다', () => {
    const sprite = spriteOnWhite(4, 4);
    sprite.palette = ['#000000', '#ffffff', '#ff0000'];
    // y = 1.75: 행 1에 3/4, 행 2에 1/4 걸침 → 행 1은 검정, 행 2는 흰색 그대로 (빨강은 검정-흰색 사이가 아님)
    drawPath(sprite, 0, 1, antialiased([{ x: 0.5, y: 1.75 }, { x: 3.5, y: 1.75 }]), 1);
    expect(rows(sprite.frames[0].cels[1], 4)).toEqual(['0000', '1111', '0000', '0000']);
  });

  it('섞은 결과가 이미 보이는 색과 같으면 픽셀을 바꾸지 않는다', () => {
    const sprite = spriteOnWhite(4, 4);
    drawPath(sprite, 0, 1, antialiased([{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }]), 2);
    expect(sprite.frames[0].cels[1].every((value) => value === 0)).toBe(true);
  });

  it('아래가 투명하면 섞을 색이 없으므로 절반 이상 걸친 픽셀만 선 색으로 칠한다', () => {
    const sprite = createSprite(4, 4);
    // y = 1.25: 행 0에 1/4, 행 1에 3/4 걸침
    drawPath(sprite, 0, 0, antialiased([{ x: 0.5, y: 1.25 }, { x: 3.5, y: 1.25 }]), 1);
    expect(rows(sprite.frames[0].cels[0], 4)).toEqual(['0000', '1111', '0000', '0000']);
  });

  it('아래 벡터 레이어의 도형도 섞을 색으로 쓴다', () => {
    const sprite = createSprite(4, 4);
    sprite.palette = ['#000000', '#ffffff', '#808080'];
    addLayer(sprite, 0, 'vector');
    // 아래 벡터 레이어: 행 1·2를 지나는 흰 선 두 개
    for (const y of [1.5, 2.5]) sprite.frames[0].shapes[0].push({ ...path([{ x: 0.5, y }, { x: 3.5, y }]), color: 2 });
    drawPath(sprite, 0, 1, antialiased([{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }]), 1);
    expect(rows(sprite.frames[0].cels[1], 4)).toEqual(['0000', '3333', '3333', '0000']);
  });

  it('점이 하나면 그 자리에 붓 모양의 점을 찍는다', () => {
    const sprite = createSprite(5, 5);
    drawPath(sprite, 0, 0, path([{ x: 2.5, y: 2.5 }], { width: 3 }), 1);
    expect(rows(sprite.frames[0].cels[0], 5)).toEqual(['00000', '00100', '01110', '00100', '00000']);
  });

  it('선택 영역(clip) 밖의 픽셀은 바꾸지 않는다', () => {
    const clip = { x: 1, y: 0, width: 2, height: 4 };
    for (const antialias of [false, true]) {
      const sprite = spriteOnWhite(4, 4);
      drawPath(sprite, 0, 1, path([{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }], { antialias }), 1, clip);
      const cel = sprite.frames[0].cels[1];
      expect([cel[4], cel[7], cel[8], cel[11]]).toEqual([0, 0, 0, 0]);
      expect(cel[9]).not.toBe(0);
    }
  });

  it('두께만큼 둥근 붓으로 그린다 (안티에일리어싱 끔)', () => {
    const sprite = createSprite(9, 5);
    drawPath(sprite, 0, 0, path([{ x: 2.5, y: 2.5 }, { x: 6.5, y: 2.5 }], { width: 3 }), 1);
    // 두께 3 붓은 십자 모양: 가운데 행은 양 끝이 1픽셀씩 늘어난다.
    expect(rows(sprite.frames[0].cels[0], 9)).toEqual(['000000000', '001111100', '011111110', '001111100', '000000000']);
  });

  it('두께가 있으면 안티에일리어싱도 그 두께로 칠한다', () => {
    const sprite = createSprite(9, 7);
    drawPath(sprite, 0, 0, path([{ x: 1.5, y: 3.5 }, { x: 7.5, y: 3.5 }], { width: 3, antialias: true }), 1);
    const column = rows(sprite.frames[0].cels[0], 9).map((row) => row[4]).join('');
    expect(column).toBe('0011100');
  });
});

describe('pathPoints', () => {
  it('곡선이 아니거나 점이 둘 이하면 찍은 점 그대로다', () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(pathPoints(path(points))).toBe(points);
    expect(pathPoints(path(points, { curve: true }))).toBe(points);
  });

  it('곡선은 찍은 점을 모두 지나는 부드러운 점들로 나뉜다', () => {
    const points = [{ x: 1, y: 8 }, { x: 8, y: 1 }, { x: 15, y: 8 }];
    const curve = pathPoints(path(points, { curve: true }));
    expect(curve.length).toBeGreaterThan(10);
    for (const point of points) expect(curve).toContainEqual(point);
    // 이웃한 점 사이는 1픽셀 남짓으로 촘촘하다.
    curve.slice(1).forEach((point, i) => expect(Math.hypot(point.x - curve[i].x, point.y - curve[i].y)).toBeLessThan(1.5));
  });

  it('곡선 패스는 직선 패스와 다르게, 찍은 점의 픽셀을 지나도록 그려진다', () => {
    const points = [{ x: 1.5, y: 12.5 }, { x: 8.5, y: 2.5 }, { x: 15.5, y: 12.5 }];
    const straight = createSprite(17, 15);
    const curved = createSprite(17, 15);
    drawPath(straight, 0, 0, path(points), 1);
    drawPath(curved, 0, 0, path(points, { curve: true }), 1);
    expect(curved.frames[0].cels[0]).not.toEqual(straight.frames[0].cels[0]);
    for (const { x, y } of points) expect(curved.frames[0].cels[0][Math.floor(y) * 17 + Math.floor(x)]).toBe(1);
  });
});

describe('distanceToPath', () => {
  it('점과 패스(점이 하나면 그 점) 사이의 거리', () => {
    const line = path([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(distanceToPath(line, { x: 5, y: 3 })).toBe(3);
    expect(distanceToPath(line, { x: 13, y: 4 })).toBe(5);
    expect(distanceToPath(path([{ x: 1, y: 1 }]), { x: 4, y: 5 })).toBe(5);
  });
});
