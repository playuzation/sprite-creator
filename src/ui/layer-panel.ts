import { addLayer, moveLayer, removeLayer } from '../sprite';
import { h } from './dom';
import type { Store } from './store';

/** 레이어 목록(위쪽 레이어가 위에 표시): 선택, 보이기, 추가, 삭제, 이름 변경, 순서 변경 */
export function createLayerPanel(store: Store): HTMLElement {
  const list = h('ul', { className: 'list' });
  const moveBy = (offset: number) =>
    store.update(() => {
      const to = store.layer + offset;
      if (to < 0 || to >= store.sprite.layers.length) return;
      moveLayer(store.sprite, store.layer, to);
      store.layer = to;
    });
  const rename = () => {
    const layer = store.sprite.layers[store.layer];
    const name = prompt('레이어 이름', layer.name)?.trim();
    if (name) store.update(() => (layer.name = name));
  };

  store.subscribe(() => {
    const items = store.sprite.layers.map((layer, i) => {
      const visible = h('input', {
        type: 'checkbox',
        checked: layer.visible,
        title: '보이기',
        onclick: (event) => event.stopPropagation(),
        onchange: () => store.update(() => (layer.visible = visible.checked)),
      });
      return h(
        'li',
        { className: i === store.layer ? 'active' : '', onclick: () => store.update(() => (store.layer = i)) },
        visible,
        layer.name,
      );
    });
    list.replaceChildren(...items.reverse());
  });

  return h(
    'section',
    { className: 'panel' },
    h('h2', { textContent: '레이어' }),
    list,
    h(
      'div',
      { className: 'row' },
      h('button', {
        textContent: '추가',
        onclick: () => store.update(() => addLayer(store.sprite, ++store.layer)),
      }),
      h('button', {
        textContent: '삭제',
        onclick: () =>
          confirm('현재 레이어를 모든 프레임에서 삭제할까요?') &&
          store.update(() => removeLayer(store.sprite, store.layer)),
      }),
      h('button', { textContent: '이름', title: '이름 변경', onclick: rename }),
      h('button', { textContent: '▲', title: '위로', onclick: () => moveBy(1) }),
      h('button', { textContent: '▼', title: '아래로', onclick: () => moveBy(-1) }),
    ),
  );
}
