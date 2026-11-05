import { addLayer, addLayerMask, moveLayer, removeLayer, removeLayerMask, renderLayerRGBA } from '../sprite';
import { h } from './dom';
import type { Store } from './store';

/** 레이어 목록(위쪽 레이어가 위에 표시): 선택, 보이기, 추가(픽셀·벡터), 삭제, 이름 변경, 순서 변경 */
export function createLayerPanel(store: Store): HTMLElement {
  const setTarget = (mask: boolean) => {
    store.editMask = mask;
    store.selection = undefined;
    store.floating = undefined;
    store.shape = undefined;
    if (mask && store.tool === 'vector') store.tool = 'pencil';
  };
  const maskStatus = h('p', { className: 'hint' });
  const maskEdit = h('button', { textContent: '마스크 편집', onclick: () => store.update(() => setTarget(true)) });
  const imageEdit = h('button', { textContent: '그림 편집', onclick: () => store.update(() => setTarget(false)) });
  const maskAdd = h('button', {
    textContent: '마스크 추가',
    onclick: () => store.update(() => {
      addLayerMask(store.sprite, store.layer);
      setTarget(true);
    }),
  });
  const maskRemove = h('button', {
    textContent: '마스크 삭제',
    onclick: () => {
      if (!confirm('이 레이어의 모든 프레임에서 마스크를 삭제할까요?')) return;
      store.update(() => {
        removeLayerMask(store.sprite, store.layer);
        setTarget(false);
      });
    },
  });
  const maskToggle = h('button', { onclick: () => store.update(() => {
    const layer = store.sprite.layers[store.layer];
    if (!layer.locked) layer.maskEnabled = layer.maskEnabled === false;
  }) });
  const remove = h('button', {
    textContent: '삭제',
    onclick: () => {
      if (!confirm('현재 레이어를 모든 프레임에서 삭제할까요?')) return;
      store.update(() => {
        removeLayer(store.sprite, store.layer);
        setTarget(false);
      });
    },
  });
  const list = h('ul', { className: 'list' });
  const source = h('canvas');
  const sourceContext = source.getContext('2d')!;
  let thumbnails: HTMLCanvasElement[] = [];
  let renderQueued = false;
  const queueThumbnails = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const { sprite, frame } = store;
      source.width = sprite.width;
      source.height = sprite.height;
      const image = sourceContext.createImageData(sprite.width, sprite.height);
      thumbnails.forEach((thumbnail, layer) => {
        renderLayerRGBA(sprite, frame, layer, image.data);
        sourceContext.putImageData(image, 0, 0);
        const context = thumbnail.getContext('2d')!;
        context.clearRect(0, 0, thumbnail.width, thumbnail.height);
        context.imageSmoothingEnabled = false;
        const scale = Math.min(thumbnail.width / sprite.width, thumbnail.height / sprite.height);
        const width = Math.max(1, Math.round(sprite.width * scale));
        const height = Math.max(1, Math.round(sprite.height * scale));
        context.drawImage(source, Math.floor((thumbnail.width - width) / 2), Math.floor((thumbnail.height - height) / 2), width, height);
      });
    });
  };
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
    const current = store.sprite.layers[store.layer];
    const hasMask = !!store.sprite.frames[store.frame].masks?.[store.layer];
    remove.disabled = !!current.locked || store.sprite.layers.length <= 1;
    maskAdd.disabled = !!current.locked || hasMask;
    maskEdit.disabled = !hasMask || !!current.locked;
    maskRemove.disabled = maskToggle.disabled = !hasMask || !!current.locked;
    imageEdit.classList.toggle('active', !store.editMask);
    maskEdit.classList.toggle('active', store.editMask);
    maskToggle.textContent = current.maskEnabled === false ? '마스크 켜기' : '마스크 끄기';
    maskStatus.textContent = current.locked
      ? '보호됨: 그림·마스크 편집 및 레이어 삭제 불가'
      : store.editMask
        ? '마스크 편집: 흰색=표시, 검정=숨김. 연필·채우기=표시, 지우개=숨김'
        : '그림 편집';
    thumbnails = [];
    const items = store.sprite.layers.map((layer, i) => {
      const thumbnail = h('canvas', {
        width: 40, height: 32, className: layer.visible ? 'layer-thumbnail' : 'layer-thumbnail layer-hidden',
        title: `${layer.name} · 프레임 ${store.frame + 1}${layer.visible ? '' : ' (숨김)'}`,
      });
      thumbnail.setAttribute('role', 'img');
      thumbnail.setAttribute('aria-label', thumbnail.title);
      thumbnails.push(thumbnail);
      const visible = h('input', {
        type: 'checkbox',
        checked: layer.visible,
        title: '보이기',
        onclick: (event) => event.stopPropagation(),
        onchange: () => store.update(() => (layer.visible = visible.checked)),
      });
      return h(
        'li',
        { className: i === store.layer ? 'active' : '', onclick: () => store.update(() => { store.layer = i; setTarget(false); }) },
        visible,
        thumbnail,
        h('span', { className: 'layer-name', textContent: layer.name, title: layer.name }),
        h('label', { title: '그림·마스크 편집 및 레이어 삭제 방지', onclick: (event) => event.stopPropagation() },
          h('input', { type: 'checkbox', checked: !!layer.locked, onchange: (event) => store.update(() => {
            layer.locked = (event.target as HTMLInputElement).checked;
            store.floating = undefined;
            store.shape = undefined;
          }) }), '보호'),
        ...(store.sprite.frames[store.frame].masks?.[i] ? [h('span', { className: 'layer-kind', textContent: layer.maskEnabled === false ? '마스크 꺼짐' : '마스크' })] : []),
        ...(layer.kind === 'vector' ? [h('span', { className: 'layer-kind', textContent: '벡터' })] : []),
      );
    });
    list.replaceChildren(...items.reverse());
    queueThumbnails();
  });

  return h(
    'section',
    { className: 'panel' },
    h('h2', { textContent: '레이어' }),
    maskStatus,
    h('div', { className: 'row' }, imageEdit, maskEdit, maskAdd, maskToggle, maskRemove),
    list,
    h(
      'div',
      { className: 'row' },
      h('button', {
        textContent: '추가',
        title: '픽셀 레이어 추가',
        onclick: () => store.update(() => {
          addLayer(store.sprite, ++store.layer);
          setTarget(false);
        }),
      }),
      h('button', {
        textContent: '벡터 추가',
        title: '벡터 레이어 추가: 벡터 도구로 그린 도형을 픽셀로 굽지 않고 계속 편집할 수 있게 보관',
        onclick: () =>
          store.update(() => {
            addLayer(store.sprite, ++store.layer, 'vector');
            setTarget(false);
            store.tool = 'vector';
          }),
      }),
      remove,
      h('button', { textContent: '이름', title: '이름 변경', onclick: rename }),
      h('button', { textContent: '▲', title: '위로', onclick: () => moveBy(1) }),
      h('button', { textContent: '▼', title: '아래로', onclick: () => moveBy(-1) }),
    ),
  );
}
