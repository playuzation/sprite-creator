import { MAX_COLORS, MAX_FPS, MIN_FPS, createSprite, isValidSize, type Sprite } from './model';

export interface ImportedFrame {
  rgba: Uint8ClampedArray;
  /** 프레임 길이(밀리초). 생략하면 100ms. */
  duration?: number;
}

export interface ImageImportResult {
  sprite: Sprite;
  quantized: boolean;
  alphaFlattened: boolean;
  timingAdjusted: boolean;
}

/** 디코딩한 이미지를 공통 팔레트의 편집 가능한 픽셀 프레임으로 변환한다. */
export function importImageFrames(width: number, height: number, frames: ImportedFrame[]): ImageImportResult {
  if (!isValidSize(width) || !isValidSize(height) || !frames.length) throw new Error('이미지 크기나 프레임이 올바르지 않습니다.');
  const size = width * height;
  if (frames.some((frame) => frame.rgba.length !== size * 4 ||
    (frame.duration !== undefined && (!Number.isFinite(frame.duration) || frame.duration <= 0)))) {
    throw new Error('이미지 픽셀이나 프레임 시간이 올바르지 않습니다.');
  }
  const exact = new Set<number>();
  const bins = new Map<number, Color>();
  let alphaFlattened = false;
  for (const { rgba } of frames) {
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
      if (a !== 0 && a !== 255) alphaFlattened = true;
      if (a < 128) continue;
      if (exact.size <= MAX_COLORS) exact.add((r << 16) | (g << 8) | b);
      const key = binKey(r, g, b);
      const color = bins.get(key) ?? { rgb: [0, 0, 0], count: 0 };
      color.count++;
      color.rgb[0] += r; color.rgb[1] += g; color.rgb[2] += b;
      bins.set(key, color);
    }
  }
  const quantized = exact.size > MAX_COLORS;
  const colors = [...bins.values()].map(({ rgb, count }) => ({ rgb: rgb.map((v) => v / count), count }));
  const palette = quantized ? reduceColors(colors) : [...exact].map((v) => [v >> 16, (v >> 8) & 255, v & 255]);
  if (!palette.length) palette.push([0, 0, 0]);
  const lookup = new Map<number, number>();
  if (quantized) {
    for (const [key, color] of bins) lookup.set(key, nearest(color.rgb.map((v) => v / color.count), palette) + 1);
  } else {
    palette.forEach(([r, g, b], i) => lookup.set((r << 16) | (g << 8) | b, i + 1));
  }
  const sprite = createSprite(width, height);
  sprite.layers[0].name = '가져온 이미지';
  sprite.palette = palette.map((rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
  const durations = frames.map((frame) => frame.duration ?? 100);
  const average = durations.reduce((sum, ms) => sum + ms, 0) / frames.length;
  sprite.fps = Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(1000 / average)));
  sprite.frames = frames.map(({ rgba }) => {
    const cel = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const offset = i * 4;
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2], a = rgba[offset + 3];
      if (a >= 128) cel[i] = lookup.get(quantized ? binKey(r, g, b) : (r << 16) | (g << 8) | b)!;
    }
    return { cels: [cel], shapes: [[]] };
  });
  return { sprite, quantized, alphaFlattened, timingAdjusted: frames.length > 1 && durations.some((ms) => Math.abs(ms - 1000 / sprite.fps) > 1) };
}

interface Color { rgb: number[]; count: number }
const binKey = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** 빈도 가중 median cut. 히스토그램은 최대 32768개라 사진에서도 메모리 사용이 제한된다. */
function reduceColors(colors: Color[]): number[][] {
  const boxes = [colors];
  while (boxes.length < MAX_COLORS) {
    let choice = -1, axis = 0, score = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const ranges = [0, 1, 2].map((channel) => {
        let low = 255, high = 0;
        for (const c of box) { low = Math.min(low, c.rgb[channel]); high = Math.max(high, c.rgb[channel]); }
        return high - low;
      });
      const channel = ranges.indexOf(Math.max(...ranges));
      const weight = ranges[channel] * box.reduce((sum, c) => sum + c.count, 0);
      if (weight > score) { choice = i; axis = channel; score = weight; }
    });
    if (choice < 0) break;
    const box = boxes[choice].sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const half = box.reduce((sum, c) => sum + c.count, 0) / 2;
    let sum = 0, split = 0;
    do { sum += box[split++].count; } while (sum < half && split < box.length - 1);
    boxes.splice(choice, 1, box.slice(0, split), box.slice(split));
  }
  return boxes.map((box) => {
    const total = box.reduce((sum, c) => sum + c.count, 0);
    return [0, 1, 2].map((channel) => Math.round(box.reduce((sum, c) => sum + c.rgb[channel] * c.count, 0) / total));
  });
}

function nearest(rgb: number[], palette: number[][]): number {
  let best = 0, distance = Infinity;
  palette.forEach((color, i) => {
    const d = color.reduce((sum, v, channel) => sum + (v - rgb[channel]) ** 2, 0);
    if (d < distance) { distance = d; best = i; }
  });
  return best;
}
