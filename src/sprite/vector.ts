import { canPaint, linePixels, type Rect } from './draw';
import { TRANSPARENT, hexToRgb, type Point, type VectorPath } from './model';

/**
 * 패스가 지나는 점들. 곡선이면 모든 점을 지나는 부드러운 곡선(캣멀-롬)을 잘게 나눈 점들이다.
 * 픽셀 그리기와 화면의 미리보기가 같은 점들을 쓴다.
 */
export function pathPoints(path: VectorPath): Point[] {
  const { points } = path;
  if (!path.curve || points.length < 3) return points;
  const result = [points[0]];
  for (const [p1, c1, c2, p2] of bezierSegments(points)) {
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

/** 곡선의 구간(p1 → p2)마다 앞뒤 이웃 점으로 만든 3차 베지어 [p1, 조절점 1, 조절점 2, p2] */
function bezierSegments(points: Point[]): [Point, Point, Point, Point][] {
  return points.slice(0, -1).map((p1, i) => {
    const [p0, p2, p3] = [points[i - 1] ?? p1, points[i + 1], points[i + 2] ?? points[i + 1]];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    return [p1, c1, c2, p2];
  });
}

/** 이웃한 점을 이은 선분들. 점이 하나면 길이가 0인 선분 하나로, 그 자리에 점이 찍힌다. */
function segmentsOf(points: Point[]): [Point, Point][] {
  return points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((to, i) => [points[i], to]);
}

/** SVG path 데이터 (곡선은 pathPoints와 같은 3차 베지어, 점이 하나면 길이 0인 선) */
export function pathData(path: VectorPath): string {
  const { points } = path;
  const xy = ({ x, y }: Point) => `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
  if (path.curve && points.length >= 3) {
    return `M${xy(points[0])}${bezierSegments(points).map(([, c1, c2, p2]) => `C${xy(c1)} ${xy(c2)} ${xy(p2)}`).join('')}`;
  }
  return `M${(points.length === 1 ? [points[0], points[0]] : points).map(xy).join('L')}`;
}

/** 점 p와 패스(곡선이면 곡선) 사이의 거리 */
export function distanceToPath(path: VectorPath, p: Point): number {
  return Math.min(...segmentsOf(pathPoints(path)).map(([a, b]) => distanceToSegment(p.x, p.y, a, b)));
}

/**
 * 패스를 cel(한 행이 width 픽셀)에 value 색으로 그린다. clip 밖 픽셀은 바꾸지 않는다.
 * below(i)는 i번 픽셀에 지금 보이는 값으로, 안티에일리어싱에서 선 색과 섞을 아래 색이다.
 * - 안티에일리어싱 끔: 점들을 브레젠험 직선으로 이은 1픽셀 뼈대를 따라 두께만큼 둥근 붓을 찍는다.
 * - 안티에일리어싱 켬: 픽셀 중심과 선 사이 거리로 선이 걸친 비율을 구하고, 그만큼 선 색과 그 아래 보이는 색을 섞은 색을
 *   두 색 사이에 있는 팔레트 색으로 칠한다. 픽셀은 팔레트 색만 가질 수 있으므로 사이 색이 없으면 선 색과 아래 색 중 하나가 되고,
 *   아래가 투명한 픽셀은 섞을 색이 없어 절반 이상 걸칠 때만 선 색으로 칠한다.
 */
export function strokePath(
  cel: Uint8Array,
  width: number,
  palette: string[],
  path: VectorPath,
  value: number,
  below: (index: number) => number,
  clip?: Rect,
): void {
  const height = cel.length / width;
  const points = pathPoints(path);
  if (points.length === 0) return;
  const segments = segmentsOf(points);
  if (!path.antialias) {
    // 뼈대를 따라 한 픽셀씩 붓을 옮겨 찍는다. 처음에만 붓 전체를, 그다음부터는 새로 덮이는 가장자리만 칠한다.
    const brush = roundBrush(path.width);
    const key = (x: number, y: number) => x * 1024 + y;
    const inBrush = new Set(brush.map(([x, y]) => key(x, y)));
    const edges = new Map<number, [number, number][]>();
    const edge = (sx: number, sy: number) => {
      if (!edges.has(key(sx, sy))) edges.set(key(sx, sy), brush.filter(([x, y]) => !inBrush.has(key(x + sx, y + sy))));
      return edges.get(key(sx, sy))!;
    };
    let last: Point | undefined;
    for (const [from, to] of segments) {
      linePixels(Math.floor(from.x), Math.floor(from.y), Math.floor(to.x), Math.floor(to.y), (x, y) => {
        for (const [dx, dy] of last ? edge(x - last.x, y - last.y) : brush) {
          if (canPaint(cel, width, x + dx, y + dy, clip)) cel[(y + dy) * width + x + dx] = value;
        }
        last = { x, y };
      });
    }
    return;
  }

  // 픽셀마다 선이 걸친 비율(패스를 둘러싼 직사각형 영역만 담음). 선분이 만나는 곳에서 진해지지 않도록 큰 값을 쓴다.
  const half = path.width / 2;
  const range = (values: number[], size: number) => [
    Math.max(0, Math.floor(values.reduce((a, b) => Math.min(a, b)) - half - 1)),
    Math.min(size - 1, Math.floor(values.reduce((a, b) => Math.max(a, b)) + half + 1)),
  ];
  const [left, right] = range(points.map((p) => p.x), width);
  const [top, bottom] = range(points.map((p) => p.y), height);
  const span = Math.max(0, right - left + 1);
  const coverage = new Float64Array(span * Math.max(0, bottom - top + 1));
  // 선이 걸칠 수 있는 거리(half + 0.5)에 계산 오차를 넉넉히 더한 값
  const reach = half + 1.5;
  for (const [a, b] of segments) {
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const [x0, x1] = range([a.x, b.x], width);
    const [y0, y1] = range([a.y, b.y], height);
    for (let y = y0; y <= y1; y++) {
      // 이 행에서는 선분 중 세로로 reach 안에 드는 부분(t0~t1)의 좌우 reach 안만 본다 (긴 사선에서 빈 곳을 훑지 않음).
      const [u, v] = dy === 0 ? [0, 1] : [(y + 0.5 - reach - a.y) / dy, (y + 0.5 + reach - a.y) / dy];
      const [t0, t1] = [Math.max(0, Math.min(u, v)), Math.min(1, Math.max(u, v))];
      if (t0 > t1) continue;
      const from = Math.max(x0, Math.floor(a.x + Math.min(t0 * dx, t1 * dx) - reach));
      const to = Math.min(x1, Math.ceil(a.x + Math.max(t0 * dx, t1 * dx) + reach));
      for (let x = from; x <= to; x++) {
        const local = (y - top) * span + x - left;
        if (coverage[local] === 1) continue; // 이미 다 덮인 픽셀
        const amount = Math.min(1, half + 0.5 - distanceToSegment(x + 0.5, y + 0.5, a, b));
        if (amount > coverage[local] && canPaint(cel, width, x, y, clip)) coverage[local] = amount;
      }
    }
  }
  const colors = palette.map(hexToRgb);
  const stroke = colors[value - 1];
  for (let local = 0; local < coverage.length; local++) {
    const amount = coverage[local];
    if (amount <= 0) continue;
    const index = (top + Math.floor(local / span)) * width + left + (local % span);
    const base = below(index);
    if (base === TRANSPARENT) {
      if (amount >= 0.5) cel[index] = value;
      continue;
    }
    const blended = blendColor(colors, stroke, colors[base - 1], amount) + 1;
    // 보이는 색과 같으면 그대로 둔다 (아래 레이어 색을 현재 레이어에 덮어 그리지 않음).
    if (blended !== base) cel[index] = blended;
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

/** 점 (x, y)와 선분 ab 사이의 거리 (픽셀마다 부르므로 객체를 만들지 않는다) */
function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const squaredLength = dx * dx + dy * dy;
  const t = squaredLength === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / squaredLength));
  return Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
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
