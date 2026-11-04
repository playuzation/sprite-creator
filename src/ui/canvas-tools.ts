import { TRANSPARENT, drawLine, floodFill, type Point } from '../sprite';
import type { Store } from './store';

/** 포인터를 누른 채 이어지는 도구 작업. 화면 이동으로 바뀌면(두 번째 손가락) cancel로 되돌린다. */
export interface Gesture {
  move(point: Point): void;
  cancel(): void;
}

/** 벡터 점을 잡을 수 있는 거리 (화면 픽셀) */
const HANDLE_REACH = 8;

/**
 * point(픽셀 좌표)에서 현재 도구의 작업을 시작한다.
 * 그리기 도구는 선택 영역이 있으면 그 안의 픽셀만 바꾼다. redraw는 캔버스를 다시 그린다.
 */
export function startGesture(store: Store, point: Point, zoom: number, redraw: () => void): Gesture {
  const { sprite, selection } = store;
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
      // 끌어서 직사각형을 고른다. 끌지 않고 클릭만 하면 선택이 해제된다.
      const [x0, y0] = pixel(point);
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
      // 가까운 점이 있으면 그 점을 옮기고, 없으면 새 점을 찍어 끄는 대로 옮긴다.
      const previous = [...store.path];
      let index = store.path.findIndex((p) => Math.hypot(p.x - point.x, p.y - point.y) * zoom <= HANDLE_REACH);
      if (index < 0) store.update(() => (index = store.path.push(point) - 1));
      const start = store.path[index];
      return {
        move: (p) => store.update(() => (store.path[index] = { x: start.x + p.x - point.x, y: start.y + p.y - point.y })),
        cancel: () => store.update(() => (store.path = previous)),
      };
    }
  }
}
