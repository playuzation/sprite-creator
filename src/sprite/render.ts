import { TRANSPARENT, type Sprite } from './model';

/** 보이는 레이어를 아래에서 위로 겹쳐 프레임의 최종 픽셀 값(0 = 투명)을 구한다. */
export function compositeFrame(sprite: Sprite, frameIndex: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(sprite.width * sprite.height);
  sprite.frames[frameIndex].cels.forEach((cel, layer) => {
    if (!sprite.layers[layer].visible) return;
    for (let i = 0; i < out.length; i++) {
      if (cel[i] !== TRANSPARENT) out[i] = cel[i];
    }
  });
  return out;
}

/** 프레임을 RGBA 픽셀로 그린다. 투명 픽셀은 알파 0이다. */
export function renderFrameRGBA(
  sprite: Sprite,
  frameIndex: number,
  out = new Uint8ClampedArray(sprite.width * sprite.height * 4),
): Uint8ClampedArray<ArrayBuffer> {
  // 픽셀 값별 RGBA 4바이트를 미리 만들어 두고 4바이트 단위로 복사한다 (바이트 순서가 그대로 유지됨).
  const colors = new Uint32Array(sprite.palette.length + 1);
  sprite.palette.forEach((hex, i) => new Uint8Array(colors.buffer).set([...hexToRgb(hex), 255], (i + 1) * 4));
  const target = new Uint32Array(out.buffer, out.byteOffset, out.length / 4);
  const pixels = compositeFrame(sprite, frameIndex);
  for (let i = 0; i < pixels.length; i++) target[i] = colors[pixels[i]];
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}
