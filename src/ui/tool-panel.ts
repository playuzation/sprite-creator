import { h } from './dom';
import type { Store, Tool } from './store';

const TOOLS: [Tool, string][] = [
  ['pencil', '연필'],
  ['eraser', '지우개'],
  ['fill', '채우기'],
];

export function createToolPanel(store: Store): HTMLElement {
  const buttons = TOOLS.map(([tool, label]) =>
    h('button', { textContent: label, onclick: () => store.update(() => (store.tool = tool)) }),
  );
  store.subscribe(() => buttons.forEach((button, i) => button.classList.toggle('active', TOOLS[i][0] === store.tool)));
  return h('section', { className: 'panel tools' }, h('h2', { textContent: '도구' }), ...buttons);
}
