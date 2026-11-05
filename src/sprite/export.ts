import { encodeAvif, encodeGif, encodeWebp } from '../codec';
import { frameDuration, hexToRgb, type Sprite } from './model';
import { compositeFrame, renderFrameRGBA } from './render';
import { pathData } from './vector';

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
    delaysCs: sprite.frames.map((_, i) => Math.max(1, Math.round(frameDuration(sprite, i) / 10))),
    transparentIndex: 0,
  });
}

/** 고른 프레임들을 무손실 WebP로 만든다. 하나면 정지 이미지, 여럿이면 애니메이션이다. */
export function exportWebp(sprite: Sprite, frames: number[]): Uint8Array<ArrayBuffer> {
  return encodeWebp({ width: sprite.width, height: sprite.height, frames: rgbaFrames(sprite, frames), frameMs: frameMs(sprite), frameDurations: frames.map((i) => frameDuration(sprite, i)) });
}

/** 고른 프레임들을 AVIF로 만든다 (브라우저의 AV1 인코딩 필요). 하나면 정지 이미지, 여럿이면 애니메이션이다. */
export function exportAvif(sprite: Sprite, frames: number[]): Promise<Uint8Array<ArrayBuffer>> {
  return encodeAvif({ width: sprite.width, height: sprite.height, frames: rgbaFrames(sprite, frames), frameMs: frameMs(sprite), frameDurations: frames.map((i) => frameDuration(sprite, i)) });
}

/** 보이는 레이어가 모두 벡터 레이어인지. 이때만 SVG로 내보낼 수 있다. */
export function canExportSvg(sprite: Sprite): boolean {
  return sprite.layers.every((layer) => !layer.visible || layer.kind === 'vector');
}

/**
 * 프레임의 벡터 도형을 SVG로 만든다. 보이는 레이어가 모두 벡터 레이어여야 한다.
 * 도형은 아래 레이어부터 그리는 순서대로 담고, 안티에일리어싱을 끈 도형은 가장자리를 부드럽게 하지 않는다(crispEdges).
 * 벡터 그대로 담으므로 확대해도 매끄럽고, 팔레트 색으로 섞는 픽셀 그림과 달리 안티에일리어싱은 보는 프로그램이 한다.
 */
export function exportSvg(sprite: Sprite, frame: number): string {
  if (!canExportSvg(sprite)) throw new Error('보이는 레이어가 모두 벡터 레이어일 때만 SVG로 내보낼 수 있습니다.');
  const { width, height } = sprite;
  const shapes = sprite.layers.flatMap((layer, i) => (layer.visible ? sprite.frames[frame].shapes[i] : []));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke-linecap="round" stroke-linejoin="round">`,
    ...shapes.map((shape) => {
      const crisp = shape.antialias ? '' : ' shape-rendering="crispEdges"';
      return `<path d="${pathData(shape)}" stroke="${sprite.palette[shape.color - 1]}" stroke-width="${shape.width}"${crisp}/>`;
    }),
    '</svg>',
    '',
  ].join('\n');
}
