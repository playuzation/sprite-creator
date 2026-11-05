# 작업 지침

## 브랜치와 PR

- 작업을 시작할 때 원격 상태를 확인하고 최신 `origin/dev`에서 작업 브랜치를 만든다.
- 코드 변경은 `feat/…`, 텍스트 파일만 변경하는 작업은 `docs/…` 브랜치를 사용한다.
- 모든 변경 커밋은 작업 브랜치에 쌓고, `dev`를 대상으로 PR을 만들어 반영한다. `dev`와 `main`에 직접 커밋하거나 push하지 않는다.
- `main` 반영은 사용자가 명시적으로 요청할 때만 `dev` → `main` PR로 진행한다. `main`에 반영되면 GitHub Pages 배포가 실행된다.
- PR 병합 후 같은 저장소의 작업 브랜치는 `.github/workflows/delete-merged-branch.yml`이 자동 삭제한다. `dev`와 `main`은 삭제하지 않는다. 포크의 브랜치는 이 워크플로의 삭제 대상이 아니다.
- 브랜치 삭제 설정을 확인할 때는 GitHub 기본 자동 삭제 옵션과 별도 Actions 워크플로를 구분하고, 워크플로 활성 상태와 실제 실행 결과를 확인한다.

## 개발과 검증

- 의존성은 `npm ci`로 설치하고 개발 서버는 `npm run dev`로 실행한다.
- 코드 변경 후 `npm test`와 `npm run build`를 실행하고 결과를 PR에 기록한다. 문서만 변경한 경우 문서 내용과 diff를 확인한다.
- 의존 방향은 `src/main.ts` → `ui` → `sprite` → `codec`을 유지한다. 패키지 간 import는 바로 아래 패키지의 `index.ts` 공개 API를 사용한다.
- 기능 설명은 README뿐 아니라 실제 UI·구현·테스트를 확인하고, 브라우저 지원 조건과 기능 제한을 함께 기록한다.
