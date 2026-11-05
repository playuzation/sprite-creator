import { MAX_SIZE, importImageFrames, type ImportedFrame, type ImageImportResult } from '../sprite';
import { h } from './dom';

const MAX_FRAMES = 256;
const MAX_PIXELS = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

// ImageDecoder는 아직 일부 브라우저/DOM 타입에서 제공되지 않는다.
interface Decoder {
  tracks: {
    ready: Promise<void>;
    selectedTrack: { frameCount: number } | null;
    length: number;
    [index: number]: { animated: boolean; selected: boolean };
  };
  decode(options: { frameIndex: number; completeFramesOnly: boolean }): Promise<{ image: VideoFrame }>;
  close(): void;
}
interface DecoderConstructor {
  new(options: { data: ArrayBuffer; type: string }): Decoder;
  isTypeSupported(type: string): Promise<boolean>;
}

export interface ImportedImage extends ImageImportResult { notes: string[] }

/** 이미지는 브라우저 이미지 디코더에 맡기며 SVG도 img로만 읽어 픽셀로 만든다. */
export async function readImageFile(file: File): Promise<ImportedImage> {
  if (file.size > MAX_FILE_BYTES) throw new Error('이미지 파일은 64MiB 이하여야 합니다.');
  const data = await file.arrayBuffer();
  const type = imageType(new Uint8Array(data), file.name);
  const notes: string[] = [];
  const Decoder = (globalThis as typeof globalThis & { ImageDecoder?: DecoderConstructor }).ImageDecoder;
  const animatedType = ['image/gif', 'image/webp', 'image/avif'].includes(type);
  let width = 0, height = 0;
  const frames: ImportedFrame[] = [];
  const readPixels = (source: CanvasImageSource, w: number, hgt: number, duration?: number) => {
    const scale = Math.min(1, MAX_SIZE / w, MAX_SIZE / hgt);
    const nextWidth = Math.max(1, Math.round(w * scale));
    const nextHeight = Math.max(1, Math.round(hgt * scale));
    if (!Number.isFinite(w) || !Number.isFinite(hgt) || w <= 0 || hgt <= 0) throw new Error('이미지 크기를 읽지 못했습니다.');
    if (frames.length && (width !== nextWidth || height !== nextHeight)) throw new Error('프레임 크기가 서로 다릅니다.');
    width = nextWidth; height = nextHeight;
    if ((frames.length + 1) * width * height > MAX_PIXELS) throw new Error('이미지가 너무 큽니다. 전체 프레임은 합계 32메가픽셀 이하여야 합니다.');
    if (scale < 1 && !frames.length) notes.push(`원본 ${w}×${hgt}를 ${width}×${height}로 축소합니다(최대 ${MAX_SIZE}).`);
    const canvas = h('canvas', { width, height });
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height);
    frames.push({ rgba: context.getImageData(0, 0, width, height).data, duration });
  };
  if (animatedType && Decoder && await Decoder.isTypeSupported(type)) {
    // 정지 AVIF에 preferAnimation:true를 주면 일부 브라우저가 메타데이터 읽기에 실패한다.
    const decoder = new Decoder({ data, type });
    try {
      await decoder.tracks.ready;
      // 대표 정지 이미지와 애니메이션이 함께 있으면 애니메이션 트랙을 고른다.
      for (let i = 0; i < decoder.tracks.length; i++) {
        if (decoder.tracks[i].animated) { decoder.tracks[i].selected = true; break; }
      }
      const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
      if (!count) throw new Error('이미지 프레임을 읽지 못했습니다.');
      if (count > MAX_FRAMES) throw new Error(`최대 ${MAX_FRAMES}프레임까지 불러올 수 있습니다.`);
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
        try { readPixels(image, image.displayWidth, image.displayHeight, image.duration ? image.duration / 1000 : 100); }
        finally { image.close(); }
        if (count * width * height > MAX_PIXELS) throw new Error('이미지가 너무 큽니다. 전체 프레임은 합계 32메가픽셀 이하여야 합니다.');
      }
    } finally { decoder.close(); }
  } else {
    if (animatedType) notes.push('이 브라우저는 이 형식의 전체 프레임 가져오기를 지원하지 않습니다. 애니메이션은 첫 프레임만 불러옵니다.');
    const url = URL.createObjectURL(new Blob([data], { type }));
    try {
      const image = new Image();
      image.src = url;
      try { await image.decode(); }
      catch { throw new Error('이미지를 읽지 못했습니다. 파일이 손상되었거나 브라우저가 이 형식을 지원하지 않습니다.'); }
      readPixels(image, image.naturalWidth, image.naturalHeight);
    } finally { URL.revokeObjectURL(url); }
  }
  if (type === 'image/svg+xml') notes.push('SVG는 픽셀 이미지로 변환합니다. 원본 벡터 도형과 SVG 애니메이션은 유지되지 않습니다.');
  const result = importImageFrames(width, height, frames);
  if (result.quantized) notes.push('원본 색상을 최대 32색의 공통 팔레트로 줄입니다.');
  if (result.alphaFlattened) notes.push('부분 투명도는 50% 미만이면 투명, 이상이면 불투명으로 바꿉니다.');
  if (result.timingAdjusted) notes.push(`프레임별 지연을 공통 ${result.sprite.fps} FPS로 맞춥니다.`);
  return { ...result, notes };
}

/** 확장자/MIME 누락에 영향받지 않도록 래스터 파일의 시그니처를 확인한다. */
function imageType(bytes: Uint8Array, name: string): string {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 137 && text(1, 8) === 'PNG\r\n\x1a\n') return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'image/gif';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (text(4, 8) === 'ftyp') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = Math.min(view.getUint32(0), bytes.length);
    for (let i = 8; i + 4 <= end; i += 4) if (i !== 12 && ['avif', 'avis'].includes(text(i, i + 4))) return 'image/avif';
  }
  if (/\.svg$/i.test(name) || new TextDecoder().decode(bytes.subarray(0, 512)).includes('<svg')) {
    const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
    if (document.documentElement.localName === 'svg' && !document.querySelector('parsererror')) return 'image/svg+xml';
  }
  throw new Error('PNG, JPG, WebP, AVIF, SVG, GIF 파일을 선택해 주세요.');
}
