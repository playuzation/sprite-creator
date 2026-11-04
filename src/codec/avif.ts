import { ascii, concat, u16be as u16, u32be as u32 } from './bytes';

/**
 * AVIF 인코더. 프레임이 하나면 정지 이미지, 여럿이면 무한 반복 애니메이션(image sequence)을 만든다.
 * AV1 압축은 브라우저의 WebCodecs(VideoEncoder)에 맡기고, 파일 구조(ISOBMFF/HEIF 상자)는 직접 쓴다(muxAvif).
 * - 색: RGB를 변환 없이 담는 4:4:4 AV1 (항등 행렬, 전체 범위)를 가장 높은 품질로 압축한다.
 *   브라우저 인코더가 완전한 무손실은 아니어서 색·투명도 값이 1 정도 달라질 수 있다.
 * - 투명도: WebCodecs가 알파를 담지 못하므로, 알파 값만 같은 방식으로 압축한 보조 이미지(auxiliary alpha)로 넣는다.
 */

export interface AvifOptions {
  width: number;
  height: number;
  /** 프레임별 RGBA 픽셀 (width * height * 4) */
  frames: ReadonlyArray<ArrayLike<number>>;
  /** 프레임 하나의 길이 (밀리초) */
  frameMs: number;
}

/** High 프로필(4:4:4), 레벨 4.0, 8비트 */
const CODEC = 'av01.1.08M.08';
const ALPHA_URN = 'urn:mpeg:mpegB:cicp:systems:auxiliary:alpha';
/** RGB를 그대로 담는다: 항등 행렬(Y·U·V 평면에 G·B·R), 전체 범위, sRGB */
const COLOR_SPACE: VideoColorSpaceInit = { matrix: 'rgb', primaries: 'bt709', transfer: 'iec61966-2-1', fullRange: true };
const OBU_SEQUENCE_HEADER = 1;
const OBU_TEMPORAL_DELIMITER = 2;

export async function encodeAvif({ width, height, frames, frameMs }: AvifOptions): Promise<Uint8Array<ArrayBuffer>> {
  const supported =
    typeof VideoEncoder !== 'undefined' &&
    (await VideoEncoder.isConfigSupported({ codec: CODEC, width, height, bitrateMode: 'quantizer' })).supported;
  if (!supported) throw new Error('이 브라우저는 AV1 인코딩(WebCodecs)을 지원하지 않아 AVIF를 만들 수 없습니다. Chrome이나 Edge에서 시도해 주세요.');
  const plane = (rgba: ArrayLike<number>, channel: number) => Uint8Array.from({ length: width * height }, (_, i) => rgba[i * 4 + channel]);
  const color = await encodeAv1(width, height, frames.map((rgba) => [plane(rgba, 1), plane(rgba, 2), plane(rgba, 0)]));
  const alpha = await encodeAv1(width, height, frames.map((rgba) => Array(3).fill(plane(rgba, 3))));
  return muxAvif({ width, height, color, alpha, frameMs });
}

export interface AvifStreams {
  width: number;
  height: number;
  /** 프레임별 색 AV1 데이터 (첫 프레임에 시퀀스 헤더 OBU 포함) */
  color: Uint8Array[];
  /** 프레임별 알파 AV1 데이터 */
  alpha: Uint8Array[];
  frameMs: number;
}

/** AV1 데이터로 AVIF 파일을 짠다. 첫 프레임은 언제나 대표 정지 이미지(primary item)로도 넣는다. */
export function muxAvif({ width, height, color, alpha, frameMs }: AvifStreams): Uint8Array<ArrayBuffer> {
  const colorStream = { samples: color, config: av1Config(color[0]) };
  const alphaStream = { samples: alpha, config: av1Config(alpha[0]) };
  const animated = color.length > 1;
  // 상자 크기는 데이터 위치와 상관없으므로, 한 번 만들어 크기를 잰 뒤 실제 위치로 다시 만든다.
  const layout = (dataStart: number) => {
    const alphaStart = dataStart + sum(color);
    const brands = animated ? ['avis', '\0\0\0\0', 'avif', 'avis', 'msf1', 'iso8', 'mif1', 'miaf'] : ['avif', '\0\0\0\0', 'avif', 'mif1', 'miaf'];
    const head = [box('ftyp', ...brands.map(ascii)), imageItems(width, height, colorStream, alphaStream, dataStart, alphaStart)];
    if (animated) head.push(movie(width, height, colorStream, alphaStream, dataStart, alphaStart, frameMs));
    return head;
  };
  return concat(...layout(sum(layout(0)) + 8), box('mdat', ...color, ...alpha));
}

