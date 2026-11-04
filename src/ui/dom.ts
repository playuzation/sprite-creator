/** 요소를 만들고 속성과 자식을 붙인다. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
}

/** 데이터를 파일로 내려받게 한다. */
export function download(data: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  h('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 키 입력이 입력창이나 열린 대화창으로 가는지. 이때는 단축키와 스페이스바 화면 이동을 쓰지 않는다. */
export function isFormKey(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLInputElement || document.querySelector('dialog[open]') !== null;
}
