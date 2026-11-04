import { describe, expect, it } from 'vitest';
import { addLayer, createSprite, drawLine, drawPath } from '../src/sprite';

/** 흰 배경 레이어 위에 빈 레이어가 있는 스프라이트 (팔레트: 1 검정, 2 흰색, 3 회색) */
function spriteOnWhite(width: number, height: number) {
  const sprite = createSprite(width, height);
  sprite.palette = ['#000000', '#ffffff', '#808080'];
  sprite.frames[0].cels[0].fill(2);
  addLayer(sprite, 1);
  return sprite;
}

describe('drawPath', () => {
  it('안티에일리어싱을 끄면 각 점이 놓인 픽셀을 브레젠험 직선으로 잇는다', () => {
    const sprite = createSprite(8, 8);
    const path = [{ x: 0.2, y: 0.7 }, { x: 5.9, y: 3.1 }, { x: 7.5, y: 7.5 }];
    drawPath(sprite, 0, 0, path, 3, false);
    const expected = new Uint8Array(64);
    drawLine(expected, 8, 0, 0, 5, 3, 3);
    drawLine(expected, 8, 5, 3, 7, 7, 3);
    expect(sprite.frames[0].cels[0]).toEqual(expected);
  });

  it('안티에일리어싱을 켜면 걸친 비율만큼 아래 색과 섞은 가장 가까운 팔레트 색으로 칠한다', () => {
    // 두 행의 경계(y = 2)를 지나는 선: 행 1과 2에 절반씩 걸쳐 검정+흰색 → 회색
    const half = spriteOnWhite(4, 4);
    drawPath(half, 0, 1, [{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }], 1, true);
    expect([...half.frames[0].cels[1]]).toEqual([0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0]);

    // 픽셀 중심을 지나는 선: 한 행에 온전히 걸쳐 선 색 그대로
    const full = spriteOnWhite(4, 4);
    drawPath(full, 0, 1, [{ x: 0.5, y: 1.5 }, { x: 3.5, y: 1.5 }], 1, true);
    expect([...full.frames[0].cels[1]]).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('두 색 사이에 있지 않은 색(엉뚱한 색조)은 쓰지 않고, 사이 색이 없으면 걸친 비율에 따라 선 색이나 아래 색이 된다', () => {
    const sprite = spriteOnWhite(4, 4);
    sprite.palette = ['#000000', '#ffffff', '#ff0000'];
    // y = 1.75: 행 1에 3/4, 행 2에 1/4 걸침 → 행 1은 검정, 행 2는 흰색 그대로 (빨강은 검정-흰색 사이가 아님)
    drawPath(sprite, 0, 1, [{ x: 0.5, y: 1.75 }, { x: 3.5, y: 1.75 }], 1, true);
    expect([...sprite.frames[0].cels[1]]).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('섞은 결과가 이미 보이는 색과 같으면 픽셀을 바꾸지 않는다', () => {
    const sprite = spriteOnWhite(4, 4);
    drawPath(sprite, 0, 1, [{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }], 2, true);
    expect(sprite.frames[0].cels[1].every((value) => value === 0)).toBe(true);
  });

  it('아래가 투명하면 섞을 색이 없으므로 절반 이상 걸친 픽셀만 선 색으로 칠한다', () => {
    const sprite = createSprite(4, 4);
    // y = 1.25: 행 0에 1/4, 행 1에 3/4 걸침
    drawPath(sprite, 0, 0, [{ x: 0.5, y: 1.25 }, { x: 3.5, y: 1.25 }], 1, true);
    expect([...sprite.frames[0].cels[0]]).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('선택 영역(clip) 밖의 픽셀은 바꾸지 않는다', () => {
    const clip = { x: 1, y: 0, width: 2, height: 4 };
    for (const antialias of [false, true]) {
      const sprite = spriteOnWhite(4, 4);
      drawPath(sprite, 0, 1, [{ x: 0.5, y: 2 }, { x: 3.5, y: 2 }], 1, antialias, clip);
      const cel = sprite.frames[0].cels[1];
      expect([cel[4], cel[7], cel[8], cel[11]]).toEqual([0, 0, 0, 0]);
      expect(cel[9]).not.toBe(0);
    }
  });
});
