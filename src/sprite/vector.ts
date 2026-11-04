import { canPaint, drawLine, type Rect } from './draw';
import { TRANSPARENT, type Sprite } from './model';
import { hexToRgb } from './render';

/** 픽셀 좌표의 점 (소수 가능). 픽셀 (i, j)의 중심은 (i + 0.5, j + 0.5)이다. */
export interface Point {
  x: number;
  y: number;
}

/**
 * 점들을 차례로 이은 패스를 frame/layer의 셀에 value 색으로 그린다. clip 밖 픽셀은 바꾸지 않는다.
 * - 안티에일리어싱 끔: 각 점이 놓인 픽셀을 브레젠험 직선으로 잇는다.
 * - 안티에일리어싱 켬: 선이 픽셀에 걸친 비율만큼 선 색과 그 아래 보이는 색을 섞은 색을, 두 색 사이에 있는 팔레트 색으로 칠한다.
 *   픽셀은 팔레트 색만 가질 수 있으므로 사이 색이 없으면 선 색과 아래 색 중 하나로 칠하고,
 *   아래가 투명한 픽셀은 섞을 색이 없어 절반 이상 걸칠 때만 선 색으로 칠한다.
 */
export function drawPath(
  sprite: Sprite,
  frame: number,
  layer: number,
  points: readonly Point[],
  value: number,
  antialias: boolean,
  clip?: Rect,
): void {
  const { width } = sprite;
  const cel = sprite.frames[frame].cels[layer];
  const segments = points.slice(1).map((to, i) => [points[i], to] as const);
  if (!antialias) {
    for (const [from, to] of segments) {
      drawLine(cel, width, Math.floor(from.x), Math.floor(from.y), Math.floor(to.x), Math.floor(to.y), value, clip);
    }
    return;
  }

  // 픽셀마다 선이 걸친 비율. 선분이 만나는 곳에서 진해지지 않도록 큰 값을 쓴다.
  const coverage = new Map<number, number>();
  for (const [from, to] of segments) {
    wuLine(from, to, (x, y, amount) => {
      if (amount <= 0 || !canPaint(cel, width, x, y, clip)) return;
      const index = y * width + x;
      coverage.set(index, Math.max(coverage.get(index) ?? 0, amount));
    });
  }
  const colors = sprite.palette.map(hexToRgb);
  const stroke = colors[value - 1];
  for (const [index, amount] of coverage) {
    const below = visibleAt(sprite, frame, layer, index);
    if (below === TRANSPARENT) {
      if (amount >= 0.5) cel[index] = value;
      continue;
    }
    const blended = blendColor(colors, stroke, colors[below - 1], amount) + 1;
    // 보이는 색과 같으면 그대로 둔다 (아래 레이어 색을 현재 레이어에 덮어 그리지 않음).
    if (blended !== below) cel[index] = blended;
  }
}

/** 샤오린 우(Xiaolin Wu) 방식의 직선: 주축의 픽셀마다 선이 걸친 비율을 인접한 두 픽셀에 나눠 plot으로 넘긴다. */
function wuLine(from: Point, to: Point, plot: (x: number, y: number, amount: number) => void): void {
  // 픽셀 중심이 정수 좌표에 오도록 옮긴다.
  let [x0, y0, x1, y1] = [from.x - 0.5, from.y - 0.5, to.x - 0.5, to.y - 0.5];
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) [x0, y0, x1, y1] = [y0, x0, y1, x1];
  if (x0 > x1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const gradient = x1 === x0 ? 0 : (y1 - y0) / (x1 - x0);
  for (let x = Math.round(x0); x <= Math.round(x1); x++) {
    const y = y0 + gradient * (x - x0);
    const row = Math.floor(y);
    const lower = y - row;
    if (steep) {
      plot(row, x, 1 - lower);
      plot(row + 1, x, lower);
    } else {
      plot(x, row, 1 - lower);
      plot(x, row + 1, lower);
    }
  }
}

/** 현재 레이어부터 아래로 내려가며 index 위치에 보이는 픽셀 값 (현재 레이어는 숨겨져 있어도 포함) */
function visibleAt(sprite: Sprite, frame: number, layer: number, index: number): number {
  for (let l = layer; l >= 0; l--) {
    const value = sprite.frames[frame].cels[l][index];
    if (value !== TRANSPARENT && (l === layer || sprite.layers[l].visible)) return value;
  }
  return TRANSPARENT;
}

/**
 * stroke를 amount만큼, base를 나머지만큼 섞은 색을 나타낼 팔레트 색의 인덱스.
 * 두 색을 잇는 선분 가까이(거리가 선분 길이의 10% 이내) 있는 색 중에서 섞인 비율이 가장 비슷한 색을 고른다.
 * 엉뚱한 색조가 끼어들지 않게 하려는 것이며, 두 색 자체도 후보이므로 사이 색이 없으면 둘 중 하나가 된다 (같으면 선 색).
 */
function blendColor(colors: [number, number, number][], stroke: number[], base: number[], amount: number): number {
  const direction = base.map((channel, i) => channel - stroke[i]);
  const squaredLength = direction.reduce((sum, d) => sum + d * d, 0);
  let best = -1;
  let bestError = Infinity;
  let bestT = Infinity;
  colors.forEach((color, i) => {
    const offset = color.map((channel, k) => channel - stroke[k]);
    // t: 선 색(0)에서 아래 색(1)까지 선분 위의 위치, apart: 선분에서 떨어진 거리의 제곱
    const t = squaredLength === 0 ? 0 : offset.reduce((sum, o, k) => sum + o * direction[k], 0) / squaredLength;
    const apart = offset.reduce((sum, o, k) => sum + (o - t * direction[k]) ** 2, 0);
    if (t < 0 || t > 1 || apart > 0.01 * squaredLength) return;
    const error = Math.abs(t - (1 - amount));
    if (error < bestError || (error === bestError && t < bestT)) [best, bestError, bestT] = [i, error, t];
  });
  return best;
}
