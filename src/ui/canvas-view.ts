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
  /** 진행 중인 획. 두 번째 손가락이 닿으면 backup으로 되돌린다. */
  let stroke: { cel: Uint8Array; backup: Uint8Array; last?: [number, number] } | undefined;
  /** 화면에 닿아 있는 손가락 위치 */
  const touches = new Map<number, [number, number]>();
  /** 화면 이동 중일 때 직전 기준점 */
  let panFrom: [number, number] | undefined;
  let spaceHeld = false;

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
    if (!stroke) return;
    const [fromX, fromY] = stroke.last ?? [x, y];
    const value = store.tool === 'eraser' ? TRANSPARENT : store.color + 1;
    drawLine(stroke.cel, store.sprite.width, fromX, fromY, x, y, value);
    stroke.last = [x, y];
    queueRender();
  };
  const startStroke = (event: PointerEvent) => {
    if (store.playing) store.update(() => (store.playing = false));
    const cel = store.sprite.frames[store.frame].cels[store.layer];
    stroke = { cel, backup: cel.slice() };
    const [x, y] = pixelAt(event);
    if (store.tool === 'fill') {
      floodFill(cel, store.sprite.width, x, y, store.color + 1);
      queueRender();
    } else {
      paint([x, y]);
    }
  };
  /** 화면 이동 기준점: 마우스 위치 또는 닿아 있는 손가락들의 중심 */
  const panPoint = (event: PointerEvent): [number, number] => {
    const points: [number, number][] =
      event.pointerType === 'touch' ? [...touches.values()] : [[event.clientX, event.clientY]];
    const center = (axis: 0 | 1) => points.reduce((sum, point) => sum + point[axis], 0) / points.length;
    return [center(0), center(1)];
  };

  // 스페이스바를 누른 채 드래그하거나 두 손가락으로 드래그하면 그리지 않고 화면을 이동한다.
  viewport.onpointerdown = (event) => {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch') touches.set(event.pointerId, [event.clientX, event.clientY]);
    viewport.setPointerCapture(event.pointerId);
    if (spaceHeld || touches.size > 1) {
      // 두 번째 손가락이 닿기 전에 첫 손가락으로 그린 획은 취소한다.
      if (stroke) {
        stroke.cel.set(stroke.backup);
        stroke = undefined;
        queueRender();
      }
      panFrom = panPoint(event);
    } else if (event.target === canvas) {
      startStroke(event);
    }
  };
  viewport.onpointermove = (event) => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (panFrom) {
      const [x, y] = panPoint(event);
      viewport.scrollLeft += panFrom[0] - x;
      viewport.scrollTop += panFrom[1] - y;
      panFrom = [x, y];
    } else if (stroke?.last) {
      paint(pixelAt(event));
    }
  };
  viewport.onpointerup = viewport.onpointercancel = (event) => {
    touches.delete(event.pointerId);
    stroke = undefined;
    // 손가락이 남아 있으면 남은 손가락을 기준으로 이동을 이어간다.
    panFrom = panFrom && touches.size > 0 ? panPoint(event) : undefined;
  };

  const setSpaceHeld = (held: boolean) => {
    spaceHeld = held;
    viewport.classList.toggle('panning', held);
  };
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.target instanceof HTMLInputElement) return;
    event.preventDefault(); // 포커스된 버튼이 스페이스바로 눌리지 않게 한다.
    setSpaceHeld(true);
  });
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || !spaceHeld) return;
    event.preventDefault();
    setSpaceHeld(false);
  });
  window.addEventListener('blur', () => setSpaceHeld(false));

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
