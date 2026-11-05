import { MIN_SIZE, MAX_SIZE, isValidSize, resizeCanvas, scaleSprite, type Anchor } from '../sprite';
import { h } from './dom';
import type { Store } from './store';

type Mode = 'scale' | 'canvas';

/** 캔버스 변경 기준 9곳: [x, y, 표시, 이름] (위에서 아래, 왼쪽에서 오른쪽 순서) */
const ANCHORS: [number, number, string, string][] = [
  [0, 0, '↖', '왼쪽 위'],
  [0.5, 0, '↑', '위'],
  [1, 0, '↗', '오른쪽 위'],
  [0, 0.5, '←', '왼쪽'],
  [0.5, 0.5, '•', '가운데'],
  [1, 0.5, '→', '오른쪽'],
  [0, 1, '↙', '왼쪽 아래'],
  [0.5, 1, '↓', '아래'],
  [1, 1, '↘', '오른쪽 아래'],
];

const HINTS: Record<Mode, [string, string]> = {
  scale: ['이미지 해상도 변경', '그림을 늘리거나 줄입니다. 팔레트 색이 섞이지 않도록 가장 가까운 픽셀을 가져옵니다(최근접 이웃).'],
  canvas: ['이미지 캔버스 변경', '그림은 그대로 두고, 캔버스를 늘리면 투명하게 채우고 줄이면 기준의 반대쪽부터 잘라냅니다.'],
};

/**
 * 해상도 변경(그림을 늘리거나 줄임)과 캔버스 변경(투명하게 채우거나 잘라냄) 창.
 * 해상도는 '비율 유지'로 한쪽만 바꿀 수 있고, 캔버스는 그림을 붙여 둘 기준을 9곳(가운데와 8방향) 중에서 고른다.
 */
export function createSizeDialog(store: Store): { element: HTMLDialogElement; open(mode: Mode): void } {
  let mode: Mode = 'scale';
  let anchor: Anchor = { x: 0.5, y: 0.5 };
  const title = h('h2');
  const hint = h('p', { className: 'hint' });
  const sizeInput = (name: string) => h('input', { type: 'number', min: String(MIN_SIZE), max: String(MAX_SIZE), title: name });
  const width = sizeInput('너비');
  const height = sizeInput('높이');
  const keepRatio = h('input', { type: 'checkbox', checked: true });
  const ratioOption = h('label', {}, keepRatio, '비율 유지');
  // 비율 유지: 한쪽을 바꾸면 다른 쪽을 지금 그림의 비율대로 맞춘다.
  const follow = (changed: HTMLInputElement, other: HTMLInputElement, ratio: () => number) => {
    changed.oninput = () => {
      if (mode !== 'scale' || !keepRatio.checked) return;
      other.value = String(Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(Number(changed.value) * ratio()))));
    };
  };
  follow(width, height, () => store.sprite.height / store.sprite.width);
  follow(height, width, () => store.sprite.width / store.sprite.height);

  const anchorButtons = ANCHORS.map(([x, y, symbol, name]) =>
    h('button', {
      type: 'button',
      textContent: symbol,
      title: name,
      onclick: () => {
        anchor = { x, y };
        showAnchor();
      },
    }),
  );
  const showAnchor = () =>
    anchorButtons.forEach((button, i) => button.classList.toggle('active', ANCHORS[i][0] === anchor.x && ANCHORS[i][1] === anchor.y));
  const anchorOption = h('div', { className: 'anchor' }, '기준', h('div', { className: 'anchor-grid' }, ...anchorButtons));

  const apply = () => {
    const [w, hgt] = [Number(width.value), Number(height.value)];
    if (!isValidSize(w) || !isValidSize(hgt)) return alert(`크기는 ${MIN_SIZE}~${MAX_SIZE} 사이의 정수여야 합니다.`);
    store.update(() => {
      if (mode === 'scale') scaleSprite(store.sprite, w, hgt);
      else resizeCanvas(store.sprite, w, hgt, anchor);
      store.selection = undefined; // 그림 위치가 바뀌므로 선택 영역은 해제한다.
    });
    dialog.close();
  };
  const dialog = h(
    'dialog',
    { className: 'size-dialog' },
    title,
    h('div', { className: 'row' }, h('label', {}, '너비 ', width), h('label', {}, '높이 ', height)),
    ratioOption,
    anchorOption,
    hint,
    h(
      'div',
      { className: 'row actions' },
      h('button', { textContent: '취소', onclick: () => dialog.close() }),
      h('button', { textContent: '확인', onclick: apply }),
    ),
  );

  const open = (next: Mode) => {
    mode = next;
    [title.textContent, hint.textContent] = HINTS[mode];
    ratioOption.hidden = mode !== 'scale';
    anchorOption.hidden = mode !== 'canvas';
    width.value = String(store.sprite.width);
    height.value = String(store.sprite.height);
    showAnchor();
    dialog.showModal();
  };
  return { element: dialog, open };
}