interface Av1Stream {
  samples: Uint8Array[];
  /** av1C 상자 내용 */
  config: Uint8Array;
}

/** I444 평면들로 된 프레임들을 모두 키프레임인 AV1로, 가장 높은 품질로 압축한다. 시간 구분자 OBU는 뺀다. */
async function encodeAv1(width: number, height: number, frames: Uint8Array[][]): Promise<Uint8Array[]> {
  const samples: Uint8Array[] = [];
  let failure: unknown;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push(withoutTemporalDelimiters(data));
    },
    error: (error) => (failure = error),
  });
  encoder.configure({ codec: CODEC, width, height, bitrateMode: 'quantizer' });
  frames.forEach((planes, i) => {
    const frame = new VideoFrame(concat(...planes), { format: 'I444', codedWidth: width, codedHeight: height, timestamp: i, colorSpace: COLOR_SPACE });
    // 양자화 0 = 가장 높은 품질
    encoder.encode(frame, { keyFrame: true, av1: { quantizer: 0 } } as VideoEncoderEncodeOptions);
    frame.close();
  });
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  return samples;
}

/** OBU(AV1 데이터 단위) 목록: 종류, 시작(헤더 포함), 내용 시작, 끝 */
function readObus(data: Uint8Array): { type: number; start: number; payload: number; end: number }[] {
  const obus = [];
  for (let p = 0; p < data.length; ) {
    const start = p;
    const header = data[p++];
    if (header & 0x04) p++; // 확장 헤더
    let size = data.length - p; // 크기 필드가 없으면 끝까지
    if (header & 0x02) {
      size = 0;
      for (let shift = 0; ; shift += 7) {
        const byte = data[p++];
        size += (byte & 0x7f) * 2 ** shift;
        if (!(byte & 0x80)) break;
      }
    }
    obus.push({ type: (header >> 3) & 0x0f, start, payload: p, end: p + size });
    p += size;
  }
  return obus;
}

/** AVIF 표본에는 시간 구분자 OBU를 넣지 않는다. */
function withoutTemporalDelimiters(data: Uint8Array): Uint8Array {
  const kept = readObus(data).filter((obu) => obu.type !== OBU_TEMPORAL_DELIMITER);
  return concat(...kept.map((obu) => data.subarray(obu.start, obu.end)));
}

/** av1C 상자 내용: 시퀀스 헤더에서 프로필·레벨·티어를 읽고, High 프로필이므로 4:4:4·8비트로 적은 뒤 시퀀스 헤더를 붙인다. */
function av1Config(sample: Uint8Array): Uint8Array {
  const header = readObus(sample).find((obu) => obu.type === OBU_SEQUENCE_HEADER);
  if (!header) throw new Error('AV1 시퀀스 헤더가 없습니다.');
  let bit = header.payload * 8;
  const read = (count: number) => {
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value = (value << 1) | ((sample[bit >> 3] >> (7 - (bit & 7))) & 1);
    return value;
  };
  const profile = read(3);
  read(1); // still_picture
  let level: number;
  let tier = 0;
  if (read(1)) {
    level = read(5); // reduced_still_picture_header
  } else {
    if (read(1)) throw new Error('지원하지 않는 AV1 시퀀스 헤더입니다 (timing_info).');
    read(1 + 5 + 12); // initial_display_delay_present_flag, operating_points_cnt_minus_1, operating_point_idc[0]
    level = read(5);
    if (level > 7) tier = read(1);
  }
  return concat(Uint8Array.of(0x81, (profile << 5) | level, tier << 7, 0), sample.subarray(header.start, header.end));
}

function box(type: string, ...content: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const body = concat(...content);
  return concat(u32(8 + body.length), ascii(type), body);
}

function fullBox(type: string, version: number, flags: number, ...content: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  return box(type, u32((version << 24) | flags), ...content);
}

const sum = (parts: Uint8Array[]) => parts.reduce((total, part) => total + part.length, 0);
const zeros = (length: number) => new Uint8Array(length);
const text = (value: string) => concat(ascii(value), [0]);
/** 색 정보: BT.709 원색, sRGB 전달 특성, 항등 행렬, 전체 범위 */
const colr = () => box('colr', ascii('nclx'), u16(1), u16(13), u16(0), [0x80]);
const handler = (type: string) => fullBox('hdlr', 0, 0, u32(0), ascii(type), zeros(12), [0]);
const MATRIX = concat(...[0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));
/** 64비트 길이 '정하지 않음' */
const FOREVER = new Uint8Array(8).fill(0xff);

