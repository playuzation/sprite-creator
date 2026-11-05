import { base64ToBytes, bytesToBase64, deflate, inflate } from '../codec';
import {
  MAX_COLORS,
  MAX_FPS,
  MAX_STROKE_WIDTH,
  MIN_FPS,
  createPath,
  copyShape,
  isHexColor,
  isValidSize,
  isFrameDuration,
  type Layer,
  type LayerKind,
  type Sprite,
  type VectorPath,
  type VectorShape,
} from './model';

/**
 * 프로젝트 파일(JSON) 저장/불러오기.
 * 각 셀은 픽셀 값 바이트(행 우선, 픽셀당 1바이트)를 zlib(deflate)로 압축한 뒤 base64로 담는다.
 * 벡터 패스(path), 레이어 종류(kind), 벡터 도형(shapes)은 나중에 추가된 항목이라,
 * 없는 예전 파일은 빈 패스, 픽셀 레이어, 도형 없음으로 읽는다.
 */

const FORMAT = 'sprite-creator';
const VERSION = 1;
const KINDS: LayerKind[] = ['pixel', 'vector'];

interface ProjectFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  width: number;
  height: number;
  fps: number;
  palette: string[];
  layers: (Omit<Layer, 'kind'> & { kind?: LayerKind })[];
  frames: { cels: string[]; shapes?: VectorShape[][]; duration?: number }[];
  path?: VectorPath;
}

export async function saveProject(sprite: Sprite): Promise<string> {
  const file: ProjectFile = {
    format: FORMAT,
    version: VERSION,
    width: sprite.width,
    height: sprite.height,
    fps: sprite.fps,
    palette: sprite.palette,
    layers: sprite.layers.map(({ name, visible, kind }) => ({ name, visible, kind })),
    frames: await Promise.all(
      sprite.frames.map(async (frame) => ({
        ...(frame.duration === undefined ? {} : { duration: frame.duration }),
        cels: await Promise.all(frame.cels.map(async (cel) => bytesToBase64(await deflate(cel)))),
        shapes: frame.shapes.map((shapes) => shapes.map(copyShape)),
      })),
    ),
    path: copyPath(sprite.path),
  };
  return JSON.stringify(file);
}

/** 프로젝트 파일을 검증하며 읽는다. 형식이 맞지 않으면 오류를 던진다. */
export async function loadProject(text: string): Promise<Sprite> {
  const file = JSON.parse(text) as Partial<ProjectFile> | null;
  if (file?.format !== FORMAT || file.version !== VERSION) fail('지원하지 않는 파일 형식입니다.');
  const { width, height, fps, palette, layers, frames, path = createPath() } = file;
  if (!isValidSize(width) || !isValidSize(height)) fail('캔버스 크기가 올바르지 않습니다.');
  if (typeof fps !== 'number' || !Number.isInteger(fps) || fps < MIN_FPS || fps > MAX_FPS) fail('FPS 값이 올바르지 않습니다.');
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > MAX_COLORS || !palette.every(isHexColor)) {
    fail('팔레트가 올바르지 않습니다.');
  }
  if (!Array.isArray(layers) || layers.length < 1 || !layers.every(isLayer)) fail('레이어 정보가 올바르지 않습니다.');
  if (!Array.isArray(frames) || frames.length < 1 || !frames.every((f) => isCelList(f?.cels, layers.length))) {
    fail('프레임 정보가 올바르지 않습니다.');
  }
  if (!frames.every((frame) => frame.duration === undefined || isFrameDuration(frame.duration))) fail('프레임 표시 시간이 올바르지 않습니다.');
  if (!isPath(path)) fail('패스 정보가 올바르지 않습니다.');
  const kinds = layers.map((layer) => layer.kind ?? 'pixel');
  const shapesOf = (frame: ProjectFile['frames'][number]) => frame.shapes ?? kinds.map(() => []);
  if (!frames.every((frame) => isShapeLists(shapesOf(frame), kinds, palette.length))) fail('도형 정보가 올바르지 않습니다.');

  const size = width * height;
  const decodeCel = async (data: string) => {
    const cel = await inflate(base64ToBytes(data), size);
    if (cel.length !== size || cel.some((value) => value > palette.length)) fail('픽셀 데이터가 올바르지 않습니다.');
    return cel;
  };
  return {
    width,
    height,
    fps,
    palette: palette.map((hex) => hex.toLowerCase()),
    layers: layers.map(({ name, visible }, i) => ({ name, visible, kind: kinds[i] })),
    frames: await Promise.all(
      frames.map(async (frame) => ({
        ...(frame.duration === undefined ? {} : { duration: frame.duration }),
        cels: await Promise.all(frame.cels.map(decodeCel)),
        shapes: shapesOf(frame).map((shapes) => shapes.map((shape) => ({ ...copyPath(shape), color: shape.color }))),
      })),
    ),
    path: copyPath(path),
  };
}

function copyPath({ points, curve, width, antialias }: VectorPath): VectorPath {
  return { points: points.map(({ x, y }) => ({ x, y })), curve, width, antialias };
}

/** 레이어마다 도형 목록이 있고, 픽셀 레이어의 목록은 비어 있는지 */
function isShapeLists(value: unknown, kinds: LayerKind[], colors: number): value is VectorShape[][] {
  return (
    Array.isArray(value) &&
    value.length === kinds.length &&
    value.every(
      (shapes, i) =>
        Array.isArray(shapes) && (kinds[i] === 'vector' || shapes.length === 0) && shapes.every((shape) => isShape(shape, colors)),
    )
  );
}

/** 점이 하나 이상인 패스이고 팔레트 색(1~colors)을 쓰는지 */
function isShape(value: Partial<VectorShape> | null, colors: number): value is VectorShape {
  const color = value?.color;
  const isColor = typeof color === 'number' && Number.isInteger(color) && color >= 1 && color <= colors;
  return isColor && isPath(value) && value.points.length > 0;
}

function isPath(value: Partial<VectorPath> | null): value is VectorPath {
  const { points, width } = value ?? {};
  return (
    Array.isArray(points) &&
    points.every((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)) &&
    typeof value?.curve === 'boolean' &&
    typeof value.antialias === 'boolean' &&
    typeof width === 'number' &&
    Number.isInteger(width) &&
    width >= 1 &&
    width <= MAX_STROKE_WIDTH
  );
}

function isLayer(value: Partial<Layer> | null): value is ProjectFile['layers'][number] {
  return typeof value?.name === 'string' && typeof value.visible === 'boolean' && (value.kind === undefined || KINDS.includes(value.kind));
}

function isCelList(value: unknown, length: number): value is string[] {
  return Array.isArray(value) && value.length === length && value.every((cel) => typeof cel === 'string');
}

function fail(message: string): never {
  throw new Error(message);
}
