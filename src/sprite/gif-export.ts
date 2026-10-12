import { encodeGif } from '../codec';
import type { Sprite } from './model';
import { compositeFrame, hexToRgb } from './render';

/** 모든 프레임을 투명 배경 GIF로 만든다. 픽셀 값이 그대로 GIF 색 인덱스가 된다(0 = 투명). */
export function exportGif(sprite: Sprite): Uint8Array<ArrayBuffer> {
  return encodeGif({
    width: sprite.width,
    height: sprite.height,
    palette: [[0, 0, 0], ...sprite.palette.map(hexToRgb)],
    frames: sprite.frames.map((_, i) => compositeFrame(sprite, i)),
    delayCs: Math.round(100 / sprite.fps),
    transparentIndex: 0,
  });
}
