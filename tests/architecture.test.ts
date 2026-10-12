import { describe, expect, it } from 'vitest';

/** 패키지 의존 트리: main → ui → sprite → codec. 각 패키지는 바로 아래 패키지 하나에만 의존한다. */
const CHILD: Record<string, string | undefined> = { main: 'ui', ui: 'sprite', sprite: 'codec', codec: undefined };

/** src 기준 경로(예: 'ui/store.ts') → 소스 코드 */
const sources = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true })).map(
    ([path, code]) => [path.replace('../src/', ''), code],
  ),
);

function packageOf(file: string): string {
  const parts = file.split('/');
  return parts.length === 1 ? 'main' : parts[0];
}

/** 파일이 import하는 src 안의 .ts 파일 경로 목록 */
function importsOf(file: string): string[] {
  const specifiers = [...sources[file].matchAll(/^(?:import|export)\b[^'"]*?['"](\.[^'"]+)['"]/gm)].map((m) => m[1]);
  return specifiers.flatMap((specifier) => {
    const path = [...file.split('/').slice(0, -1), ...specifier.split('/')].reduce<string[]>(
      (parts, part) => (part === '..' ? parts.slice(0, -1) : part === '.' ? parts : [...parts, part]),
      [],
    );
    const base = path.join('/');
    return [`${base}.ts`, `${base}/index.ts`].filter((candidate) => candidate in sources).slice(0, 1);
  });
}

describe('architecture', () => {
  it('import를 올바르게 찾는다', () => {
    expect(importsOf('main.ts')).toEqual(['ui/index.ts']);
    expect(importsOf('ui/store.ts')).toEqual(['sprite/index.ts']);
  });

  it('모든 소스 파일이 패키지 트리에 속한다', () => {
    for (const file of Object.keys(sources)) expect(Object.keys(CHILD), file).toContain(packageOf(file));
  });

  it('다른 패키지는 바로 아래 자식 패키지의 index.ts로만 import한다', () => {
    for (const file of Object.keys(sources)) {
      for (const target of importsOf(file)) {
        const from = packageOf(file);
        const to = packageOf(target);
        if (from === to) continue;
        expect(to, `${file} → ${target}`).toBe(CHILD[from]);
        expect(target, `${file} → ${target}`).toBe(`${to}/index.ts`);
      }
    }
  });

  it('파일 사이에 순환 참조가 없다', () => {
    const done = new Set<string>();
    const visit = (file: string, path: string[]) => {
      expect(path, `순환 참조: ${[...path, file].join(' → ')}`).not.toContain(file);
      if (done.has(file)) return;
      for (const target of importsOf(file)) visit(target, [...path, file]);
      done.add(file);
    };
    for (const file of Object.keys(sources)) visit(file, []);
  });
});
