import { base64ToBytes, bytesToBase64, deflate, inflate } from '../codec';
import { MAX_COLORS, MAX_FPS, MIN_FPS, isHexColor, isValidSize, type Layer, type Sprite } from './model';

/**
 * 프로젝트 파일(JSON) 저장/불러오기.
 * 각 셀은 픽셀 값 바이트(행 우선, 픽셀당 1바이트)를 zlib(deflate)로 압축한 뒤 base64로 담는다.
 */

const FORMAT = 'sprite-creator';
const VERSION = 1;

interface ProjectFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  width: number;
  height: number;
  fps: number;
  palette: string[];
  layers: Layer[];
  frames: { cels: string[] }[];
}

export async function saveProject(sprite: Sprite): Promise<string> {
  const file: ProjectFile = {
    format: FORMAT,
    version: VERSION,
    width: sprite.width,
    height: sprite.height,
    fps: sprite.fps,
    palette: sprite.palette,
    layers: sprite.layers.map(({ name, visible }) => ({ name, visible })),
    frames: await Promise.all(
      sprite.frames.map(async (frame) => ({
        cels: await Promise.all(frame.cels.map(async (cel) => bytesToBase64(await deflate(cel)))),
      })),
    ),
  };
  return JSON.stringify(file);
}

/** 프로젝트 파일을 검증하며 읽는다. 형식이 맞지 않으면 오류를 던진다. */
export async function loadProject(text: string): Promise<Sprite> {
  const file = JSON.parse(text) as Partial<ProjectFile> | null;
  if (file?.format !== FORMAT || file.version !== VERSION) fail('지원하지 않는 파일 형식입니다.');
  const { width, height, fps, palette, layers, frames } = file;
  if (!isValidSize(width) || !isValidSize(height)) fail('캔버스 크기가 올바르지 않습니다.');
  if (typeof fps !== 'number' || !Number.isInteger(fps) || fps < MIN_FPS || fps > MAX_FPS) fail('FPS 값이 올바르지 않습니다.');
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > MAX_COLORS || !palette.every(isHexColor)) {
    fail('팔레트가 올바르지 않습니다.');
  }
  if (!Array.isArray(layers) || layers.length < 1 || !layers.every(isLayer)) fail('레이어 정보가 올바르지 않습니다.');
  if (!Array.isArray(frames) || frames.length < 1 || !frames.every((f) => isCelList(f?.cels, layers.length))) {
    fail('프레임 정보가 올바르지 않습니다.');
  }

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
    layers: layers.map(({ name, visible }) => ({ name, visible })),
    frames: await Promise.all(frames.map(async (frame) => ({ cels: await Promise.all(frame.cels.map(decodeCel)) }))),
  };
}

function isLayer(value: Partial<Layer> | null): value is Layer {
  return typeof value?.name === 'string' && typeof value.visible === 'boolean';
}

function isCelList(value: unknown, length: number): value is string[] {
  return Array.isArray(value) && value.length === length && value.every((cel) => typeof cel === 'string');
}

function fail(message: string): never {
  throw new Error(message);
}
