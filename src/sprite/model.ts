/**
 * 스프라이트 문서 모델.
 * 픽셀 값 0은 투명(빈 배경), n(1~32)은 palette[n - 1] 색을 뜻한다.
 * 레이어 구성(이름/표시 여부/종류/순서)은 모든 프레임이 공유하고, 픽셀(셀)과 벡터 도형은 프레임마다 따로 가진다.
 * 픽셀 레이어는 셀에 픽셀을 칠하고, 벡터 레이어는 도형을 픽셀로 굽지 않고 보관해 합성할 때마다 픽셀로 그린다.
 * 벡터 도구의 패스는 픽셀과 따로 문서에 저장되며, 픽셀 레이어에 그릴 때(drawPath) 픽셀로 바뀐다.
 */

export const DEFAULT_SIZE = 128;
export const MAX_SIZE = 1024;
export const MAX_COLORS = 32;
export const MIN_FPS = 1;
export const MAX_FPS = 30;
export const MIN_FRAME_DURATION = 10;
export const MAX_FRAME_DURATION = 600000;
export const TRANSPARENT = 0;
export const MAX_STROKE_WIDTH = 32;

export type LayerKind = 'pixel' | 'vector';

export interface Layer {
  name: string;
  visible: boolean;
  kind: LayerKind;
}

/**
 * 한 시점의 그림. cels[i]는 layers[i]의 픽셀 (width * height, 행 우선. 벡터 레이어는 쓰지 않아 투명),
 * shapes[i]는 layers[i]가 벡터 레이어일 때의 도형들이다 (앞쪽부터 그림. 픽셀 레이어는 빈 목록).
 */
export interface Frame {
  /** 표시 시간(ms). 없으면 문서의 기본 FPS를 따른다. */
  duration?: number;
  cels: Uint8Array<ArrayBuffer>[];
  shapes: VectorShape[][];
}

/** 픽셀 좌표의 점 (소수 가능). 픽셀 (i, j)의 중심은 (i + 0.5, j + 0.5)이다. */
export interface Point {
  x: number;
  y: number;
}

/** 벡터 도구의 패스 */
export interface VectorPath {
  points: Point[];
  /** 점들을 모두 지나는 부드러운 곡선으로 그릴지 */
  curve: boolean;
  /** 선 두께 (픽셀, 1~MAX_STROKE_WIDTH) */
  width: number;
  antialias: boolean;
}

/** 벡터 레이어의 도형: 패스와 그 색 (픽셀 값처럼 n = palette[n - 1]) */
export interface VectorShape extends VectorPath {
  color: number;
}

export interface Sprite {
  width: number;
  height: number;
  /** '#rrggbb' 색 1~32개 */
  palette: string[];
  /** 0번이 가장 아래에 그려진다. */
  layers: Layer[];
  frames: Frame[];
  fps: number;
  path: VectorPath;
}

/** DawnBringer 16 팔레트 */
const DEFAULT_PALETTE = [
  '#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161',
  '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6',
];

export function isValidSize(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_SIZE;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}

function assertSize(width: number, height: number): void {
  if (!isValidSize(width) || !isValidSize(height)) {
    throw new RangeError(`캔버스 크기는 1~${MAX_SIZE} 사이의 정수여야 합니다.`);
  }
}

/** 투명 배경의 빈 스프라이트 (레이어 1개, 프레임 1개) */
export function createSprite(width = DEFAULT_SIZE, height = DEFAULT_SIZE): Sprite {
  assertSize(width, height);
  return {
    width,
    height,
    palette: [...DEFAULT_PALETTE],
    layers: [{ name: '레이어 1', visible: true, kind: 'pixel' }],
    frames: [{ cels: [new Uint8Array(width * height)], shapes: [[]] }],
    fps: 10,
    path: createPath(),
  };
}

/** 점이 없는 기본 패스 (직선, 두께 1, 안티에일리어싱 끔) */
export function createPath(): VectorPath {
  return { points: [], curve: false, width: 1, antialias: false };
}

/** 도형을 점 목록까지 복사한다. */
export function copyShape(shape: VectorShape): VectorShape {
  return { ...shape, points: shape.points.map(({ x, y }) => ({ x, y })) };
}

