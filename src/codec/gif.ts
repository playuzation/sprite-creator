/** GIF89a 인코더: 인덱스 컬러 프레임들을 투명 배경의 무한 반복 애니메이션 GIF로 만든다. */

export interface GifOptions {
  width: number;
  height: number;
  /** [r, g, b] 색상표 (최대 256색) */
  palette: ReadonlyArray<readonly [number, number, number]>;
  /** 프레임별 색상 인덱스 (width * height) */
  frames: ReadonlyArray<Uint8Array>;
  /** 프레임 간 지연 (1/100초) */
  delayCs: number;
  /** 투명으로 처리할 색상 인덱스 */
  transparentIndex: number;
}

export function encodeGif({ width, height, palette, frames, delayCs, transparentIndex }: GifOptions): Uint8Array<ArrayBuffer> {
  // 전역 색상표 크기는 2^tableBits 여야 한다.
  let tableBits = 1;
  while (1 << tableBits < palette.length) tableBits++;

  const out = new ByteWriter();
  out.ascii('GIF89a');
  out.u16(width);
  out.u16(height);
  out.bytes([0xf0 | (tableBits - 1), 0, 0]); // 전역 색상표 사용 + 8비트 색 해상도, 배경 인덱스, 종횡비
  for (let i = 0; i < 1 << tableBits; i++) out.bytes(palette[i] ?? [0, 0, 0]);
  out.bytes([0x21, 0xff, 0x0b]); // NETSCAPE2.0 확장: 반복 횟수 0 = 무한 반복
  out.ascii('NETSCAPE2.0');
  out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

  const minCodeSize = Math.max(2, tableBits);
  for (const frame of frames) {
    // 그래픽 제어 확장: 처리 방식 2(배경으로 복원)로 이전 프레임이 투명 영역에 남지 않게 한다.
    out.bytes([0x21, 0xf9, 0x04, (2 << 2) | 1]);
    out.u16(delayCs);
    out.bytes([transparentIndex, 0]);
    // 이미지 설명자: 캔버스 전체, 지역 색상표 없음
    out.bytes([0x2c]);
    out.u16(0);
    out.u16(0);
    out.u16(width);
    out.u16(height);
    out.bytes([0, minCodeSize]);
    const data = lzw(frame, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.subarray(i, i + 255);
      out.bytes([block.length]);
      out.bytes(block);
    }
    out.bytes([0]);
  }
  out.bytes([0x3b]);
  return out.result();
}

/** GIF용 가변 길이 LZW 압축 (최대 12비트 코드, 표가 가득 차면 clear 코드로 초기화) */
function lzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const out = new ByteWriter();
  let codeSize = minCodeSize + 1;
  let bits = 0;
  let bitCount = 0;
  const emit = (code: number) => {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.bytes([bits & 0xff]);
      bits >>>= 8;
      bitCount -= 8;
    }
  };

  let table = new Map<number, number>();
  let nextCode = endCode + 1;
  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const key = (prefix << 8) | indices[i];
    const code = table.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      table = new Map();
      nextCode = endCode + 1;
      codeSize = minCodeSize + 1;
    } else {
      // 디코더는 한 단계 늦게 표를 채우므로, 새 코드가 현재 비트 수를 넘을 때 다음 출력부터 늘린다.
      if (nextCode >= 1 << codeSize) codeSize++;
      table.set(key, nextCode++);
    }
    prefix = indices[i];
  }
  emit(prefix);
  emit(endCode);
  if (bitCount > 0) out.bytes([bits & 0xff]);
  return out.result();
}

/** 크기가 자동으로 늘어나는 바이트 버퍼 */
class ByteWriter {
  private buffer = new Uint8Array(1024);
  private length = 0;

  bytes(values: ArrayLike<number>): void {
    if (this.length + values.length > this.buffer.length) {
      const grown = new Uint8Array(Math.max(this.buffer.length * 2, this.length + values.length));
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer.set(values, this.length);
    this.length += values.length;
  }

  u16(value: number): void {
    this.bytes([value & 0xff, (value >> 8) & 0xff]);
  }

  ascii(text: string): void {
    this.bytes(Array.from(text, (c) => c.charCodeAt(0)));
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }
}
