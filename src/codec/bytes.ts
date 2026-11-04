/** 바이너리 파일을 만들 때 쓰는 작은 도구 */

export function concat(...parts: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function ascii(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

/** 빅 엔디언 16/32비트 정수 */
export const u16be = (value: number) => Uint8Array.of(value >>> 8, value & 0xff);
export const u32be = (value: number) => Uint8Array.of(value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);

/** 리틀 엔디언 16/24/32비트 정수 */
export const u16le = (value: number) => Uint8Array.of(value & 0xff, value >>> 8);
export const u24le = (value: number) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, value >>> 16);
export const u32le = (value: number) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24);
