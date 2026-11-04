import { encodeAvif, encodeGif, encodeWebp } from '../codec';
import type { Sprite } from './model';
import { compositeFrame, hexToRgb, renderFrameRGBA } from './render';

/** 이미지·애니메이션 파일로 내보내기. 모두 투명 배경이고, 애니메이션은 무한 반복한다. */

const frameMs = (sprite: Sprite) => Math.round(1000 / sprite.fps);
const rgbaFrames = (sprite: Sprite, frames: number[]) => frames.map((frame) => renderFrameRGBA(sprite, frame));

/** 모든 프레임을 GIF로 만든다. 픽셀 값이 그대로 GIF 색 인덱스가 된다(0 = 투명). */
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

/** 고른 프레임들을 무손실 WebP로 만든다. 하나면 정지 이미지, 여럿이면 애니메이션이다. */
export function exportWebp(sprite: Sprite, frames: number[]): Uint8Array<ArrayBuffer> {
  return encodeWebp({ width: sprite.width, height: sprite.height, frames: rgbaFrames(sprite, frames), frameMs: frameMs(sprite) });
}

/** 고른 프레임들을 AVIF로 만든다 (브라우저의 AV1 인코딩 필요). 하나면 정지 이미지, 여럿이면 애니메이션이다. */
export function exportAvif(sprite: Sprite, frames: number[]): Promise<Uint8Array<ArrayBuffer>> {
  return encodeAvif({ width: sprite.width, height: sprite.height, frames: rgbaFrames(sprite, frames), frameMs: frameMs(sprite) });
}
