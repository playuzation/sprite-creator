/**
 * codec 패키지: 스프라이트를 모르는 범용 인코딩 도구 (의존 트리의 말단).
 * 다른 패키지를 import하지 않는다.
 */
export { encodeGif, type GifOptions } from './gif';
export { deflate, inflate } from './deflate';
export { bytesToBase64, base64ToBytes } from './base64';
