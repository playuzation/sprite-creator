import { createSprite, type Rect, type Sprite } from '../sprite';

export type Tool = 'pencil' | 'eraser' | 'fill' | 'select' | 'vector';

/**
 * 옮기는 중인 선택 영역의 픽셀. 셀에는 이미 찍혀 있고, 다시 옮길 때 under로 그 자리의 원래 픽셀을 되살린다.
 * 찍은 뒤 다른 작업으로 그 영역이 바뀌었으면(stamped와 다르면) 더 이상 쓰지 않는다.
 */
export interface Floating {
  cel: Uint8Array;
  rect: Rect;
  pixels: Uint8Array;
  under: Uint8Array;
  stamped: Uint8Array;
}

/**
 * 편집기 상태와 변경 알림.
 * 각 패널은 서로를 모르고 이 저장소만 구독/갱신한다 (패널 사이 순환 참조 방지).
 */
export class Store {
  sprite: Sprite = createSprite();
  tool: Tool = 'pencil';
  /** 선택한 팔레트 인덱스. 칠하는 픽셀 값은 color + 1 */
  color = 0;
  layer = 0;
  frame = 0;
  playing = false;
  /** 선택 영역. 있으면 모든 그리기 도구가 이 안의 픽셀만 바꾼다. */
  selection: Rect | undefined = undefined;
  floating: Floating | undefined = undefined;
  /** 복사한 픽셀과 복사한 위치 */
  clipboard: { rect: Rect; pixels: Uint8Array } | undefined = undefined;
  private listeners: (() => void)[] = [];

  subscribe(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** action을 실행한 뒤 구독자에게 알린다. 실패하면 이유를 알려준다. */
  update(action?: () => void): void {
    try {
      action?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
    this.color = clamp(this.color, this.sprite.palette.length);
    this.layer = clamp(this.layer, this.sprite.layers.length);
    this.frame = clamp(this.frame, this.sprite.frames.length);
    // 캔버스 크기가 줄어 선택 영역이 캔버스를 벗어나면 해제한다.
    const { selection, sprite } = this;
    if (selection && (selection.x + selection.width > sprite.width || selection.y + selection.height > sprite.height)) {
      this.selection = undefined;
    }
    if (!this.selection) this.floating = undefined;
    for (const listener of this.listeners) listener();
  }

  /** 새 스프라이트로 교체하고 선택 상태를 처음으로 되돌린다. update 안에서 호출한다. */
  open(sprite: Sprite): void {
    this.sprite = sprite;
    this.color = this.layer = this.frame = 0;
    this.playing = false;
    this.selection = this.floating = this.clipboard = undefined;
  }
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}
