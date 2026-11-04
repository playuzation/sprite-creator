import { describe, expect, it } from 'vitest';
import { addLayer, canExportSvg, createPath, createSprite, exportSvg, type VectorShape } from '../src/sprite';

const shape = (options: Partial<VectorShape>): VectorShape => ({ ...createPath(), color: 1, ...options });

/** 맨 아래 픽셀 레이어 위에 벡터 레이어 두 개 */
function vectorSprite() {
  const sprite = createSprite(16, 8);
  sprite.palette = ['#112233', '#abcdef'];
  addLayer(sprite, 1, 'vector');
  addLayer(sprite, 2, 'vector');
  sprite.frames[0].shapes[1].push(shape({ points: [{ x: 1.5, y: 2.5 }, { x: 10, y: 2.5 }], width: 3 }));
  sprite.frames[0].shapes[2].push(shape({ points: [{ x: 4, y: 4 }], color: 2, antialias: true }));
  return sprite;
}

describe('exportSvg', () => {
  it('보이는 레이어가 모두 벡터 레이어일 때만 내보낼 수 있다', () => {
    const sprite = vectorSprite();
    expect(canExportSvg(sprite)).toBe(false);
    expect(() => exportSvg(sprite, 0)).toThrow();
    sprite.layers[0].visible = false;
    expect(canExportSvg(sprite)).toBe(true);
  });

  it('보이는 도형을 아래 레이어부터 path로 담는다 (안티에일리어싱을 끄면 crispEdges, 점 하나는 길이 0인 선)', () => {
    const sprite = vectorSprite();
    sprite.layers[0].visible = false;
    expect(exportSvg(sprite, 0)).toBe(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8" viewBox="0 0 16 8" fill="none" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M1.5 2.5L10 2.5" stroke="#112233" stroke-width="3" shape-rendering="crispEdges"/>',
        '<path d="M4 4L4 4" stroke="#abcdef" stroke-width="1"/>',
        '</svg>',
        '',
      ].join('\n'),
    );
    sprite.layers[2].visible = false;
    expect(exportSvg(sprite, 0)).not.toContain('#abcdef');
  });

  it('곡선은 찍은 점을 모두 지나는 3차 베지어로 담는다 (화면에 그리는 곡선과 같은 조절점)', () => {
    const sprite = createSprite(20, 20);
    addLayer(sprite, 1, 'vector');
    sprite.layers[0].visible = false;
    sprite.frames[0].shapes[1].push(shape({ points: [{ x: 1, y: 8 }, { x: 8, y: 1 }, { x: 15, y: 8 }], curve: true }));
    expect(exportSvg(sprite, 0)).toContain('d="M1 8C2.167 6.833 5.667 1 8 1C10.333 1 13.833 6.833 15 8"');
  });
});
