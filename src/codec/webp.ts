import { ascii, concat, u16le, u24le, u32le } from './bytes';

/**
 * WebP 인코더 (무손실 VP8L). 프레임이 하나면 정지 이미지, 여럿이면 무한 반복 애니메이션을 만든다.
 * 같은 픽셀이 이어지는 구간과 바로 윗줄과 같은 구간은 앞의 픽셀을 복사(LZ77 역참조)하고, 나머지 픽셀은 허프만 부호로 담는다.
 */

export interface WebpOptions {
  width: number;
  height: number;
  /** 프레임별 RGBA 픽셀 (width * height * 4) */
  frames: ReadonlyArray<ArrayLike<number>>;
  /** 프레임 하나의 길이 (밀리초) */
  frameMs: number;
  frameDurations?: readonly number[];
}

export function encodeWebp({ width, height, frames, frameMs, frameDurations }: WebpOptions): Uint8Array<ArrayBuffer> {
  const images = frames.map((rgba) => chunk('VP8L', encodeVp8l(width, height, rgba)));
  if (images.length === 1) return riff(images[0]);
  const size = concat(u24le(width - 1), u24le(height - 1));
  return riff(
    chunk('VP8X', [0x12, 0, 0, 0], size), // 알파 + 애니메이션
    chunk('ANIM', u32le(0), u16le(0)), // 배경 투명, 반복 횟수 0 = 무한
    // 프레임마다 캔버스 전체를 덮어쓴다 (섞지 않음).
    ...images.map((image, i) => chunk('ANMF', u24le(0), u24le(0), size, u24le(frameDurations?.[i] ?? frameMs), [0x02], image)),
  );
}

function chunk(type: string, ...content: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const body = concat(...content);
  return concat(ascii(type), u32le(body.length), body, body.length % 2 ? [0] : []);
}

function riff(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const body = concat(ascii('WEBP'), ...chunks);
  return concat(ascii('RIFF'), u32le(body.length), body);
}

/** 역참조 거리 부호: 1 = 바로 위 픽셀, 2 = 바로 왼쪽 픽셀 (VP8L 거리 표의 앞 두 칸) */
const ABOVE = 1;
const LEFT = 2;
const MAX_COPY = 4096;
/** 부호 길이의 부호를 적는 순서 */
const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/**
 * VP8L 비트스트림. 변환·색 캐시 없이, 허프만 부호 묶음 하나로 쓴다.
 * 토큰은 0 이상이면 픽셀(ARGB), 음수면 역참조 -(길이 * 4 + 거리 부호)다.
 */
