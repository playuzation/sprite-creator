import {
  MAX_FPS, MIN_FPS, MIN_FRAME_DURATION, MAX_FRAME_DURATION, duplicateFrame, frameDuration,
  removeFrame, renderFrameRGBA, setFrameDuration, type Frame, type Sprite,
} from '../sprite';
import { h } from './dom';
import type { Store } from './store';

/** 합성 썸네일, 개별 표시 시간, 프레임 복제·삭제 및 가변 속도 미리보기. */
export function createTimelinePanel(store: Store): HTMLElement {
  const frames = h('div', { className: 'frames' });
  const play = h('button', { onclick: () => store.update(() => (store.playing = !store.playing)) });
  const fps = h('input', {
    type: 'number', min: String(MIN_FPS), max: String(MAX_FPS), title: '개별 시간이 없는 프레임의 기본 FPS',
    onchange: () => store.update(() => {
      const value = Number(fps.value);
      if (Number.isInteger(value) && value >= MIN_FPS && value <= MAX_FPS) store.sprite.fps = value;
    }),
  });
  const duration = h('input', {
    type: 'number', min: String(MIN_FRAME_DURATION), max: String(MAX_FRAME_DURATION), step: '1',
    title: '현재 프레임 표시 시간 (ms)',
    onfocus: () => { if (store.playing) store.update(() => (store.playing = false)); },
    onchange: () => {
      store.update(() => setFrameDuration(store.sprite, store.frame, Number(duration.value)));
      duration.value = String(frameDuration(store.sprite, store.frame));
    },
  });
  const reset = h('button', {
    textContent: '기본 시간', title: '현재 프레임의 개별 시간을 지우고 기본 FPS를 따르기',
    onclick: () => store.update(() => setFrameDuration(store.sprite, store.frame)),
  });
  let timer = 0;
  let scheduledSprite: Sprite | undefined;
  let scheduledFrame: Frame | undefined;
  let scheduledMs = 0;
  let shownFrames: Frame[] = [];
  let thumbnails: HTMLCanvasElement[] = [];
  let buttons: HTMLButtonElement[] = [];
  let labels: HTMLSpanElement[] = [];
  let renderQueued = false;
  const source = h('canvas');
  const context = source.getContext('2d')!;
  const queueThumbnails = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const { sprite } = store;
      source.width = sprite.width; source.height = sprite.height;
      for (let i = 0; i < thumbnails.length; i++) {
        const image = context.createImageData(sprite.width, sprite.height);
        renderFrameRGBA(sprite, i, image.data);
        context.putImageData(image, 0, 0);
        const thumb = thumbnails[i];
        const target = thumb.getContext('2d')!;
        target.clearRect(0, 0, thumb.width, thumb.height);
        target.imageSmoothingEnabled = false;
        const scale = Math.min(thumb.width / sprite.width, thumb.height / sprite.height);
        const w = Math.max(1, Math.round(sprite.width * scale));
        const hgt = Math.max(1, Math.round(sprite.height * scale));
        target.drawImage(source, Math.floor((thumb.width - w) / 2), Math.floor((thumb.height - hgt) / 2), w, hgt);
      }
    });
  };

  store.subscribe(() => {
    const { sprite } = store;
    if (shownFrames.length !== sprite.frames.length || shownFrames.some((frame, i) => frame !== sprite.frames[i])) {
      shownFrames = [...sprite.frames];
      thumbnails = sprite.frames.map(() => h('canvas', { width: 64, height: 48, className: 'frame-thumbnail' }));
      labels = sprite.frames.map(() => h('span', { className: 'frame-label' }));
      buttons = sprite.frames.map((_, i) => h('button', {
        className: 'frame',
        onclick: () => store.update(() => { store.frame = i; store.playing = false; }),
      }, thumbnails[i], labels[i]));
      frames.replaceChildren(...buttons);
    }
    buttons.forEach((button, i) => {
      const text = `${i + 1} · ${frameDuration(sprite, i)}ms`;
      button.classList.toggle('active', i === store.frame);
      button.setAttribute('aria-label', `프레임 ${i + 1}, ${frameDuration(sprite, i)}ms`);
      button.setAttribute('aria-pressed', String(i === store.frame));
      button.title = `프레임 ${text}`;
      labels[i].textContent = text;
    });
    // 재생 중에는 같은 그림을 다시 그리지 않고 선택 표시만 갱신한다.
    if (!store.playing) queueThumbnails();
    play.textContent = store.playing ? '■ 정지' : '▶ 재생';
    if (document.activeElement !== fps) fps.value = String(sprite.fps);
    if (document.activeElement !== duration) duration.value = String(frameDuration(sprite, store.frame));
    reset.disabled = sprite.frames[store.frame].duration === undefined;
    const frame = sprite.frames[store.frame];
    const ms = frameDuration(sprite, store.frame);
    if (store.playing && scheduledSprite === sprite && scheduledFrame === frame && scheduledMs === ms) return;
    clearTimeout(timer);
    scheduledSprite = undefined;
    scheduledFrame = undefined;
    if (store.playing) {
      scheduledSprite = sprite; scheduledFrame = frame; scheduledMs = ms;
      timer = window.setTimeout(() => {
        scheduledFrame = undefined;
        store.update(() => (store.frame = (store.frame + 1) % store.sprite.frames.length));
      }, ms);
    }
  });

  return h('footer', { className: 'timeline' },
    h('h2', { textContent: '타임라인' }), play,
    h('label', {}, '기본 FPS ', fps),
    h('label', {}, '표시 시간(ms) ', duration), reset, frames,
    h('button', {
      textContent: '프레임 추가', title: '현재 프레임의 그림과 표시 시간을 복사해 바로 뒤에 추가',
      onclick: () => store.update(() => { store.playing = false; duplicateFrame(store.sprite, store.frame++); }),
    }),
    h('button', {
      textContent: '프레임 삭제',
      onclick: () => confirm('현재 프레임을 삭제할까요?') && store.update(() => {
        store.playing = false; removeFrame(store.sprite, store.frame);
      }),
    }),
  );
}
