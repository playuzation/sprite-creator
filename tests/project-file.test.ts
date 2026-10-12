import { describe, expect, it } from 'vitest';
import { addLayer, createSprite, duplicateFrame, loadProject, saveProject } from '../src/sprite';

function sampleSprite() {
  const sprite = createSprite(64, 32);
  addLayer(sprite, 1);
  sprite.layers[1] = { name: '그림자', visible: false };
  sprite.frames[0].cels[0].fill(3, 10, 200);
  sprite.frames[0].cels[1][5] = 16;
  duplicateFrame(sprite, 0);
  sprite.frames[1].cels[0][0] = 7;
  sprite.fps = 12;
  return sprite;
}

describe('project file', () => {
  it('저장한 JSON을 불러오면 같은 스프라이트가 된다', async () => {
    const sprite = sampleSprite();
    const json = await saveProject(sprite);
    expect(JSON.parse(json)).toMatchObject({ format: 'sprite-creator', version: 1, width: 64, height: 32, fps: 12 });
    expect(await loadProject(json)).toEqual(sprite);
  });

  it('1024x1024 빈 캔버스도 작게 저장된다', async () => {
    const json = await saveProject(createSprite(1024, 1024));
    expect(json.length).toBeLessThan(10_000);
    expect((await loadProject(json)).frames[0].cels[0]).toHaveLength(1024 * 1024);
  });

  it('잘못된 파일은 거부한다', async () => {
    const valid = JSON.parse(await saveProject(sampleSprite()));
    const otherSize = JSON.parse(await saveProject(createSprite(8, 8)));
    const broken = [
      'not json',
      '{}',
      { ...valid, format: 'other' },
      { ...valid, width: 2048 },
      { ...valid, fps: 0 },
      { ...valid, palette: Array(33).fill('#000000') },
      { ...valid, palette: ['red'] },
      { ...valid, layers: [] },
      { ...valid, frames: [{ cels: [valid.frames[0].cels[0]] }] },
      { ...valid, frames: [{ cels: otherSize.frames[0].cels.concat(otherSize.frames[0].cels) }] },
      { ...valid, frames: [{ cels: ['!!!', valid.frames[0].cels[1]] }] },
      { ...valid, palette: ['#000000'] },
    ];
    for (const file of broken) {
      await expect(loadProject(typeof file === 'string' ? file : JSON.stringify(file))).rejects.toThrow();
    }
  });
});