function encodeVp8l(width: number, height: number, rgba: ArrayLike<number>): Uint8Array {
  const pixels = new Uint32Array(width * height);
  let hasAlpha = false;
  for (let i = 0; i < pixels.length; i++) {
    const a = rgba[i * 4 + 3];
    // 완전히 투명한 픽셀은 색을 0으로 맞춰 더 잘 압축되게 한다.
    pixels[i] = a === 0 ? 0 : ((a << 24) | (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]) >>> 0;
    if (a !== 255) hasAlpha = true;
  }

  const tokens: number[] = [];
  for (let i = 0; i < pixels.length; ) {
    const run = (distance: number) => {
      let length = 0;
      while (i >= distance && i + length < pixels.length && length < MAX_COPY && pixels[i + length] === pixels[i + length - distance]) length++;
      return length;
    };
    const [above, left] = [run(width), run(1)];
    const length = Math.max(above, left);
    if (length >= 2) {
      tokens.push(-(length * 4 + (above >= left ? ABOVE : LEFT)));
      i += length;
    } else {
      tokens.push(pixels[i++]);
    }
  }

  // 녹색(+ 길이 부호), 빨강, 파랑, 알파, 거리 순서의 허프만 부호 다섯 개
  const histograms = [280, 256, 256, 256, 40].map((size) => new Uint32Array(size));
  const [green, red, blue, alpha, distance] = histograms;
  for (const token of tokens) {
    if (token >= 0) {
      green[(token >> 8) & 0xff]++;
      red[(token >> 16) & 0xff]++;
      blue[token & 0xff]++;
      alpha[token >>> 24]++;
    } else {
      green[256 + prefix(Math.floor(-token / 4)).code]++;
      distance[prefix(-token % 4).code]++;
    }
  }

  const out = new BitWriter();
  out.write(0x2f, 8);
  out.write(width - 1, 14);
  out.write(height - 1, 14);
  out.write(hasAlpha ? 1 : 0, 1);
  out.write(0, 3); // 버전
  out.write(0, 1); // 변환 없음
  out.write(0, 1); // 색 캐시 없음
  out.write(0, 1); // 허프만 부호 묶음 하나
  const [greenCode, redCode, blueCode, alphaCode, distanceCode] = histograms.map((histogram) => writeCode(out, histogram));
  for (const token of tokens) {
    if (token >= 0) {
      greenCode.put(out, (token >> 8) & 0xff);
      redCode.put(out, (token >> 16) & 0xff);
      blueCode.put(out, token & 0xff);
      alphaCode.put(out, token >>> 24);
    } else {
      const length = prefix(Math.floor(-token / 4));
      greenCode.put(out, 256 + length.code);
      out.write(length.extra, length.extraBits);
      const distanceCodeValue = prefix(-token % 4);
      distanceCode.put(out, distanceCodeValue.code);
      out.write(distanceCodeValue.extra, distanceCodeValue.extraBits);
    }
  }
  return out.finish();
}

/** 1 이상의 값을 접두 부호와 추가 비트로 나눈다 (역참조 길이·거리용). */
function prefix(value: number): { code: number; extraBits: number; extra: number } {
  const v = value - 1;
  if (v < 4) return { code: v, extraBits: 0, extra: 0 };
  const highest = 31 - Math.clz32(v);
  const extraBits = highest - 1;
  return { code: 2 * highest + ((v >> extraBits) & 1), extraBits, extra: v & ((1 << extraBits) - 1) };
}

interface Code {
  put(out: BitWriter, symbol: number): void;
}

/** 기호 빈도로 허프만 부호를 만들어 적고, 기호를 적는 방법을 돌려준다. */
function writeCode(out: BitWriter, histogram: Uint32Array): Code {
  const used = [...histogram.keys()].filter((symbol) => histogram[symbol] > 0);
  if (used.length <= 2 && used.every((symbol) => symbol < 256)) {
    // 단순 부호: 기호가 하나면 0비트, 둘이면 1비트
    const symbols = used.length > 0 ? used : [0];
    const wide = symbols[0] > 1;
    out.write(1, 1);
    out.write(symbols.length - 1, 1);
    out.write(wide ? 1 : 0, 1);
    out.write(symbols[0], wide ? 8 : 1);
    if (symbols.length === 2) out.write(symbols[1], 8);
    const lengths = new Uint8Array(histogram.length);
    if (symbols.length === 2) symbols.forEach((symbol) => (lengths[symbol] = 1));
    return canonical(lengths);
  }
  const lengths = huffmanLengths(histogram, 15);
  writeLengths(out, lengths);
  return canonical(lengths);
}

