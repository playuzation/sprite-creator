import { MAX_STROKE_WIDTH } from '../sprite';
import { clearPath, copySelection, deselect, pasteClipboard, renderPath, selectAll } from './commands';
import { h } from './dom';
import type { Store, Tool } from './store';

const TOOLS: [Tool, string, string][] = [
  ['pencil', '연필', 'B'],
  ['eraser', '지우개', 'E'],
  ['fill', '채우기', 'G'],
  ['select', '선택', 'M'],
  ['vector', '벡터', 'P'],
];

/** 도구 선택과 도구별 옵션 (선택: 전체 선택·복사·붙여넣기, 벡터: 곡선·두께·안티에일리어싱·패스 그리기/지우기) */
export function createToolPanel(store: Store): HTMLElement {
  const command = (action: (store: Store) => void) => () => store.update(() => action(store));
  const buttons = TOOLS.map(([tool, label, key]) =>
    h('button', { textContent: label, title: `${label} (${key})`, onclick: () => store.update(() => (store.tool = tool)) }),
  );
  const deselectButton = h('button', { textContent: '선택 해제', title: '선택 해제 (Esc)', onclick: command(deselect) });

  const copy = h('button', {
    textContent: '복사',
    title: '선택 영역에서 현재 레이어의 픽셀 복사 (Ctrl+C)',
    onclick: command(copySelection),
  });
  const paste = h('button', {
    textContent: '붙여넣기',
    title: '복사한 위치에 붙여넣기. 붙인 뒤 끌어서 옮길 수 있음 (Ctrl+V)',
    onclick: command(pasteClipboard),
  });
  const selectOptions = h(
    'div',
    { className: 'tool-options' },
    h('button', { textContent: '전체 선택', title: '전체 선택 (Ctrl+A)', onclick: command(selectAll) }),
    copy,
    paste,
  );

  const checkbox = (option: 'curve' | 'antialias') => {
    const input = h('input', {
      type: 'checkbox',
      onchange: () => store.update(() => (store.sprite.path[option] = input.checked)),
    });
    return input;
  };
  const curve = checkbox('curve');
  const antialias = checkbox('antialias');
  const width = h('input', {
    type: 'number',
    min: '1',
    max: String(MAX_STROKE_WIDTH),
    title: `선 두께 (1~${MAX_STROKE_WIDTH}픽셀)`,
    onchange: () =>
      store.update(() => {
        const value = Number(width.value);
        if (Number.isInteger(value) && value >= 1 && value <= MAX_STROKE_WIDTH) store.sprite.path.width = value;
      }),
  });
  const render = h('button', {
    textContent: '패스 그리기',
    title: '패스를 따라 현재 레이어에 현재 색으로 그리기. 패스는 남음 (Enter)',
    onclick: command(renderPath),
  });
  const vectorOptions = h(
    'div',
    { className: 'tool-options' },
    h('label', { title: '찍은 점을 모두 지나는 부드러운 곡선으로 그리기' }, curve, '곡선'),
    h('label', {}, '두께 ', width),
    h(
      'label',
      { title: '팔레트 색만 쓰므로, 아래에 색이 있는 픽셀에서만 가까운 중간색으로 부드러워집니다.' },
      antialias,
      '안티에일리어싱',
    ),
    render,
    h('button', { textContent: '패스 지우기', title: '패스 지우기 (Esc)', onclick: command(clearPath) }),
  );

  store.subscribe(() => {
    const { path } = store.sprite;
    buttons.forEach((button, i) => button.classList.toggle('active', TOOLS[i][0] === store.tool));
    deselectButton.disabled = copy.disabled = !store.selection;
    paste.disabled = !store.clipboard;
    selectOptions.classList.toggle('inactive', store.tool !== 'select');
    vectorOptions.classList.toggle('inactive', store.tool !== 'vector');
    curve.checked = path.curve;
    antialias.checked = path.antialias;
    if (document.activeElement !== width) width.value = String(path.width);
    render.disabled = path.points.length < 2;
  });
  return h(
    'section',
    { className: 'panel tools' },
    h('h2', { textContent: '도구' }),
    ...buttons,
    deselectButton,
    h('div', { className: 'tool-options-stack' }, selectOptions, vectorOptions),
  );
}