/** 캔버스 크기를 바꿀 때 그림을 붙여 둘 기준. x, y는 0(왼쪽·위), 0.5(가운데), 1(오른쪽·아래) */
export interface Anchor {
  x: number;
  y: number;
}

/**
 * 그림은 그대로 두고 캔버스 크기를 바꾼다(캔버스 변경). 늘어난 곳은 투명하게 채우고, 벗어난 픽셀은 잘린다.
 * 그림은 anchor 쪽에 붙는다. 가운데 기준에서 차이가 홀수면 오른쪽·아래쪽에 한 픽셀 더 붙이거나 자른다.
 * 벡터 도형과 패스도 그림과 함께 옮긴다.
 */
export function resizeCanvas(sprite: Sprite, width: number, height: number, anchor: Anchor = { x: 0, y: 0 }): void {
  assertSize(width, height);
  // 원래 그림의 왼쪽 위가 새 캔버스에서 놓일 위치
  const dx = Math.trunc((width - sprite.width) * anchor.x);
  const dy = Math.trunc((height - sprite.height) * anchor.y);
  const [left, right] = [Math.max(0, dx), Math.min(width, dx + sprite.width)];
  const shift = ({ x, y }: Point) => ({ x: x + dx, y: y + dy });
  for (const frame of sprite.frames) {
    frame.cels = frame.cels.map((cel) => {
      const resized = new Uint8Array(width * height);
      for (let y = Math.max(0, dy); y < Math.min(height, dy + sprite.height); y++) {
        const row = (y - dy) * sprite.width - dx;
        if (right > left) resized.set(cel.subarray(row + left, row + right), y * width + left);
      }
      return resized;
    });
    for (const shape of frame.shapes.flat()) shape.points = shape.points.map(shift);
  }
  sprite.path.points = sprite.path.points.map(shift);
  sprite.width = width;
  sprite.height = height;
}

/**
 * 그림을 새 크기로 늘리거나 줄인다(해상도 변경). 너비와 높이를 따로 바꿔 비율을 바꿀 수도 있다.
 * 픽셀은 팔레트 색만 가질 수 있으므로 색을 섞지 않고, 새 픽셀마다 그 중심에 가장 가까운 원래 픽셀을 가져온다(최근접 이웃).
 * 벡터 도형과 패스의 점도 같은 비율로 옮기고, 도형의 선 두께는 그림과 함께 굵어지거나 가늘어진다
 * (가로·세로 비율이 다르면 두 비율의 기하 평균, 1~MAX_STROKE_WIDTH 정수로 반올림).
 */
export function scaleSprite(sprite: Sprite, width: number, height: number): void {
  assertSize(width, height);
  const columns = Array.from({ length: width }, (_, x) => Math.floor(((x + 0.5) * sprite.width) / width));
  const rows = Array.from({ length: height }, (_, y) => Math.floor(((y + 0.5) * sprite.height) / height));
  const [scaleX, scaleY] = [width / sprite.width, height / sprite.height];
  const scale = ({ x, y }: Point) => ({ x: x * scaleX, y: y * scaleY });
  for (const frame of sprite.frames) {
    frame.cels = frame.cels.map((cel) => {
      const scaled = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) scaled[y * width + x] = cel[rows[y] * sprite.width + columns[x]];
      }
      return scaled;
    });
    for (const shape of frame.shapes.flat()) {
      shape.points = shape.points.map(scale);
      shape.width = Math.min(MAX_STROKE_WIDTH, Math.max(1, Math.round(shape.width * Math.sqrt(scaleX * scaleY))));
    }
  }
  sprite.path.points = sprite.path.points.map(scale);
  sprite.width = width;
  sprite.height = height;
}

/** 색을 추가하고 새 색의 팔레트 인덱스를 돌려준다. */
export function addColor(sprite: Sprite, hex: string): number {
  if (sprite.palette.length >= MAX_COLORS) throw new RangeError(`팔레트는 최대 ${MAX_COLORS}색입니다.`);
  sprite.palette.push(toColor(hex));
  return sprite.palette.length - 1;
}

