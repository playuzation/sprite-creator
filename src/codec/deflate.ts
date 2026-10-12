/** 브라우저 내장 CompressionStream을 이용한 zlib(deflate) 압축/해제 */

export async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 압축을 해제한다. 결과가 maxLength를 넘으면(압축 폭탄 등) 중단하고 오류를 던진다. */
export async function inflate(bytes: Uint8Array<ArrayBuffer>, maxLength: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const out = new Uint8Array(maxLength);
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out.slice(0, length);
    if (length + value.length > maxLength) {
      await reader.cancel();
      throw new RangeError('압축을 푼 데이터가 예상보다 큽니다.');
    }
    out.set(value, length);
    length += value.length;
  }
}
