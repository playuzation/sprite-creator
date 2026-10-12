import { createSprite, type Sprite } from '../sprite';

export type Tool = 'pencil' | 'eraser' | 'fill';

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
    for (const listener of this.listeners) listener();
  }

  /** 새 스프라이트로 교체하고 선택 상태를 처음으로 되돌린다. update 안에서 호출한다. */
  open(sprite: Sprite): void {
    this.sprite = sprite;
    this.color = this.layer = this.frame = 0;
    this.playing = false;
  }
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}
