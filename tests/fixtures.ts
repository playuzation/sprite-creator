import { createSprite } from '../src/sprite';

/** 픽셀 알고리즘을 작은 격자로 검증하기 위한 문서. 사용자 캔버스 크기 검증과 분리한다. */
export function createPixelFixture(width = 128, height = 128) {
  const sprite = createSprite();
  sprite.width = width;
  sprite.height = height;
  sprite.frames[0].cels[0] = new Uint8Array(width * height);
  return sprite;
}
