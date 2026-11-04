import { TRANSPARENT } from './model';

/** 한 셀(레이어의 픽셀 배열)에 그리는 알고리즘. 캔버스와 clip(선택 영역) 밖의 픽셀은 바꾸지 않는다. */

/** 픽셀 단위 직사각형 영역 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 픽셀 (x, y)가 캔버스 안이고, clip이 있으면 그 안에도 있는지 */
export function canPaint(cel: Uint8Array, width: number, x: number, y: number, clip?: Rect): boolean {
  const inCanvas = x >= 0 && x < width && y >= 0 && y < cel.length / width;
  return inCanvas && (!clip || (x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height));
}

/** 브레젠험 직선: 포인터가 빠르게 움직여도 픽셀 사이가 끊기지 않게 잇는다. */
export function drawLine(
  cel: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
  clip?: Rect,
): void {
  linePixels(x0, y0, x1, y1, (x, y) => {
    if (canPaint(cel, width, x, y, clip)) cel[y * width + x] = value;
  });
}

/** 브레젠험 직선이 지나는 픽셀을 (x0, y0)부터 차례로 visit에 넘긴다. 이웃한 두 픽셀은 8방향으로 붙어 있다. */
export function linePixels(x0: number, y0: number, x1: number, y1: number, visit: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    visit(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

/** (x, y)와 같은 값으로 상하좌우 연결된 영역을 value로 채운다. clip 경계를 넘어 퍼지지 않는다. */
export function floodFill(cel: Uint8Array, width: number, x: number, y: number, value: number, clip?: Rect): void {
  if (!canPaint(cel, width, x, y, clip)) return;
  const target = cel[y * width + x];
  if (target === value) return;
  const stack = [y * width + x];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (cel[i] !== target) continue;
    cel[i] = value;
    const column = i % width;
    const row = (i - column) / width;
    if (canPaint(cel, width, column - 1, row, clip)) stack.push(i - 1);
    if (canPaint(cel, width, column + 1, row, clip)) stack.push(i + 1);
    if (canPaint(cel, width, column, row - 1, clip)) stack.push(i - width);
    if (canPaint(cel, width, column, row + 1, clip)) stack.push(i + width);
  }
}

/** cel의 rect 영역 픽셀을 복사한다. 캔버스 밖 부분은 투명이다. */
export function copyRegion(cel: Uint8Array, width: number, rect: Rect): Uint8Array<ArrayBuffer> {
  const pixels = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      if (canPaint(cel, width, rect.x + x, rect.y + y)) pixels[y * rect.width + x] = cel[(rect.y + y) * width + rect.x + x];
    }
  }
  return pixels;
}

/**
 * pixels(rect 크기)를 cel의 rect 위치에 쓴다. 캔버스 밖 부분은 버린다.
 * overwrite가 false면 투명 픽셀은 쓰지 않아 그 자리의 원래 픽셀이 보인다.
 */
export function pasteRegion(cel: Uint8Array, width: number, rect: Rect, pixels: Uint8Array, overwrite: boolean): void {
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const value = pixels[y * rect.width + x];
      if ((overwrite || value !== TRANSPARENT) && canPaint(cel, width, rect.x + x, rect.y + y)) {
        cel[(rect.y + y) * width + rect.x + x] = value;
      }
    }
  }
}