/** 대표 정지 이미지: 1번 = 첫 프레임의 색, 2번 = 그 알파(1번의 보조 이미지) */
function imageItems(width: number, height: number, color: Av1Stream, alpha: Av1Stream, colorAt: number, alphaAt: number) {
  const location = (id: number, at: number, size: number) => concat(u16(id), u16(0), u16(1), u32(at), u32(size));
  return fullBox(
    'meta',
    0,
    0,
    handler('pict'),
    fullBox('pitm', 0, 0, u16(1)),
    fullBox('iloc', 0, 0, [0x44, 0x00], u16(2), location(1, colorAt, color.samples[0].length), location(2, alphaAt, alpha.samples[0].length)),
    fullBox('iinf', 0, 0, u16(2), fullBox('infe', 2, 0, u16(1), u16(0), ascii('av01'), [0]), fullBox('infe', 2, 0, u16(2), u16(0), ascii('av01'), [0])),
    fullBox('iref', 0, 0, box('auxl', u16(2), u16(1), u16(1))),
    box(
      'iprp',
      box(
        'ipco',
        fullBox('ispe', 0, 0, u32(width), u32(height)), // 1
        box('av1C', color.config), // 2
        fullBox('pixi', 0, 0, [3, 8, 8, 8]), // 3
        colr(), // 4
        box('av1C', alpha.config), // 5
        fullBox('auxC', 0, 0, text(ALPHA_URN)), // 6
      ),
      // 속성 번호, 최상위 비트 = 필수 속성
      fullBox('ipma', 0, 0, u32(2), u16(1), [4, 1, 0x82, 3, 4], u16(2), [4, 1, 0x85, 3, 6]),
    ),
  );
}

/** 애니메이션: 색 트랙(1번)과 알파 트랙(2번). 모든 프레임은 키프레임이고 무한 반복한다. */
function movie(width: number, height: number, color: Av1Stream, alpha: Av1Stream, colorAt: number, alphaAt: number, frameMs: number) {
  const count = color.samples.length;
  const duration = count * frameMs;
  const track = (id: number, stream: Av1Stream, at: number) => {
    const isAlpha = stream === alpha;
    const sampleEntry = box(
      'av01',
      zeros(6),
      u16(1), // data_reference_index
      zeros(16),
      u16(width),
      u16(height),
      u32(0x00480000), // 72 dpi
      u32(0x00480000),
      u32(0),
      u16(1), // frame_count
      zeros(32), // compressorname
      u16(0x18), // depth
      u16(0xffff),
      box('av1C', stream.config),
      fullBox('ccst', 0, 0, u32(0xc0000000)), // 참조 프레임 없음(모두 인트라)
      isAlpha ? fullBox('auxi', 0, 0, text(ALPHA_URN)) : colr(),
    );
    return box(
      'trak',
      // 길이를 정하지 않음(64비트 모두 1) + 반복하는 편집 목록 = 무한 반복
      fullBox('tkhd', 1, 3, zeros(16), u32(id), u32(0), FOREVER, zeros(16), MATRIX, u32(width * 0x10000), u32(height * 0x10000)),
      isAlpha ? box('tref', box('auxl', u32(1))) : zeros(0),
      box('edts', fullBox('elst', 1, 1, u32(1), u32(0), u32(duration), zeros(8), u16(1), u16(0))),
      box(
        'mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(1000), u32(duration), u16(0x55c4), u16(0)),
        handler(isAlpha ? 'auxv' : 'pict'),
        box(
          'minf',
          fullBox('vmhd', 0, 1, zeros(8)),
          box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          box(
            'stbl',
            fullBox('stsd', 0, 0, u32(1), sampleEntry),
            fullBox('stts', 0, 0, u32(1), u32(count), u32(frameMs)),
            fullBox('stsc', 0, 0, u32(1), u32(1), u32(count), u32(1)),
            fullBox('stsz', 0, 0, u32(0), u32(count), ...stream.samples.map((sample) => u32(sample.length))),
            fullBox('stco', 0, 0, u32(1), u32(at)),
          ),
        ),
      ),
    );
  };
  return box(
    'moov',
    fullBox('mvhd', 1, 0, zeros(16), u32(1000), FOREVER, u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(3)),
    track(1, color, colorAt),
    track(2, alpha, alphaAt),
  );
}
