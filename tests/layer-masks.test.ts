import { describe, expect, it } from 'vitest';
import {
  addLayer, addLayerMask, compositeFrame, createPath, createSprite, drawPath, duplicateFrame,
  exportGif, exportSvg, loadProject, moveLayer, removeLayer, removeLayerMask, resizeCanvas, saveProject, scaleSprite,
} from '../src/sprite';
import { canUseTool, startGesture } from '../src/ui/canvas-tools';
import { copySelection, deleteShape, moveSelectionTo, pasteClipboard, pickColor, renderPath } from '../src/ui/commands';
import { Store } from '../src/ui/store';

describe('layer masks', () => {
  it('마스크는 원본을 보존하고 아래 레이어를 드러내며 끄기·삭제로 복원된다', () => {
    const s = createSprite(2, 1);
    s.frames[0].cels[0].fill(2);
    addLayer(s, 1);
    s.frames[0].cels[1].fill(3);
    addLayerMask(s, 1);
    s.frames[0].masks![1]![0] = 0;
    expect([...compositeFrame(s, 0)]).toEqual([2, 3]);
    expect([...s.frames[0].cels[1]]).toEqual([3, 3]);
    s.layers[1].maskEnabled = false;
    expect([...compositeFrame(s, 0)]).toEqual([3, 3]);
    removeLayerMask(s, 1);
    expect([...compositeFrame(s, 0)]).toEqual([3, 3]);
  });

  it('벡터 도형에도 적용하고 SVG와 GIF에 반영한다', () => {
    const s = createSprite(2, 1);
    s.layers[0].kind = 'vector';
    s.frames[0].shapes[0].push({ ...createPath(), points: [{ x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 }], color: 1 });
    addLayerMask(s, 0);
    s.frames[0].masks![0]![0] = 0;
    expect([...compositeFrame(s, 0)]).toEqual([0, 1]);
    const svg = exportSvg(s, 0);
    expect(svg).toContain('<rect x="1" y="0" width="1" height="1"/>');
    expect(svg).toContain('clip-path="url(#layer-mask-0)"');
    const gif = exportGif(s);
    s.layers[0].maskEnabled = false;
    expect(exportSvg(s, 0)).not.toContain('clipPath');
    expect(exportGif(s)).not.toEqual(gif);
  });

  it('프레임 복제는 독립 마스크를 만들고 레이어 순서·추가·삭제와 함께 이동한다', () => {
    const s = createSprite(2, 1);
    duplicateFrame(s, 0);
    addLayerMask(s, 0);
    s.frames[0].masks![0]![0] = 0;
    expect([...s.frames[1].masks![0]!]).toEqual([1, 1]);
    duplicateFrame(s, 0);
    s.frames[1].masks![0]![1] = 0;
    expect([...s.frames[0].masks![0]!]).toEqual([0, 1]);
    addLayer(s, 1, 'vector');
    moveLayer(s, 0, 1);
    expect(s.frames[0].masks![0]).toBeNull();
    expect([...s.frames[0].masks![1]!]).toEqual([0, 1]);
    removeLayer(s, 0);
    expect(s.frames.every((f) => f.masks!.length === 1)).toBe(true);
    removeLayerMask(s, 0);
    expect(s.frames.every((f) => f.masks![0] === null)).toBe(true);
  });

  it('해상도 변경은 마스크도 확대하고 캔버스 확장 부분은 표시한다', () => {
    const s = createSprite(2, 1);
    addLayerMask(s, 0);
    s.frames[0].masks![0]!.set([0, 1]);
    scaleSprite(s, 4, 1);
    expect([...s.frames[0].masks![0]!]).toEqual([0, 0, 1, 1]);
    resizeCanvas(s, 6, 1, { x: 0.5, y: 0 });
    expect([...s.frames[0].masks![0]!]).toEqual([1, 0, 0, 1, 1, 1]);
    resizeCanvas(s, 2, 1, { x: 1, y: 0 });
    expect([...s.frames[0].masks![0]!]).toEqual([1, 1]);
  });

  it('마스크 편집은 선택 영역 안에서만 동작하고 픽셀·도형을 바꾸지 않는다', () => {
    const store = new Store();
    store.sprite = createSprite(3, 1);
    store.sprite.frames[0].cels[0].fill(2);
    addLayerMask(store.sprite, 0);
    store.editMask = true;
    store.tool = 'eraser';
    store.selection = { x: 1, y: 0, width: 1, height: 1 };
    startGesture(store, { x: 0, y: 0 }, 1, () => {}).move({ x: 2, y: 0 });
    expect([...store.sprite.frames[0].masks![0]!]).toEqual([1, 0, 1]);
    store.tool = 'fill';
    startGesture(store, { x: 1, y: 0 }, 1, () => {});
    expect([...store.sprite.frames[0].masks![0]!]).toEqual([1, 1, 1]);
    store.tool = 'vector';
    expect(canUseTool(store)).toBe(false);
    expect([...store.sprite.frames[0].cels[0]]).toEqual([2, 2, 2]);
  });

  it('새 필드 없는 프로젝트를 읽고 마스크·보호 설정을 왕복 저장한다', async () => {
    const s = createSprite(2, 1);
    const legacy = await loadProject(await saveProject(s));
    expect(legacy.layers[0].locked).toBeUndefined();
    expect(legacy.frames[0].masks).toBeUndefined();
    addLayerMask(s, 0);
    s.frames[0].masks![0]![0] = 0;
    s.layers[0].locked = true;
    s.layers[0].maskEnabled = false;
    expect(await loadProject(await saveProject(s))).toEqual(s);
  });

  it('잘못된 마스크 길이·값·배열과 보호 플래그를 거부한다', async () => {
    const s = createSprite(2, 1);
    addLayerMask(s, 0);
    const file = JSON.parse(await saveProject(s));
    for (const change of [{ locked: 'yes' }, { maskEnabled: 1 }]) {
      await expect(loadProject(JSON.stringify({ ...file, layers: [{ ...file.layers[0], ...change }] }))).rejects.toThrow();
    }
    for (const masks of [[], [17], [null, null], ['!!!']]) {
      await expect(loadProject(JSON.stringify({ ...file, frames: [{ ...file.frames[0], masks }] }))).rejects.toThrow();
    }
    s.frames[0].masks![0] = new Uint8Array([0]);
    await expect(loadProject(await saveProject(s))).rejects.toThrow();
    s.frames[0].masks![0] = new Uint8Array([0, 2]);
    await expect(loadProject(await saveProject(s))).rejects.toThrow();
  });
});

