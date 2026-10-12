import { MAX_COLORS, addColor, removeColor, setColor } from '../sprite';
import { h } from './dom';
import type { Store } from './store';

/** 스프라이트 팔레트(최대 32색): 색 선택, 편집, 추가, 삭제 */
export function createPalettePanel(store: Store): HTMLElement {
  const title = h('h2');
  const swatches = h('div', { className: 'swatches' });
  const picker = h('input', {
    type: 'color',
    title: '선택한 색 편집',
    oninput: () => store.update(() => setColor(store.sprite, store.color, picker.value)),
  });

  store.subscribe(() => {
    const { palette } = store.sprite;
    title.textContent = `팔레트 (${palette.length}/${MAX_COLORS})`;
    swatches.replaceChildren(
      ...palette.map((color, i) => {
        const swatch = h('button', {
          className: i === store.color ? 'swatch active' : 'swatch',
          title: color,
          onclick: () => store.update(() => (store.color = i)),
        });
        swatch.style.background = color;
        return swatch;
      }),
    );
    picker.value = palette[store.color];
  });

  return h(
    'section',
    { className: 'panel' },
    title,
    swatches,
    h(
      'div',
      { className: 'row' },
      picker,
      h('button', {
        textContent: '색 추가',
        title: '선택한 색을 복사해 새 색으로 추가',
        onclick: () => store.update(() => (store.color = addColor(store.sprite, picker.value))),
      }),
      h('button', {
        textContent: '색 삭제',
        onclick: () =>
          confirm('이 색을 쓰는 픽셀은 투명해집니다. 삭제할까요?') &&
          store.update(() => removeColor(store.sprite, store.color)),
      }),
    ),
  );
}
