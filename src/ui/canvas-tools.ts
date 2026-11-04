import { TRANSPARENT, distanceToPath, drawLine, floodFill, type Point, type VectorShape } from '../sprite';
import { moveSelectionTo, onVectorLayer } from './commands';
import type { Store, Tool } from './store';

/** 포인터를 누른 채 이어지는 도구 작업. 화면 이동으로 바뀌면(두 번째 손가락) cancel로 되돌린다. */
export interface Gesture {
  move(point: Point): void;
  cancel(): void;
}

/** 벡터 점을 잡을 수 있는 거리 (화면 픽셀) */
const HANDLE_REACH = 8;
/** 픽셀을 칠하는 도구. 벡터 레이어에서는 쓸 수 없다. */
const PAINT_TOOLS: Tool[] = ['pencil', 'eraser', 'fill'];

/** 현재 레이어에서 현재 도구를 쓸 수 있는지 */
export function canUseTool(store: Store): boolean {
  return !onVectorLayer(store) || !PAINT_TOOLS.includes(store.tool);
}

/**
 * point(픽셀 좌표)에서 현재 도구의 작업을 시작한다.
 * 그리기 도구는 선택 영역이 있으면 그 안의 픽셀만 바꾼다. redraw는 캔버스를 다시 그린다.
 * 벡터 레이어에서는 칠하기·픽셀 옮기기 대신 벡터 도구로 도형을 편집한다.
 */
export function startGesture(store: Store, point: Point, zoom: number, redraw: () => void): Gesture {
  const { sprite, selection } = store;
  if (!canUseTool(store)) return { move: () => {}, cancel: () => {} };
  const pixel = (p: Point): [number, number] => [Math.floor(p.x), Math.floor(p.y)];
  // 셀을 바꾸는 도구는 시작 전 셀을 복사해 두었다가, 취소하면 되돌린다.
  const editCel = () => {
    const cel = sprite.frames[store.frame].cels[store.layer];
    const backup = cel.slice();
    const restore = () => {
      cel.set(backup);
      redraw();
    };
    return { cel, restore };
  };

  switch (store.tool) {
    case 'pencil':
    case 'eraser': {
      const { cel, restore } = editCel();
      const value = store.tool === 'eraser' ? TRANSPARENT : store.color + 1;
      let last = pixel(point);
      const lineTo = (next: [number, number]) => {
        drawLine(cel, sprite.width, ...last, ...next, value, selection);
        last = next;
        redraw();
      };
      lineTo(last);
      return { move: (p) => lineTo(pixel(p)), cancel: restore };
    }
    case 'fill': {
      const { cel, restore } = editCel();
      floodFill(cel, sprite.width, ...pixel(point), store.color + 1, selection);
      redraw();
      return { move: () => {}, cancel: restore };
    }
    case 'select': {
      const [x0, y0] = pixel(point);
      // 선택 영역 안을 끌면 현재 레이어의 그 픽셀을 옮긴다 (픽셀 레이어만).
      const inside =
        !onVectorLayer(store) &&
        selection &&
        x0 >= selection.x &&
        x0 < selection.x + selection.width &&
        y0 >= selection.y &&
        y0 < selection.y + selection.height;
      if (inside) {
        const { restore } = editCel();
        const { floating } = store;
        return {
          move: (p) => {
            const [px, py] = pixel(p);
            store.update(() => moveSelectionTo(store, selection.x + px - x0, selection.y + py - y0));
          },
          cancel: () => {
            restore();
            store.update(() => ((store.selection = selection), (store.floating = floating)));
          },
        };
      }
      // 밖을 끌면 새 직사각형을 고른다. 끌지 않고 클릭만 하면 선택이 해제된다.
      store.update(() => (store.selection = undefined));
      return {
        move: (p) => {
          const [px, py] = pixel(p);
          const x1 = Math.min(Math.max(px, 0), sprite.width - 1);
          const y1 = Math.min(Math.max(py, 0), sprite.height - 1);
          if (!store.selection && x1 === x0 && y1 === y0) return;
          const [x, y] = [Math.min(x0, x1), Math.min(y0, y1)];
          store.update(() => (store.selection = { x, y, width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1 }));
        },
        cancel: () => store.update(() => (store.selection = selection)),
      };
    }
    case 'vector': {
      if (onVectorLayer(store)) return editShape(store, point, zoom);
      // 가까운 점이 있으면 그 점을 옮기고, 없으면 새 점을 찍어 끄는 대로 옮긴다.
      const { points } = sprite.path;
      const previous = [...points];
      let index = points.findIndex((p) => Math.hypot(p.x - point.x, p.y - point.y) * zoom <= HANDLE_REACH);
      if (index < 0) store.update(() => (index = points.push(point) - 1));
      const start = points[index];
      return {
        move: (p) => store.update(() => (points[index] = { x: start.x + p.x - point.x, y: start.y + p.y - point.y })),
        cancel: () => store.update(() => (sprite.path.points = previous)),
      };
    }
  }
}

/**
 * 벡터 레이어의 도형 편집. 편집 중인 도형의 점 근처를 끌면 그 점을 옮기고, 다른 도형의 선을 누르면 그 도형을 고른다
 * (점 근처면 그 점을 바로 옮김). 빈 곳을 누르면 편집 중인 도형에 점을 이어 찍고, 없으면 현재 색과 벡터 도구 설정으로 새 도형을 시작한다.
 */
function editShape(store: Store, point: Point, zoom: number): Gesture {
  const { sprite } = store;
  const shapes = sprite.frames[store.frame].shapes[store.layer];
  const reach = HANDLE_REACH / zoom;
  const near = (p: Point) => Math.hypot(p.x - point.x, p.y - point.y) <= reach;
  const previous = { shapes: [...shapes], shape: store.shape, color: store.color };
  // 위에 그린 도형부터 찾는다.
  const hit = store.shape?.points.some(near)
    ? undefined
    : [...shapes].reverse().find((s) => s !== store.shape && distanceToPath(s, point) <= s.width / 2 + reach);
  const shape: VectorShape = hit ?? store.shape ?? { ...sprite.path, points: [], color: store.color + 1 };
  const points = [...shape.points];
  let index = points.findIndex(near);
  store.update(() => {
    if (!shapes.includes(shape)) shapes.push(shape);
    store.shape = shape;
    store.color = shape.color - 1;
    if (index < 0 && !hit) index = shape.points.push(point) - 1;
  });
  const start = shape.points[index];
  return {
    move: (p) => start && store.update(() => (shape.points[index] = { x: start.x + p.x - point.x, y: start.y + p.y - point.y })),
    cancel: () =>
      store.update(() => {
        shapes.splice(0, shapes.length, ...previous.shapes);
        shape.points = points;
        store.shape = previous.shape;
        store.color = previous.color;
      }),
  };
}
