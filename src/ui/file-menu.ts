import { MAX_SIZE, createSprite, exportGif, loadProject, renderFrameRGBA, resizeSprite, saveProject } from '../sprite';
import { download, h } from './dom';
import type { Store } from './store';

/** 상단 메뉴: 새로 만들기/크기 변경, 프로젝트 저장/불러오기(JSON), PNG/GIF 내보내기 */
export function createFileMenu(store: Store): HTMLElement {
  const sizeInput = (title: string) => h('input', { type: 'number', min: '1', max: String(MAX_SIZE), title });
  const width = sizeInput('너비');
  const height = sizeInput('높이');
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  let shownSize = '';

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // 같은 파일을 다시 고를 수 있게 비운다.
    if (!file) return;
    try {
      const sprite = await loadProject(await file.text());
      store.update(() => store.open(sprite));
    } catch (error) {
      alert(`불러오기에 실패했습니다: ${(error as Error).message}`);
    }
  };
  const save = () =>
    saveProject(store.sprite).then(
      (json) => download(json, 'application/json', 'sprite.json'),
      (error: Error) => alert(`저장에 실패했습니다: ${error.message}`),
    );
  const resize = () => {
    const [newWidth, newHeight] = [Number(width.value), Number(height.value)];
    const shrinking = newWidth < store.sprite.width || newHeight < store.sprite.height;
    if (!shrinking || confirm('캔버스 밖으로 나가는 픽셀은 사라집니다. 크기를 바꿀까요?')) {
      store.update(() => resizeSprite(store.sprite, newWidth, newHeight));
    }
  };
  const exportPng = () => {
    const { sprite, frame } = store;
    const canvas = h('canvas', { width: sprite.width, height: sprite.height });
    canvas.getContext('2d')!.putImageData(new ImageData(renderFrameRGBA(sprite, frame), sprite.width), 0, 0);
    canvas.toBlob((blob) => blob && download(blob, 'image/png', `sprite-frame${frame + 1}.png`));
  };

  store.subscribe(() => {
    // 입력 중인 값을 덮어쓰지 않도록 캔버스 크기가 바뀔 때만 맞춘다.
    const size = `${store.sprite.width}x${store.sprite.height}`;
    if (size === shownSize) return;
    shownSize = size;
    width.value = String(store.sprite.width);
    height.value = String(store.sprite.height);
  });

  return h(
    'header',
    { className: 'menu' },
    h('h1', { textContent: 'Sprite Creator' }),
    h('label', {}, '너비 ', width),
    h('label', {}, '높이 ', height),
    h('button', {
      textContent: '새로 만들기',
      onclick: () =>
        confirm('현재 작업을 지우고 새로 만들까요?') &&
        store.update(() => store.open(createSprite(Number(width.value), Number(height.value)))),
    }),
    h('button', { textContent: '크기 변경', onclick: resize }),
    h('span', { className: 'divider' }),
    h('button', { textContent: '불러오기', title: '프로젝트 파일(JSON) 열기', onclick: () => fileInput.click() }),
    h('button', { textContent: '저장', title: '프로젝트 파일(JSON)로 저장', onclick: save }),
    h('span', { className: 'divider' }),
    h('button', { textContent: 'PNG 내보내기', title: '현재 프레임을 투명 배경 PNG로 저장', onclick: exportPng }),
    h('button', {
      textContent: 'GIF 내보내기',
      title: '모든 프레임을 투명 배경 애니메이션 GIF로 저장',
      onclick: () => download(exportGif(store.sprite), 'image/gif', 'sprite.gif'),
    }),
    fileInput,
  );
}
