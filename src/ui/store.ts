import { createSprite, type Point, type Rect, type Sprite } from '../sprite';

export type Tool = 'pencil' | 'eraser' | 'fill' | 'select' | 'vector';

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
  /** 벡터 도구로 찍은 점 (픽셀 좌표, 소수 가능) */
  path: Point[] = [];
  /** 벡터 패스를 그릴 때 안티에일리어싱 사용 여부 */
  antialias = false;
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
    for (const listener of this.listeners) listener();
  }

  /** 새 스프라이트로 교체하고 선택 상태를 처음으로 되돌린다. update 안에서 호출한다. */
  open(sprite: Sprite): void {
    this.sprite = sprite;
    this.color = this.layer = this.frame = 0;
    this.playing = false;
    this.selection = undefined;
    this.path = [];
  }
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}
