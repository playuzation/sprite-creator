import { TRANSPARENT, drawLine, floodFill, renderFrameRGBA, type Sprite } from '../sprite';
import { h } from './dom';
import type { Store } from './store';

const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
/** 확대한 캔버스 한 변의 최대 길이 (CSS 픽셀) */
const MAX_DISPLAY = 8192;

/** 현재 프레임을 확대해 보여주고, 포인터로 현재 레이어에 그린다. 빈 픽셀은 체크무늬(투명)로 보인다. */
export function createCanvasView(store: Store): HTMLElement {
  const canvas = h('canvas', { className: 'sprite-canvas' });
  const context = canvas.getContext('2d')!;
  const viewport = h('div', { className: 'viewport' }, canvas);
  const zoomLabel = h('span', { className: 'zoom-label' });
  let zoom = 1;
  let shown: { sprite: Sprite; width: number; height: number } | undefined;
  let image: ImageData | undefined;
  let renderQueued = false;
  let last: [number, number] | undefined;

  const zooms = () => ZOOMS.filter((z) => Math.max(store.sprite.width, store.sprite.height) * z <= MAX_DISPLAY);
  const setZoom = (value: number) => {
    zoom = value;
    canvas.style.width = `${store.sprite.width * zoom}px`;
    canvas.style.height = `${store.sprite.height * zoom}px`;
    zoomLabel.textContent = `${zoom * 100}%`;
  };
  const stepZoom = (step: number) => {
    const next = zooms()[zooms().indexOf(zoom) + step];
    if (next) setZoom(next);
  };
  const fitZoom = () => {
    const padding = 2 * parseFloat(getComputedStyle(viewport).paddingLeft);
    const fit = Math.min(
      (viewport.clientWidth - padding) / store.sprite.width,
      (viewport.clientHeight - padding) / store.sprite.height,
    );
    setZoom(zooms().filter((z) => z <= fit).pop() ?? zooms()[0]);
  };

  const render = () => {
    renderQueued = false;
    const { sprite } = store;
    if (image?.width !== sprite.width || image.height !== sprite.height) {
      canvas.width = sprite.width;
      canvas.height = sprite.height;
      image = context.createImageData(sprite.width, sprite.height);
    }
    renderFrameRGBA(sprite, store.frame, image.data);
    context.putImageData(image, 0, 0);
  };
  const queueRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  };

  const pixelAt = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [
      Math.floor(((event.clientX - rect.left) / rect.width) * store.sprite.width),
      Math.floor(((event.clientY - rect.top) / rect.height) * store.sprite.height),
    ];
  };
  const paint = ([x, y]: [number, number]) => {
    const { sprite } = store;
    const [fromX, fromY] = last ?? [x, y];
    const value = store.tool === 'eraser' ? TRANSPARENT : store.color + 1;
    drawLine(sprite.frames[store.frame].cels[store.layer], sprite.width, fromX, fromY, x, y, value);
    last = [x, y];
    queueRender();
  };

  canvas.onpointerdown = (event) => {
    if (event.button !== 0) return;
    if (store.playing) store.update(() => (store.playing = false));
    const [x, y] = pixelAt(event);
    if (store.tool === 'fill') {
      const { sprite } = store;
      floodFill(sprite.frames[store.frame].cels[store.layer], sprite.width, x, y, store.color + 1);
      queueRender();
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    last = undefined;
    paint([x, y]);
  };
  canvas.onpointermove = (event) => {
    if (last) paint(pixelAt(event));
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    last = undefined;
  };

  store.subscribe(() => {
    const { sprite } = store;
    if (shown?.sprite !== sprite || shown.width !== sprite.width || shown.height !== sprite.height) {
      shown = { sprite, width: sprite.width, height: sprite.height };
      fitZoom();
    }
    queueRender();
  });

  return h(
    'section',
    { className: 'canvas-area' },
    h(
      'div',
      { className: 'zoom-bar' },
      h('button', { textContent: '−', title: '축소', onclick: () => stepZoom(-1) }),
      zoomLabel,
      h('button', { textContent: '+', title: '확대', onclick: () => stepZoom(1) }),
      h('button', { textContent: '화면 맞춤', onclick: fitZoom }),
    ),
    viewport,
  );
}
