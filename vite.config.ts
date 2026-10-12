import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages 하위 경로(/sprite-creator/)에서도 동작하게 한다.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