/** 부호 길이 목록을 반복 부호(16: 앞의 0 아닌 길이 반복, 17·18: 0 반복)로 줄이고, 그 기호들의 허프만 부호로 적는다. */
function writeLengths(out: BitWriter, lengths: Uint8Array): void {
  const tokens: [symbol: number, extraBits: number, extra: number][] = [];
  let previous = 8;
  for (let i = 0; i < lengths.length; ) {
    const value = lengths[i];
    let run = 1;
    while (i + run < lengths.length && lengths[i + run] === value) run++;
    i += run;
    if (value === 0) {
      for (; run >= 11; run -= Math.min(run, 138)) tokens.push([18, 7, Math.min(run, 138) - 11]);
      for (; run >= 3; run -= Math.min(run, 10)) tokens.push([17, 3, Math.min(run, 10) - 3]);
    } else {
      if (value !== previous) {
        tokens.push([value, 0, 0]);
        previous = value;
        run--;
      }
      for (; run >= 3; run -= Math.min(run, 6)) tokens.push([16, 2, Math.min(run, 6) - 3]);
    }
    for (; run > 0; run--) tokens.push([value, 0, 0]);
  }

  const histogram = new Uint32Array(19);
  for (const [symbol] of tokens) histogram[symbol]++;
  const codeLengths = huffmanLengths(histogram, 7);
  let count = 19;
  while (count > 4 && codeLengths[CODE_LENGTH_ORDER[count - 1]] === 0) count--;
  out.write(0, 1); // 일반 부호
  out.write(count - 4, 4);
  for (let i = 0; i < count; i++) out.write(codeLengths[CODE_LENGTH_ORDER[i]], 3);
  out.write(0, 1); // 모든 기호의 길이를 적음
  const code = canonical(codeLengths);
  for (const [symbol, extraBits, extra] of tokens) {
    code.put(out, symbol);
    out.write(extra, extraBits);
  }
}

/** 최대 limit 비트인 허프만 부호 길이. 너무 길어지면 빈도를 줄여 다시 만든다. */
function huffmanLengths(histogram: Uint32Array, limit: number): Uint8Array {
  for (let scale = 1; ; scale *= 2) {
    interface Node {
      weight: number;
      symbol: number;
      children?: [Node, Node];
    }
    let nodes: Node[] = [];
    histogram.forEach((count, symbol) => count > 0 && nodes.push({ weight: Math.max(1, Math.floor(count / scale)), symbol }));
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight);
      const [a, b] = nodes;
      nodes = [...nodes.slice(2), { weight: a.weight + b.weight, symbol: -1, children: [a, b] }];
    }
    const lengths = new Uint8Array(histogram.length);
    const walk = (node: Node, depth: number): void => {
      if (node.children) node.children.forEach((child) => walk(child, depth + 1));
      else lengths[node.symbol] = Math.max(depth, 1);
    };
    if (nodes.length > 0) walk(nodes[0], 0);
    if (Math.max(...lengths) <= limit) return lengths;
  }
}

/** 정규 허프만 부호. 기호가 하나뿐이면 디코더는 비트를 읽지 않으므로 0비트로 적는다. */
function canonical(lengths: Uint8Array): Code {
  const count = new Uint16Array(16);
  lengths.forEach((length) => length && count[length]++);
  const next = new Uint16Array(16);
  for (let length = 1, code = 0; length < 16; length++) {
    code = (code + count[length - 1]) << 1;
    next[length] = code;
  }
  const single = lengths.filter((length) => length > 0).length === 1;
  const codes = new Uint16Array(lengths.length);
  lengths.forEach((length, symbol) => {
    if (!length) return;
    // 비트를 낮은 자리부터 쓰므로 부호를 뒤집어 둔다.
    let code = next[length]++;
    let reversed = 0;
    for (let i = 0; i < length; i++, code >>= 1) reversed = (reversed << 1) | (code & 1);
    codes[symbol] = reversed;
  });
  return { put: (out, symbol) => !single && out.write(codes[symbol], lengths[symbol]) };
}

/** 비트를 낮은 자리부터 채워 나가는 출력 */
class BitWriter {
  private buffer = new Uint8Array(1024);
  private length = 0;
  private bits = 0;
  private count = 0;

  write(value: number, size: number): void {
    this.bits |= value << this.count;
    this.count += size;
    while (this.count >= 8) {
      this.push(this.bits & 0xff);
      this.bits >>>= 8;
      this.count -= 8;
    }
  }

  finish(): Uint8Array<ArrayBuffer> {
    if (this.count > 0) this.push(this.bits & 0xff);
    return this.buffer.slice(0, this.length);
  }

  private push(byte: number): void {
    if (this.length === this.buffer.length) {
      const grown = new Uint8Array(this.buffer.length * 2);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer[this.length++] = byte;
  }
}
