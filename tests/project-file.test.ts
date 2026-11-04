import { describe, expect, it } from 'vitest';
import { addLayer, createPath, createSprite, duplicateFrame, loadProject, saveProject } from '../src/sprite';

function sampleSprite() {
  const sprite = createSprite(64, 32);
  addLayer(sprite, 1);
  sprite.layers[1] = { name: '그림자', visible: false, kind: 'pixel' };
  sprite.frames[0].cels[0].fill(3, 10, 200);
  sprite.frames[0].cels[1][5] = 16;
  addLayer(sprite, 2, 'vector');
  sprite.frames[0].shapes[2].push({ points: [{ x: 3, y: 4.5 }, { x: 9.25, y: 1 }], curve: true, width: 2, antialias: false, color: 5 });
  duplicateFrame(sprite, 0);
  sprite.frames[1].cels[0][0] = 7;
  sprite.fps = 12;
  sprite.path = { points: [{ x: 1.5, y: 2.25 }, { x: 30, y: 20.5 }], curve: true, width: 3, antialias: true };
  return sprite;
}

describe('project file', () => {
  it('저장한 JSON을 불러오면 같은 스프라이트가 된다', async () => {
    const sprite = sampleSprite();
    const json = await saveProject(sprite);
    expect(JSON.parse(json)).toMatchObject({ format: 'sprite-creator', version: 1, width: 64, height: 32, fps: 12 });
    expect(await loadProject(json)).toEqual(sprite);
  });

  it('패스가 없는 예전 파일은 빈 패스로 읽는다', async () => {
    const legacy = JSON.parse(await saveProject(sampleSprite()));
    delete legacy.path;
    expect((await loadProject(JSON.stringify(legacy))).path).toEqual(createPath());
  });

  it('레이어 종류와 도형이 없는 예전 파일은 픽셀 레이어로 읽는다', async () => {
    const legacy = JSON.parse(await saveProject(sampleSprite()));
    for (const layer of legacy.layers) delete layer.kind;
    for (const frame of legacy.frames) delete frame.shapes;
    const sprite = await loadProject(JSON.stringify(legacy));
    expect(sprite.layers.map((layer) => layer.kind)).toEqual(['pixel', 'pixel', 'pixel']);
    expect(sprite.frames.map((frame) => frame.shapes)).toEqual([[[], [], []], [[], [], []]]);
  });

  it('1024x1024 빈 캔버스도 작게 저장된다', async () => {
    const json = await saveProject(createSprite(1024, 1024));
    expect(json.length).toBeLessThan(10_000);
    expect((await loadProject(json)).frames[0].cels[0]).toHaveLength(1024 * 1024);
  });

  it('잘못된 파일은 거부한다', async () => {
    const valid = JSON.parse(await saveProject(sampleSprite()));
    const otherSize = JSON.parse(await saveProject(createSprite(8, 8)));
    const cels = valid.frames[0].cels as string[];
    /** 벡터 레이어(2번)의 도형 값을 바꾼 파일 */
    const withShape = (changes: object) => ({
      ...valid,
      frames: valid.frames.map((frame: { shapes: object[][] }) => ({ ...frame, shapes: [[], [], [{ ...frame.shapes[2][0], ...changes }]] })),
    });
    const broken = [
      'not json',
      '{}',
      { ...valid, format: 'other' },
      { ...valid, width: 2048 },
      { ...valid, fps: 0 },
      { ...valid, palette: Array(33).fill('#000000') },
      { ...valid, palette: ['red'] },
      { ...valid, layers: [] },
      { ...valid, frames: [{ cels: [cels[0]] }] },
      { ...valid, frames: [{ cels: cels.map(() => otherSize.frames[0].cels[0]) }] },
      { ...valid, frames: [{ cels: ['!!!', ...cels.slice(1)] }] },
      { ...valid, palette: ['#000000'] },
      { ...valid, path: { ...valid.path, width: 0 } },
      { ...valid, path: { ...valid.path, points: [{ x: 'a', y: 1 }] } },
      { ...valid, path: { ...valid.path, curve: 'yes' } },
      { ...valid, layers: valid.layers.map((layer: object) => ({ ...layer, kind: 'raster' })) },
      { ...valid, frames: [{ cels, shapes: [[], []] }] },
      { ...valid, frames: [{ cels, shapes: [valid.frames[0].shapes[2], [], []] }] },
      withShape({ color: 0 }),
      withShape({ color: 17 }),
      withShape({ points: [] }),
      withShape({ width: 33 }),
    ];
    for (const file of broken) {
      await expect(loadProject(typeof file === 'string' ? file : JSON.stringify(file))).rejects.toThrow();
    }
  });
});
