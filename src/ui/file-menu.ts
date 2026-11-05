import { MAX_SIZE, createSprite, loadProject } from '../sprite';
import { saveFile } from './commands';
import { h } from './dom';
import { createExportMenu } from './export-menu';
import { readImageFile } from './image-import';
import { createSizeDialog } from './size-dialog';
import type { Store } from './store';

/** 상단 메뉴: 새로 만들기, 해상도·캔버스 변경, 프로젝트 저장/불러오기(JSON), 이미지·애니메이션 내보내기 */
export function createFileMenu(store: Store): HTMLElement {
  const sizeInput = (title: string) => h('input', { type: 'number', min: '1', max: String(MAX_SIZE), title });
  const width = sizeInput('너비');
  const height = sizeInput('높이');
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const imageInput = h('input', {
    type: 'file', accept: '.png,.jpg,.jpeg,.webp,.avif,.svg,.gif,image/png,image/jpeg,image/webp,image/avif,image/svg+xml,image/gif', hidden: true,
  });
  const openProject = h('button', { textContent: '불러오기', title: '프로젝트 파일(JSON) 열기', onclick: () => fileInput.click() });
  const openImage = h('button', { textContent: '이미지 불러오기', title: 'PNG·JPG·WebP·AVIF·SVG·GIF를 새 스프라이트로 열기', onclick: () => imageInput.click() });
  let importing = false;
  const setImporting = (busy: boolean) => {
    importing = busy;
    openImage.disabled = openProject.disabled = busy;
    openImage.textContent = busy ? '불러오는 중…' : '이미지 불러오기';
  };
  imageInput.onchange = async () => {
    const file = imageInput.files?.[0];
    imageInput.value = '';
    if (!file || importing) return;
    setImporting(true);
    try {
      const { sprite, notes } = await readImageFile(file);
      const message = [
        `${file.name}: ${sprite.width}×${sprite.height}, ${sprite.frames.length}프레임, ${sprite.palette.length}색`,
        ...notes, '현재 작업을 이 이미지로 바꿀까요? 저장하지 않은 작업은 사라집니다.',
      ].join('\n\n');
      if (confirm(message)) store.update(() => store.open(sprite));
    } catch (error) {
      alert(`이미지 불러오기에 실패했습니다: ${(error as Error).message}`);
    } finally { setImporting(false); }
  };
  const sizeDialog = createSizeDialog(store);
  let shownSize = '';

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // 같은 파일을 다시 고를 수 있게 비운다.
    if (!file || importing) return;
    setImporting(true);
    try {
      const sprite = await loadProject(await file.text());
      store.update(() => store.open(sprite));
    } catch (error) {
      alert(`불러오기에 실패했습니다: ${(error as Error).message}`);
    } finally { setImporting(false); }
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
      title: '입력한 너비·높이로 새 스프라이트 만들기',
      onclick: () =>
        confirm('현재 작업을 지우고 새로 만들까요?') &&
        store.update(() => store.open(createSprite(Number(width.value), Number(height.value)))),
    }),
    h('button', {
      textContent: '해상도 변경',
      title: '이미지 해상도 변경: 그림을 늘리거나 줄여 크기·비율 바꾸기',
      onclick: () => sizeDialog.open('scale'),
    }),
    h('button', {
      textContent: '캔버스 변경',
      title: '이미지 캔버스 변경: 기준 위치를 골라, 늘리면 투명하게 채우고 줄이면 잘라내기',
      onclick: () => sizeDialog.open('canvas'),
    }),
    h('span', { className: 'divider' }),
    openProject,
    openImage,
    h('button', { textContent: '저장', title: '프로젝트 파일(JSON)로 저장 (Ctrl+S)', onclick: () => saveFile(store) }),
    h('span', { className: 'divider' }),
    createExportMenu(store),
    fileInput,
    imageInput,
    sizeDialog.element,
  );
}
