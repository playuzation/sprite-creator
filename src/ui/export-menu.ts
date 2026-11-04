import { canExportSvg, exportAvif, exportGif, exportSvg, exportWebp, renderFrameRGBA, type Sprite } from '../sprite';
import { download, h } from './dom';
import type { Store } from './store';

interface Format {
  label: string;
  extension: string;
  type: string;
  /** 모든 프레임을 담는 애니메이션인지 (아니면 현재 프레임 한 장) */
  animated: boolean;
  /** 지금 그림을 이 형식으로 내보낼 수 있는지 (없으면 언제나 가능) */
  available?(sprite: Sprite): boolean;
  encode(store: Store): BlobPart | Promise<BlobPart>;
}

const allFrames = (sprite: Sprite) => sprite.frames.map((_, i) => i);

const FORMATS: Format[] = [
  { label: 'PNG', extension: 'png', type: 'image/png', animated: false, encode: (store) => canvasImage(store, 'image/png') },
  // JPG는 투명도를 담지 못해 흰 배경으로 채운다.
  { label: 'JPG (흰 배경)', extension: 'jpg', type: 'image/jpeg', animated: false, encode: (store) => canvasImage(store, 'image/jpeg', '#ffffff') },
  { label: 'WebP', extension: 'webp', type: 'image/webp', animated: false, encode: (store) => exportWebp(store.sprite, [store.frame]) },
  { label: 'AVIF', extension: 'avif', type: 'image/avif', animated: false, encode: (store) => exportAvif(store.sprite, [store.frame]) },
  // SVG는 벡터 도형만 담으므로 보이는 레이어가 모두 벡터 레이어여야 한다.
  {
    label: 'SVG (벡터 레이어만)',
    extension: 'svg',
    type: 'image/svg+xml',
    animated: false,
    available: canExportSvg,
    encode: (store) => exportSvg(store.sprite, store.frame),
  },
  { label: 'GIF 애니메이션', extension: 'gif', type: 'image/gif', animated: true, encode: (store) => exportGif(store.sprite) },
  { label: 'WebP 애니메이션', extension: 'webp', type: 'image/webp', animated: true, encode: (store) => exportWebp(store.sprite, allFrames(store.sprite)) },
  { label: 'AVIF 애니메이션', extension: 'avif', type: 'image/avif', animated: true, encode: (store) => exportAvif(store.sprite, allFrames(store.sprite)) },
];

/**
 * 현재 프레임 이미지(PNG·JPG·WebP·AVIF·SVG)나 모든 프레임 애니메이션(GIF·WebP·AVIF)으로 내보내는 메뉴.
 * 지금 그림으로 만들 수 없는 형식은 고를 수 없게 한다.
 */
export function createExportMenu(store: Store): HTMLElement {
  const option = (format: Format) => h('option', { value: String(FORMATS.indexOf(format)), textContent: format.label });
  const select = h(
    'select',
    { title: '내보낼 형식' },
    h('optgroup', { label: '현재 프레임 이미지' }, ...FORMATS.filter((format) => !format.animated).map(option)),
    h('optgroup', { label: '애니메이션 (모든 프레임)' }, ...FORMATS.filter((format) => format.animated).map(option)),
  );
  store.subscribe(() => {
    for (const element of select.querySelectorAll('option')) {
      element.disabled = !(FORMATS[Number(element.value)].available?.(store.sprite) ?? true);
    }
  });
  const button = h('button', { textContent: '내보내기', title: '투명 배경으로 내보내기 (JPG는 흰 배경)' });
  button.onclick = async () => {
    const format = FORMATS[Number(select.value)];
    const name = format.animated ? 'sprite' : `sprite-frame${store.frame + 1}`;
    button.disabled = true;
    button.textContent = '내보내는 중…';
    try {
      download(await format.encode(store), format.type, `${name}.${format.extension}`);
    } catch (error) {
      alert(`내보내기에 실패했습니다: ${(error as Error).message}`);
    } finally {
      button.disabled = false;
      button.textContent = '내보내기';
    }
  };
  return h('span', { className: 'export-menu' }, select, button);
}

/**
 * 캔버스로 현재 프레임을 PNG·JPG로 만든다. background가 있으면 투명한 곳을 그 색으로 채운다.
 * JPG는 최고 품질(1)로 만든다: 픽셀 그림의 경계에서 색 번짐이 거의 없다.
 */
async function canvasImage(store: Store, type: string, background?: string): Promise<Blob> {
  const { sprite, frame } = store;
  const image = new ImageData(renderFrameRGBA(sprite, frame), sprite.width);
  const canvas = h('canvas', { width: sprite.width, height: sprite.height });
  const context = canvas.getContext('2d')!;
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, sprite.width, sprite.height);
    context.drawImage(await createImageBitmap(image), 0, 0);
  } else {
    context.putImageData(image, 0, 0);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다.'))), type, 1),
  );
}
