import { copyRegion, drawPath, pasteRegion, saveProject, type Rect, type VectorPath } from '../sprite';
import { download } from './dom';
import type { Floating, Store } from './store';

/** 버튼과 단축키가 함께 쓰는 편집 명령. store.update 안에서 호출한다. */

const currentCel = (store: Store) => store.sprite.frames[store.frame].cels[store.layer];
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const samePixels = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, i) => value === b[i]);
/** rect가 캔버스 안에 들어오도록 왼쪽 위 위치를 맞춘다. */
const fit = (store: Store, rect: Rect, x: number, y: number): Rect => ({
  ...rect,
  x: Math.min(Math.max(x, 0), Math.max(store.sprite.width - rect.width, 0)),
  y: Math.min(Math.max(y, 0), Math.max(store.sprite.height - rect.height, 0)),
});

/** 현재 레이어가 벡터 레이어인지. 벡터 레이어의 그림은 벡터 도구로 편집하는 도형뿐이라 픽셀을 칠하거나 옮길 수 없다. */
export const onVectorLayer = (store: Store) => store.sprite.layers[store.layer].kind === 'vector';

/** 벡터 도구 설정(곡선·두께·안티에일리어싱)이 바꿀 패스: 편집 중인 도형, 없으면 픽셀 레이어의 패스이자 새 도형의 기본값 */
export const editingPath = (store: Store): VectorPath => store.shape ?? store.sprite.path;

export function selectAll(store: Store): void {
  store.selection = { x: 0, y: 0, width: store.sprite.width, height: store.sprite.height };
}

export function deselect(store: Store): void {
  store.selection = undefined;
}

/** 지금 셀에 찍힌 그대로 남아 있는, 옮기는 중인 픽셀 */
function liveFloating(store: Store): Floating | undefined {
  const { floating, selection, sprite } = store;
  const cel = currentCel(store);
  if (!floating || !selection || floating.cel !== cel || !sameRect(floating.rect, selection)) return undefined;
  return samePixels(copyRegion(cel, sprite.width, selection), floating.stamped) ? floating : undefined;
}

/** pixels를 rect에 찍고(투명한 곳은 원래 픽셀이 보임) 선택 영역으로 삼는다. 다시 옮길 수 있도록 기억해 둔다. */
function stamp(store: Store, rect: Rect, pixels: Uint8Array): void {
  const { width } = store.sprite;
  const cel = currentCel(store);
  const under = copyRegion(cel, width, rect);
  pasteRegion(cel, width, rect, pixels, false);
  store.selection = rect;
  store.floating = { cel, rect, pixels, under, stamped: copyRegion(cel, width, rect) };
}

/** 현재 레이어에서 선택 영역의 픽셀을 (x, y) 위치로 옮긴다. 처음 옮길 때는 원래 자리를 투명하게 비운다. */
export function moveSelectionTo(store: Store, x: number, y: number): void {
  const { selection, sprite } = store;
  if (!selection || onVectorLayer(store)) return;
  const cel = currentCel(store);
  const floating = liveFloating(store);
  // 이미 옮기는 중이면 그 자리의 원래 픽셀을 되살리고, 아니면 선택 영역의 픽셀을 떼어 낸다.
  const pixels = floating?.pixels ?? copyRegion(cel, sprite.width, selection);
  pasteRegion(cel, sprite.width, selection, floating?.under ?? new Uint8Array(pixels.length), true);
  stamp(store, fit(store, selection, x, y), pixels);
}

/** 선택 영역에서 현재 레이어의 픽셀을 복사한다. */
export function copySelection(store: Store): void {
  const { selection, sprite } = store;
  if (!selection || onVectorLayer(store)) return;
  const pixels = liveFloating(store)?.pixels ?? copyRegion(currentCel(store), sprite.width, selection);
  store.clipboard = { rect: { ...selection }, pixels: pixels.slice() };
}

/** 복사한 픽셀을 현재 레이어의 복사했던 위치에 붙인다. 붙인 픽셀은 선택 도구로 바로 끌어 옮길 수 있다. */
export function pasteClipboard(store: Store): void {
  const { clipboard, sprite } = store;
  if (!clipboard || onVectorLayer(store)) return;
  // 복사한 뒤 팔레트에서 지워진 색은 투명으로 붙인다.
  const pixels = clipboard.pixels.map((value) => (value > sprite.palette.length ? 0 : value));
  stamp(store, fit(store, clipboard.rect, clipboard.rect.x, clipboard.rect.y), pixels);
  store.tool = 'select';
}

/** 벡터 패스를 현재 레이어에 현재 색으로 그린다 (선택 영역이 있으면 그 안만). 패스는 남겨 둔다. */
export function renderPath(store: Store): void {
  if (store.sprite.path.points.length < 2) return;
  drawPath(store.sprite, store.frame, store.layer, store.sprite.path, store.color + 1, store.selection);
}

export function clearPath(store: Store): void {
  store.sprite.path.points = [];
}

/** 도형 편집을 마친다. 다음에 빈 곳을 누르면 새 도형이 시작된다. */
export function finishShape(store: Store): void {
  store.shape = undefined;
}

/** 편집 중인 도형을 지운다. */
export function deleteShape(store: Store): void {
  const shapes = store.sprite.frames[store.frame].shapes[store.layer];
  if (store.shape && shapes.includes(store.shape)) shapes.splice(shapes.indexOf(store.shape), 1);
  store.shape = undefined;
}

/** 팔레트 색을 고른다. 편집 중인 도형이 있으면 그 도형의 색도 바꾼다. */
export function pickColor(store: Store, index: number): void {
  store.color = index;
  if (store.shape) store.shape.color = index + 1;
}

/** 프로젝트 파일(JSON)로 내려받는다. */
export function saveFile(store: Store): void {
  saveProject(store.sprite).then(
    (json) => download(json, 'application/json', 'sprite.json'),
    (error: Error) => alert(`저장에 실패했습니다: ${error.message}`),
  );
}
