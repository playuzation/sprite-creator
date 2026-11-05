import { createCanvasView } from './canvas-view';
import { h } from './dom';
import { createFileMenu } from './file-menu';
import { createLayerPanel } from './layer-panel';
import { createPalettePanel } from './palette-panel';
import { bindShortcuts } from './shortcuts';
import { Store } from './store';
import { createTimelinePanel } from './timeline-panel';
import { createToolPanel } from './tool-panel';

/**
 * ui 패키지: DOM 편집기. 하위 패키지는 sprite 하나뿐이며 sprite/index의 공개 API만 사용한다.
 * 패키지 안에서는 index(조립) → 각 패널·단축키 → commands(편집 명령) → store, dom 방향으로만 의존한다.
 */
export function mountApp(root: HTMLElement): void {
  // 편집기의 포인터 조작이 브라우저 기본 메뉴나 기본 드래그로 이어지지 않게 한다.
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  root.addEventListener('dragstart', (event) => event.preventDefault());
  const store = new Store();
  root.append(
    createFileMenu(store),
    h(
      'main',
      { className: 'workspace' },
      createToolPanel(store),
      createCanvasView(store),
      h('aside', { className: 'side' }, createPalettePanel(store), createLayerPanel(store)),
    ),
    createTimelinePanel(store),
  );
  bindShortcuts(store);
  store.update();
}