export function setColor(sprite: Sprite, index: number, hex: string): void {
  sprite.palette[index] = toColor(hex);
}

/**
 * 색을 지운다. 그 색을 쓰던 픽셀은 투명해지고 그 색의 도형은 지워진다.
 * 뒤쪽 색을 쓰던 픽셀과 도형은 한 칸씩 당겨진다.
 */
export function removeColor(sprite: Sprite, index: number): void {
  if (sprite.palette.length <= 1) throw new RangeError('팔레트에는 최소 1색이 필요합니다.');
  sprite.palette.splice(index, 1);
  const removed = index + 1;
  for (const frame of sprite.frames) {
    for (const cel of frame.cels) {
      for (let i = 0; i < cel.length; i++) {
        if (cel[i] === removed) cel[i] = TRANSPARENT;
        else if (cel[i] > removed) cel[i]--;
      }
    }
    frame.shapes = frame.shapes.map((shapes) => shapes.filter((shape) => shape.color !== removed));
    for (const shape of frame.shapes.flat()) if (shape.color > removed) shape.color--;
  }
}

/** 모든 프레임의 index 위치에 빈 레이어(픽셀 또는 벡터)를 넣는다. */
export function addLayer(sprite: Sprite, index: number, kind: LayerKind = 'pixel'): void {
  sprite.layers.splice(index, 0, { name: `레이어 ${sprite.layers.length + 1}`, visible: true, kind });
  for (const frame of sprite.frames) {
    frame.cels.splice(index, 0, new Uint8Array(sprite.width * sprite.height));
    frame.shapes.splice(index, 0, []);
  }
}

export function removeLayer(sprite: Sprite, index: number): void {
  if (sprite.layers.length <= 1) throw new RangeError('레이어는 최소 1개가 필요합니다.');
  sprite.layers.splice(index, 1);
  for (const frame of sprite.frames) {
    frame.cels.splice(index, 1);
    frame.shapes.splice(index, 1);
  }
}

/** 레이어 순서를 바꾼다. 모든 프레임에 똑같이 적용된다. */
export function moveLayer(sprite: Sprite, from: number, to: number): void {
  move(sprite.layers, from, to);
  for (const frame of sprite.frames) {
    move(frame.cels, from, to);
    move(frame.shapes, from, to);
  }
}

/** index 프레임의 모든 레이어(픽셀과 도형)를 복사해 바로 뒤에 새 프레임으로 넣는다. */
export function duplicateFrame(sprite: Sprite, index: number): void {
  const { cels, shapes, duration } = sprite.frames[index];
  sprite.frames.splice(index + 1, 0, { cels: cels.map((cel) => cel.slice()), shapes: shapes.map((list) => list.map(copyShape)), ...(duration === undefined ? {} : { duration }) });
}

export function removeFrame(sprite: Sprite, index: number): void {
  if (sprite.frames.length <= 1) throw new RangeError('프레임은 최소 1개가 필요합니다.');
  sprite.frames.splice(index, 1);
}

function toColor(hex: string): string {
  if (!isHexColor(hex)) throw new TypeError(`올바르지 않은 색입니다: ${hex}`);
  return hex.toLowerCase();
}

function move<T>(list: T[], from: number, to: number): void {
  list.splice(to, 0, ...list.splice(from, 1));
}

/** 개별 시간이 없는 기존 프레임은 기본 FPS로 재생한다. */
export function frameDuration(sprite: Sprite, index: number): number {
  return sprite.frames[index].duration ?? Math.round(1000 / sprite.fps);
}

export function isFrameDuration(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_FRAME_DURATION && (value as number) <= MAX_FRAME_DURATION;
}

export function setFrameDuration(sprite: Sprite, index: number, duration?: number): void {
  if (duration !== undefined && !isFrameDuration(duration)) {
    throw new Error(`표시 시간은 ${MIN_FRAME_DURATION}~${MAX_FRAME_DURATION}ms 사이의 정수여야 합니다.`);
  }
  if (duration === undefined) delete sprite.frames[index].duration;
  else sprite.frames[index].duration = duration;
}
