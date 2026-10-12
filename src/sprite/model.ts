/**
 * 스프라이트 문서 모델.
 * 픽셀 값 0은 투명(빈 배경), n(1~32)은 palette[n - 1] 색을 뜻한다.
 * 레이어 구성(이름/표시 여부/순서)은 모든 프레임이 공유하고, 픽셀(셀)은 프레임마다 따로 가진다.
 */

export const DEFAULT_SIZE = 128;
export const MAX_SIZE = 1024;
export const MAX_COLORS = 32;
export const MIN_FPS = 1;
export const MAX_FPS = 30;
export const TRANSPARENT = 0;

export interface Layer {
  name: string;
  visible: boolean;
}

/** 한 시점의 그림. cels[i]는 layers[i]의 픽셀 (width * height, 행 우선) */
export interface Frame {
  cels: Uint8Array<ArrayBuffer>[];
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
    layers: [{ name: '레이어 1', visible: true }],
    frames: [{ cels: [new Uint8Array(width * height)] }],
    fps: 10,
  };
}

/** 왼쪽 위를 기준으로 캔버스 크기를 바꾼다. 벗어난 픽셀은 잘리고 늘어난 영역은 투명하다. */
export function resizeSprite(sprite: Sprite, width: number, height: number): void {
  assertSize(width, height);
  const copyWidth = Math.min(width, sprite.width);
  const copyHeight = Math.min(height, sprite.height);
  for (const frame of sprite.frames) {
    frame.cels = frame.cels.map((cel) => {
      const resized = new Uint8Array(width * height);
      for (let y = 0; y < copyHeight; y++) {
        resized.set(cel.subarray(y * sprite.width, y * sprite.width + copyWidth), y * width);
      }
      return resized;
    });
  }
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

/** 색을 지운다. 그 색을 쓰던 픽셀은 투명해지고, 뒤쪽 색을 쓰던 픽셀은 한 칸씩 당겨진다. */
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
  }
}

/** 모든 프레임의 index 위치에 빈 레이어를 넣는다. */
export function addLayer(sprite: Sprite, index: number): void {
  sprite.layers.splice(index, 0, { name: `레이어 ${sprite.layers.length + 1}`, visible: true });
  for (const frame of sprite.frames) frame.cels.splice(index, 0, new Uint8Array(sprite.width * sprite.height));
}

export function removeLayer(sprite: Sprite, index: number): void {
  if (sprite.layers.length <= 1) throw new RangeError('레이어는 최소 1개가 필요합니다.');
  sprite.layers.splice(index, 1);
  for (const frame of sprite.frames) frame.cels.splice(index, 1);
}

/** 레이어 순서를 바꾼다. 모든 프레임에 똑같이 적용된다. */
export function moveLayer(sprite: Sprite, from: number, to: number): void {
  move(sprite.layers, from, to);
  for (const frame of sprite.frames) move(frame.cels, from, to);
}

/** index 프레임의 모든 레이어를 복사해 바로 뒤에 새 프레임으로 넣는다. */
export function duplicateFrame(sprite: Sprite, index: number): void {
  sprite.frames.splice(index + 1, 0, { cels: sprite.frames[index].cels.map((cel) => cel.slice()) });
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
