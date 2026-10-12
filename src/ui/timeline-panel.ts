import { MAX_FPS, MIN_FPS, duplicateFrame, removeFrame } from '../sprite';
import { h } from './dom';
import type { Store } from './store';

/** 타임라인: 프레임 선택, 추가(현재 프레임의 모든 레이어 복사), 삭제, 재생 */
export function createTimelinePanel(store: Store): HTMLElement {
  const frames = h('div', { className: 'frames' });
  const play = h('button', { onclick: () => store.update(() => (store.playing = !store.playing)) });
  const fps = h('input', {
    type: 'number',
    min: String(MIN_FPS),
    max: String(MAX_FPS),
    title: '초당 프레임 수',
    onchange: () =>
      store.update(() => {
        const value = Number(fps.value);
        if (Number.isInteger(value) && value >= MIN_FPS && value <= MAX_FPS) store.sprite.fps = value;
      }),
  });
  let timer = 0;
  let timerFps = 0;

  store.subscribe(() => {
    const { sprite } = store;
    frames.replaceChildren(
      ...sprite.frames.map((_, i) =>
        h('button', {
          className: i === store.frame ? 'frame active' : 'frame',
          textContent: String(i + 1),
          onclick: () => store.update(() => ((store.frame = i), (store.playing = false))),
        }),
      ),
    );
    play.textContent = store.playing ? '■ 정지' : '▶ 재생';
    if (document.activeElement !== fps) fps.value = String(sprite.fps);
    // 재생 여부와 FPS가 바뀌면 타이머를 다시 건다.
    const wanted = store.playing ? sprite.fps : 0;
    if (wanted === timerFps) return;
    clearInterval(timer);
    timerFps = wanted;
    if (wanted > 0) {
      timer = setInterval(() => store.update(() => (store.frame = (store.frame + 1) % store.sprite.frames.length)), 1000 / wanted);
    }
  });

  return h(
    'footer',
    { className: 'timeline' },
    h('h2', { textContent: '타임라인' }),
    play,
    h('label', {}, 'FPS ', fps),
    frames,
    h('button', {
      textContent: '프레임 추가',
      title: '현재 프레임의 모든 레이어를 복사해 바로 뒤에 추가',
      onclick: () => store.update(() => duplicateFrame(store.sprite, store.frame++)),
    }),
    h('button', {
      textContent: '프레임 삭제',
      onclick: () => confirm('현재 프레임을 삭제할까요?') && store.update(() => removeFrame(store.sprite, store.frame)),
    }),
  );
}
