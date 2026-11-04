import { drawPath } from '../sprite';
import { h } from './dom';
import type { Store, Tool } from './store';

const TOOLS: [Tool, string][] = [
  ['pencil', '연필'],
  ['eraser', '지우개'],
  ['fill', '채우기'],
  ['select', '선택'],
  ['vector', '벡터'],
];

/** 도구 선택, 선택 해제, 벡터 도구 옵션(안티에일리어싱, 패스 그리기/지우기) */
export function createToolPanel(store: Store): HTMLElement {
  const buttons = TOOLS.map(([tool, label]) =>
    h('button', { textContent: label, onclick: () => store.update(() => (store.tool = tool)) }),
  );
  const deselect = h('button', {
    textContent: '선택 해제',
    onclick: () => store.update(() => (store.selection = undefined)),
  });
  const antialias = h('input', {
    type: 'checkbox',
    onchange: () => store.update(() => (store.antialias = antialias.checked)),
  });
  const render = h('button', {
    textContent: '패스 그리기',
    title: '패스를 따라 현재 레이어에 현재 색으로 픽셀을 그림',
    onclick: () =>
      store.update(() => {
        drawPath(store.sprite, store.frame, store.layer, store.path, store.color + 1, store.antialias, store.selection);
        store.path = [];
      }),
  });
  const vectorOptions = h(
    'div',
    { className: 'tool-options' },
    h(
      'label',
      { title: '팔레트 색만 쓰므로, 아래에 색이 있는 픽셀에서만 가까운 중간색으로 부드러워집니다.' },
      antialias,
      '안티에일리어싱',
    ),
    render,
    h('button', { textContent: '패스 지우기', onclick: () => store.update(() => (store.path = [])) }),
  );

  store.subscribe(() => {
    buttons.forEach((button, i) => button.classList.toggle('active', TOOLS[i][0] === store.tool));
    deselect.disabled = !store.selection;
    vectorOptions.classList.toggle('inactive', store.tool !== 'vector');
    antialias.checked = store.antialias;
    render.disabled = store.path.length < 2;
  });
  return h('section', { className: 'panel tools' }, h('h2', { textContent: '도구' }), ...buttons, deselect, vectorOptions);
}
