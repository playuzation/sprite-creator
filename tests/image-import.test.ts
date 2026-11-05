import { afterEach, describe, expect, it, vi } from 'vitest';
import { importImageFrames, loadProject, renderFrameRGBA, saveProject } from '../src/sprite';
import { readImageFile } from '../src/ui/image-import';

const rgba = (...pixels: number[][]) => new Uint8ClampedArray(pixels.flat());

describe('이미지 → 편집 가능한 스프라이트', () => {
  it('32색 이하의 픽셀과 투명을 손실 없이 유지한다', () => {
    const pixels = rgba([255, 0, 0, 255], [0, 255, 0, 255], [90, 80, 70, 0], [255, 0, 0, 255]);
    const result = importImageFrames(4, 1, [{ rgba: pixels }]);
    expect(result.sprite.palette).toEqual(['#ff0000', '#00ff00']);
    expect([...result.sprite.frames[0].cels[0]]).toEqual([1, 2, 0, 1]);
    expect(result.quantized).toBe(false);
    expect(result.alphaFlattened).toBe(false);
  });

  it('같은 5비트 색상 구간의 색도 32색 이하면 구분한다', () => {
    const pixels = rgba([1, 2, 3, 255], [2, 3, 4, 255]);
    expect(renderFrameRGBA(importImageFrames(2, 1, [{ rgba: pixels }]).sprite, 0)).toEqual(pixels);
  });

  it('사진은 최대 32색으로 줄이고 모든 프레임이 같은 팔레트를 쓴다', () => {
    const pixels = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) pixels.set([i, 255 - i, (i * 17) % 256, 255], i * 4);
    const result = importImageFrames(256, 1, [{ rgba: pixels }, { rgba: pixels.slice().reverse() }]);
    expect(result.quantized).toBe(true);
    expect(result.sprite.palette.length).toBeLessThanOrEqual(32);
    expect(result.sprite.palette.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(result.sprite.frames.every((f) => f.cels[0].every((v) => v <= result.sprite.palette.length))).toBe(true);
    expect(importImageFrames(256, 1, [{ rgba: pixels }, { rgba: pixels.slice().reverse() }]).sprite).toEqual(result.sprite);
  });

  it('부분 투명도는 128을 기준으로 변환하고 완전히 투명해도 유효하다', () => {
    const result = importImageFrames(3, 1, [{ rgba: rgba([255, 0, 0, 127], [0, 255, 0, 128], [0, 0, 255, 255]) }]);
    expect(result.alphaFlattened).toBe(true);
    expect([...result.sprite.frames[0].cels[0]]).toEqual([0, 1, 2]);
    const empty = importImageFrames(1, 1, [{ rgba: rgba([100, 0, 0, 0]) }]);
    expect(empty.sprite.palette).toEqual(['#000000']);
    expect(empty.sprite.frames[0].cels[0][0]).toBe(0);
  });

  it('애니메이션의 색상을 공유하고 프레임 내용·FPS·저장 왕복을 유지한다', async () => {
    const result = importImageFrames(1, 1, [
      { rgba: rgba([255, 0, 0, 255]), duration: 200 },
      { rgba: rgba([0, 0, 255, 255]), duration: 200 },
    ]);
    expect(result.sprite.fps).toBe(5);
    expect(result.timingAdjusted).toBe(false);
    expect([...renderFrameRGBA(result.sprite, 1)]).toEqual([0, 0, 255, 255]);
    result.sprite.frames[0].cels[0][0] = 0;
    expect(result.sprite.frames[1].cels[0][0]).toBe(2);
    expect(await loadProject(await saveProject(result.sprite))).toEqual(result.sprite);
  });

  it('가변 지연·FPS 범위 초과를 알린다', () => {
    for (const durations of [[100, 200], [1, 1], [2000, 2000]]) {
      const result = importImageFrames(1, 1, durations.map((duration) => ({ rgba: rgba([0, 0, 0, 255]), duration })));
      expect(result.timingAdjusted).toBe(true);
      expect(result.sprite.fps).toBeGreaterThanOrEqual(1);
      expect(result.sprite.fps).toBeLessThanOrEqual(30);
    }
  });

  it('빈 프레임·잘못된 크기·픽셀·지연을 거부한다', () => {
    expect(() => importImageFrames(0, 1, [])).toThrow();
    expect(() => importImageFrames(1025, 1, [])).toThrow();
    expect(() => importImageFrames(1, 1, [])).toThrow();
    expect(() => importImageFrames(1, 1, [{ rgba: new Uint8ClampedArray(3) }])).toThrow();
    for (const duration of [0, -1, Infinity, NaN]) {
      expect(() => importImageFrames(1, 1, [{ rgba: new Uint8ClampedArray(4), duration }])).toThrow();
    }
  });
});

describe('브라우저 이미지 디코딩', () => {
  afterEach(() => vi.unstubAllGlobals());
  const gifFile = () => new File(['GIF89a'], 'animation.bin');
  function decoderMock(count = 2, failAt = -1) {
    const imageClose = vi.fn();
    const decoderClose = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({
      append() {},
      getContext: () => ({ drawImage, getImageData: () => ({ data: rgba([255, 0, 0, 255]) }) }),
    }) });
    class MockDecoder {
      static isTypeSupported = async () => true;
      tracks = {
        ready: Promise.resolve(), length: 2,
        0: { animated: false, selected: false },
        1: { animated: true, selected: false },
        get selectedTrack() { return { frameCount: this[1].selected ? count : 1 }; },
      };
      async decode({ frameIndex }: { frameIndex: number }) {
        if (frameIndex === failAt) throw new Error('decode failed');
        return { image: { displayWidth: 1, displayHeight: 1, duration: 200000, close: imageClose } };
      }
      close = decoderClose;
    }
    vi.stubGlobal('ImageDecoder', MockDecoder);
    return { imageClose, decoderClose, drawImage };
  }

  it('파일 시그니처로 감지하고 각 프레임과 디코더를 닫는다', async () => {
    const { imageClose, decoderClose } = decoderMock();
    const result = await readImageFile(gifFile());
    expect(result.sprite.frames).toHaveLength(2);
    expect(result.sprite.fps).toBe(5);
    expect(imageClose).toHaveBeenCalledTimes(2);
    expect(decoderClose).toHaveBeenCalledOnce();
  });

  it('중간 프레임 디코딩 실패 시에도 자원을 해제한다', async () => {
    const { imageClose, decoderClose } = decoderMock(2, 1);
    await expect(readImageFile(gifFile())).rejects.toThrow('decode failed');
    expect(imageClose).toHaveBeenCalledOnce();
    expect(decoderClose).toHaveBeenCalledOnce();
  });

  it('과도한 프레임과 빈 트랙을 거부하고 디코더를 닫는다', async () => {
    for (const count of [0, 257]) {
      const { decoderClose, drawImage } = decoderMock(count);
      await expect(readImageFile(gifFile())).rejects.toThrow();
      expect(drawImage).not.toHaveBeenCalled();
      expect(decoderClose).toHaveBeenCalledOnce();
    }
  });

  it('지원하지 않는 형식·빈 파일·대용량 파일을 거부한다', async () => {
    await expect(readImageFile(new File([], 'empty.png'))).rejects.toThrow('PNG');
    await expect(readImageFile(new File(['not a png'], 'fake.png'))).rejects.toThrow('PNG');
    const file = new File(['x'], 'huge.png');
    Object.defineProperty(file, 'size', { value: 65 * 1024 * 1024 });
    await expect(readImageFile(file)).rejects.toThrow('64MiB');
  });
});