describe('layer protection', () => {
  it('포인터·붙여넣기·이동·패스 그리기를 막되 복사와 합성은 허용한다', () => {
    const store = new Store();
    store.sprite = createSprite(2, 1);
    store.sprite.frames[0].cels[0].set([1, 2]);
    store.selection = { x: 0, y: 0, width: 1, height: 1 };
    store.sprite.path.points = [{ x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 }];
    store.sprite.layers[0].locked = true;
    copySelection(store);
    expect(store.clipboard?.pixels[0]).toBe(1);
    for (const tool of ['pencil', 'eraser', 'fill', 'vector'] as const) {
      store.tool = tool;
      expect(canUseTool(store)).toBe(false);
      startGesture(store, { x: 0, y: 0 }, 1, () => {}).move({ x: 1, y: 0 });
    }
    moveSelectionTo(store, 1, 0);
    pasteClipboard(store);
    renderPath(store);
    drawPath(store.sprite, 0, 0, store.sprite.path, 3);
    expect([...compositeFrame(store.sprite, 0)]).toEqual([1, 2]);
    store.sprite.layers[0].locked = false;
    store.tool = 'eraser';
    startGesture(store, { x: 0, y: 0 }, 1, () => {});
    expect([...compositeFrame(store.sprite, 0)]).toEqual([0, 2]);
  });

  it('보호한 벡터 도형과 마스크 변경·삭제를 막는다', () => {
    const store = new Store();
    const s = store.sprite = createSprite(2, 1);
    s.layers[0].kind = 'vector';
    const shape = { ...createPath(), points: [{ x: 0.5, y: 0.5 }], color: 1 };
    s.frames[0].shapes[0].push(shape);
    addLayerMask(s, 0);
    s.layers[0].locked = true;
    store.shape = shape;
    pickColor(store, 2);
    deleteShape(store);
    expect(shape.color).toBe(1);
    expect(s.frames[0].shapes[0]).toHaveLength(1);
    expect(() => addLayerMask(s, 0)).toThrow('보호');
    expect(() => removeLayerMask(s, 0)).toThrow('보호');
    addLayer(s, 1);
    expect(() => removeLayer(s, 0)).toThrow('보호');
    store.layer = 0;
    store.editMask = true;
    store.tool = 'eraser';
    startGesture(store, { x: 0, y: 0 }, 1, () => {});
    expect([...s.frames[0].masks![0]!]).toEqual([1, 1]);
  });
});
