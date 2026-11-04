import { clearPath, copySelection, deselect, moveSelectionTo, pasteClipboard, renderPath, saveFile, selectAll } from './commands';
import type { Store, Tool } from './store';

type Command = (store: Store) => void;

const TOOL_KEYS = new Map<string, Tool>([
  ['b', 'pencil'],
  ['e', 'eraser'],
  ['g', 'fill'],
  ['m', 'select'],
  ['p', 'vector'],
]);
const COMMAND_KEYS = new Map<string, Command>([
  ['c', copySelection],
  ['v', pasteClipboard],
  ['a', selectAll],
  ['s', saveFile],
]);
const ARROWS = new Map<string, [number, number]>([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
]);

/**
 * 키보드 단축키. 입력창에 포커스가 있을 때는 동작하지 않는다.
 * 스페이스바(화면 이동)는 캔버스 화면(canvas-view)이 처리한다.
 */
export function bindShortcuts(store: Store): void {
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.altKey) return;
    // 포커스된 버튼에서 Enter는 그 버튼을 누르는 것으로 둔다.
    if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
    const command = commandFor(store, event);
    if (!command) return;
    event.preventDefault();
    store.update(() => command(store));
  });
}

function commandFor(store: Store, event: KeyboardEvent): Command | undefined {
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) return COMMAND_KEYS.get(key);
  const tool = TOOL_KEYS.get(key);
  if (tool) return () => (store.tool = tool);
  if (key === 'escape') {
    return store.tool === 'vector' && store.sprite.path.points.length > 0 ? clearPath : deselect;
  }
  if (key === 'enter' && store.tool === 'vector') return renderPath;
  // 방향키: 선택 영역의 픽셀을 1픽셀(Shift: 10픽셀)씩 옮긴다.
  const arrow = ARROWS.get(event.key);
  const { selection } = store;
  if (arrow && selection) {
    const step = event.shiftKey ? 10 : 1;
    return () => moveSelectionTo(store, selection.x + arrow[0] * step, selection.y + arrow[1] * step);
  }
  return undefined;
}
