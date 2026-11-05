import type { Rect } from './draw';
import { TRANSPARENT, hexToRgb, type Sprite, type VectorPath, type VectorShape } from './model';
import { strokePath } from './vector';

/**
 * 보이는 레이어를 아래에서 위로 겹쳐 프레임의 최종 픽셀 값(0 = 투명)을 구한다. count를 주면 아래쪽 count개 레이어만 겹친다.
 * 벡터 레이어는 겹칠 때마다 도형을 픽셀로 그린다 (안티에일리어싱은 그 아래에 보이는 그림과 섞음).
 */
export function compositeFrame(sprite: Sprite, frameIndex: number, count = sprite.layers.length): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(sprite.width * sprite.height);
  const frame = sprite.frames[frameIndex];
  for (let layer = 0; layer < count; layer++) {
    if (!sprite.layers[layer].visible) continue;
    const cel = sprite.layers[layer].kind === 'vector' ? drawShapes(sprite, frame.shapes[layer], out) : frame.cels[layer];
    const mask = sprite.layers[layer].maskEnabled === false ? undefined : frame.masks?.[layer];
    for (let i = 0; i < out.length; i++) {
      if (cel[i] !== TRANSPARENT && (!mask || mask[i])) out[i] = cel[i];
    }
  }
  return out;
}

/**
 * 벡터 레이어(도형 목록)마다 마지막으로 그린 픽셀. 화면은 바뀔 때마다 모든 레이어를 다시 합성하므로,
 * 도형·팔레트·캔버스 크기와 (안티에일리어싱 도형이 있으면) 아래 그림까지 같으면 다시 그리지 않고 쓴다.
 */
const drawn = new WeakMap<VectorShape[], { key: string; base: Uint8Array | undefined; cel: Uint8Array }>();

/** 벡터 레이어의 도형들을 앞쪽부터 그린 픽셀. base는 그 아래에 보이는 그림이다. */
function drawShapes(sprite: Sprite, shapes: VectorShape[], base: Uint8Array): Uint8Array {
  const key = JSON.stringify([sprite.width, sprite.height, sprite.palette, shapes]);
  const blends = shapes.some((shape) => shape.antialias);
  const last = drawn.get(shapes);
  if (last?.key === key && (!blends || sameBytes(last.base!, base))) return last.cel;
  const cel = new Uint8Array(base.length);
  for (const shape of shapes) strokePath(cel, sprite.width, sprite.palette, shape, shape.color, (i) => cel[i] || base[i]);
  drawn.set(shapes, { key, base: blends ? base.slice() : undefined, cel });
  return cel;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * 패스를 frame/layer(픽셀 레이어)의 셀에 value 색으로 그린다. clip 밖 픽셀은 바꾸지 않는다.
 * 안티에일리어싱은 현재 레이어의 픽셀(숨겨져 있어도), 없으면 아래 레이어들에 보이는 픽셀과 섞는다.
 */
export function drawPath(sprite: Sprite, frame: number, layer: number, path: VectorPath, value: number, clip?: Rect): void {
  if (sprite.layers[layer].locked) return;
  const cel = sprite.frames[frame].cels[layer];
  const base = compositeFrame(sprite, frame, layer);
  strokePath(cel, sprite.width, sprite.palette, path, value, (i) => cel[i] || base[i], clip);
}

/** 프레임을 RGBA 픽셀로 그린다. 투명 픽셀은 알파 0이다. */
export function renderFrameRGBA(
  sprite: Sprite,
  frameIndex: number,
  out = new Uint8ClampedArray(sprite.width * sprite.height * 4),
): Uint8ClampedArray<ArrayBuffer> {
  return pixelsToRGBA(sprite, compositeFrame(sprite, frameIndex), out);
}

/** 현재 프레임의 한 레이어만 그린다. 숨김 레이어도 내용을 보여주며 적용 중인 마스크는 반영한다. */
export function renderLayerRGBA(
  sprite: Sprite,
  frameIndex: number,
  layer: number,
  out = new Uint8ClampedArray(sprite.width * sprite.height * 4),
): Uint8ClampedArray<ArrayBuffer> {
  const frame = sprite.frames[frameIndex];
  // 벡터 안티에일리어싱의 색은 실제 합성과 같은 아래 그림을 기준으로 한다.
  const pixels = sprite.layers[layer].kind === 'vector'
    ? drawShapes(sprite, frame.shapes[layer], compositeFrame(sprite, frameIndex, layer))
    : frame.cels[layer];
  const mask = sprite.layers[layer].maskEnabled === false ? undefined : frame.masks?.[layer];
  return pixelsToRGBA(sprite, pixels, out, mask);
}

function pixelsToRGBA(
  sprite: Sprite, pixels: Uint8Array, out: Uint8ClampedArray<ArrayBuffer>, mask?: Uint8Array | null,
): Uint8ClampedArray<ArrayBuffer> {
  const colors = new Uint32Array(sprite.palette.length + 1);
  sprite.palette.forEach((hex, i) => new Uint8Array(colors.buffer).set([...hexToRgb(hex), 255], (i + 1) * 4));
  const target = new Uint32Array(out.buffer, out.byteOffset, out.length / 4);
  for (let i = 0; i < pixels.length; i++) target[i] = mask && !mask[i] ? 0 : colors[pixels[i]];
  return out;
}
