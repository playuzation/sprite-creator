import { canPaint, drawLine, type Rect } from './draw';
import { TRANSPARENT, type Point, type Sprite, type VectorPath } from './model';
import { hexToRgb } from './render';

/**
 * 패스가 지나는 점들. 곡선이면 모든 점을 지나는 부드러운 곡선(캣멀-롬)을 잘게 나눈 점들이다.
 * 픽셀 그리기와 화면의 미리보기가 같은 점들을 쓴다.
 */
export function pathPoints(path: VectorPath): Point[] {
  const { points } = path;
  if (!path.curve || points.length < 3) return points;
  const result = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    // 앞뒤 이웃 점으로 이 구간(p1 → p2)의 3차 베지어 조절점을 만든다.
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1], points[i + 2] ?? points[i + 1]];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    // 1픽셀 남짓한 간격으로 나눈다.
    const steps = Math.max(1, Math.ceil(distance(p1, c1) + distance(c1, c2) + distance(c2, p2)));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const [a, b, c, d] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
      result.push({ x: a * p1.x + b * c1.x + c * c2.x + d * p2.x, y: a * p1.y + b * c1.y + c * c2.y + d * p2.y });
    }
  }
  return result;
}

/**
 * 패스를 frame/layer의 셀에 value 색으로 그린다. clip 밖 픽셀은 바꾸지 않는다.
 * - 안티에일리어싱 끔: 점들을 브레젠험 직선으로 이은 1픽셀 뼈대를 따라 두께만큼 둥근 붓을 찍는다.
 * - 안티에일리어싱 켬: 픽셀 중심과 선 사이 거리로 선이 걸친 비율을 구하고, 그만큼 선 색과 그 아래 보이는 색을 섞은 색을
 *   두 색 사이에 있는 팔레트 색으로 칠한다. 픽셀은 팔레트 색만 가질 수 있으므로 사이 색이 없으면 선 색과 아래 색 중 하나가 되고,
 *   아래가 투명한 픽셀은 섞을 색이 없어 절반 이상 걸칠 때만 선 색으로 칠한다.
 */
export function drawPath(sprite: Sprite, frame: number, layer: number, path: VectorPath, value: number, clip?: Rect): void {
  const { width, height } = sprite;
  const cel = sprite.frames[frame].cels[layer];
  const points = pathPoints(path);
  const segments = points.slice(1).map((to, i) => [points[i], to] as const);
  if (!path.antialias) {
    const skeleton = new Uint8Array(width * height);
    for (const [from, to] of segments) {
      drawLine(skeleton, width, Math.floor(from.x), Math.floor(from.y), Math.floor(to.x), Math.floor(to.y), 1);
    }
    const brush = roundBrush(path.width);
    skeleton.forEach((on, i) => {
      if (!on) return;
      const [x, y] = [i % width, Math.floor(i / width)];
      for (const [dx, dy] of brush) {
        if (canPaint(cel, width, x + dx, y + dy, clip)) cel[(y + dy) * width + x + dx] = value;
      }
    });
    return;
  }

  // 픽셀마다 선이 걸친 비율. 선분이 만나는 곳에서 진해지지 않도록 큰 값을 쓴다.
  const half = path.width / 2;
  const coverage = new Map<number, number>();
  for (const [a, b] of segments) {
    const left = Math.max(0, Math.floor(Math.min(a.x, b.x) - half - 1));
    const right = Math.min(width - 1, Math.floor(Math.max(a.x, b.x) + half + 1));
    const top = Math.max(0, Math.floor(Math.min(a.y, b.y) - half - 1));
    const bottom = Math.min(height - 1, Math.floor(Math.max(a.y, b.y) + half + 1));
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const amount = Math.min(1, half + 0.5 - distanceToSegment({ x: x + 0.5, y: y + 0.5 }, a, b));
        if (amount <= 0 || !canPaint(cel, width, x, y, clip)) continue;
        const index = y * width + x;
        coverage.set(index, Math.max(coverage.get(index) ?? 0, amount));
      }
    }
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

/** 지름이 size 픽셀인 둥근 붓: 기준 픽셀에서의 오프셋 목록 (1은 한 점, 3은 십자, 클수록 원에 가까움) */
function roundBrush(size: number): [number, number][] {
  const center = (size - 1) / 2;
  const radius = size / 2 - 0.25;
  const offsets: [number, number][] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - center) ** 2 + (y - center) ** 2 <= radius ** 2) offsets.push([x - Math.floor(center), y - Math.floor(center)]);
    }
  }
  return offsets;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 점 p와 선분 ab 사이의 거리 */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const squaredLength = dx * dx + dy * dy;
  const t = squaredLength === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / squaredLength));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
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
