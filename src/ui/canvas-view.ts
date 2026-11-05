import { renderFrameRGBA, type Point, type Sprite } from '../sprite';
import { createOverlay } from './canvas-overlay';
import { canUseTool, startGesture, type Gesture } from './canvas-tools';
import { h, isFormKey } from './dom';
import type { Store } from './store';

const ZOOMS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
/** 확대한 캔버스 한 변의 최대 길이 (CSS 픽셀) */
const MAX_DISPLAY = 8192;

/**
 * 현재 프레임을 확대해 보여주고, 포인터 입력을 현재 도구의 작업(canvas-tools)으로 넘긴다.
 * 빈 픽셀은 체크무늬(투명)로 보이고, 선택 영역과 벡터 패스는 겹친 오버레이(canvas-overlay)로 보인다.
 */
export function createCanvasView(store: Store): HTMLElement {
  const canvas = h('canvas', { className: 'sprite-canvas' });
  const context = canvas.getContext('2d')!;
  const overlay = createOverlay();
  const viewport = h('div', { className: 'viewport' }, h('div', { className: 'stage' }, canvas, overlay.element));
  const zoomLabel = h('span', { className: 'zoom-label' });
  let zoom = 1;
  let shown: { sprite: Sprite; width: number; height: number } | undefined;
  let image: ImageData | undefined;
  let renderQueued = false;
  /** 진행 중인 도구 작업 */
  let gesture: Gesture | undefined;
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
    overlay.render(store, zoom);
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
    const mask = store.editMask ? sprite.frames[store.frame].masks?.[store.layer] : undefined;
    if (mask) for (let i = 0; i < mask.length; i++) {
      image.data.fill(mask[i] ? 255 : 0, i * 4, i * 4 + 3);
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  };
  const queueRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  };

  /** 포인터 위치를 스프라이트 픽셀 좌표(소수 포함)로 바꾼다. */
  const pointAt = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * store.sprite.width,
      y: ((event.clientY - rect.top) / rect.height) * store.sprite.height,
    };
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
      // 두 번째 손가락이 닿기 전에 첫 손가락으로 시작한 작업(획, 점 찍기 등)은 취소한다.
      gesture?.cancel();
      gesture = undefined;
      panFrom = panPoint(event);
    } else if (event.target === canvas) {
      if (store.playing) store.update(() => (store.playing = false));
      gesture = startGesture(store, pointAt(event), zoom, queueRender);
    }
  };
  viewport.onpointermove = (event) => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (panFrom) {
      const [x, y] = panPoint(event);
      viewport.scrollLeft += panFrom[0] - x;
      viewport.scrollTop += panFrom[1] - y;
      panFrom = [x, y];
    } else {
      gesture?.move(pointAt(event));
    }
  };
  viewport.onpointerup = viewport.onpointercancel = (event) => {
    touches.delete(event.pointerId);
    if (gesture) store.update(); // 완성한 획을 타임라인 썸네일에도 반영한다.
    gesture = undefined;
    // 손가락이 남아 있으면 남은 손가락을 기준으로 이동을 이어간다.
    panFrom = panFrom && touches.size > 0 ? panPoint(event) : undefined;
  };

  const setSpaceHeld = (held: boolean) => {
    spaceHeld = held;
    viewport.classList.toggle('panning', held);
  };
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || isFormKey(event)) return;
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
    viewport.classList.toggle('locked', !canUseTool(store));
    overlay.render(store, zoom);
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
