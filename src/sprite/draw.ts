/** 한 셀(레이어의 픽셀 배열)에 그리는 알고리즘. 캔버스 밖 좌표는 무시한다. */

/** 브레젠험 직선: 포인터가 빠르게 움직여도 픽셀 사이가 끊기지 않게 잇는다. */
export function drawLine(cel: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number, value: number): void {
  const height = cel.length / width;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) cel[y0 * width + x0] = value;
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

/** (x, y)와 같은 값으로 상하좌우 연결된 영역을 value로 채운다. */
export function floodFill(cel: Uint8Array, width: number, x: number, y: number, value: number): void {
  if (x < 0 || x >= width || y < 0 || y * width >= cel.length) return;
  const target = cel[y * width + x];
  if (target === value) return;
  const stack = [y * width + x];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (cel[i] !== target) continue;
    cel[i] = value;
    const column = i % width;
    if (column > 0) stack.push(i - 1);
    if (column < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i + width < cel.length) stack.push(i + width);
  }
}
