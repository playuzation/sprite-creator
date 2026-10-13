# sprite-creator

브라우저에서 동작하는 픽셀 스프라이트 제작 도구입니다.
`main` 브랜치에 반영되면 GitHub Pages(https://playuzation.github.io/sprite-creator/)로 배포됩니다.

## 기능

- **캔버스**: 기본 128×128, 1~1024 사이 크기 지원 (새로 만들기 / 크기 변경은 왼쪽 위 기준)
- **팔레트**: 스프라이트마다 최대 32색. 각 픽셀은 팔레트 색 중 하나이거나 투명(빈 배경)
- **레이어**: 추가, 삭제, 이름 변경, 순서 변경, 보이기/숨기기
- **타임라인**: 프레임을 추가하면 현재 프레임의 모든 레이어가 복사되어, 프레임마다 조금씩 수정 가능. 재생 및 FPS 설정
- **도구**: 연필, 지우개, 채우기, 확대/축소
- **화면 이동**: 스페이스바를 누른 채 드래그(데스크톱), 두 손가락으로 드래그(모바일)
- **저장/불러오기**: 프로젝트 파일(JSON) 다운로드/업로드
- **내보내기**: 현재 프레임 PNG(투명 배경), 전체 프레임 GIF(투명 배경, 무한 반복)

## 프로젝트 파일 형식 (JSON, version 1)

```json
{
  "format": "sprite-creator",
  "version": 1,
  "width": 128,
  "height": 128,
  "fps": 10,
  "palette": ["#140c1c", "#442434"],
  "layers": [{ "name": "레이어 1", "visible": true }],
  "frames": [{ "cels": ["eJzt..."] }]
}
```

- `frames[f].cels[l]`: f번째 프레임에서 l번째 레이어(0이 맨 아래)의 픽셀입니다.
  행 우선, 픽셀당 1바이트(0 = 투명, n = `palette[n - 1]`)를 zlib(deflate)로 압축한 뒤 base64로 담습니다.

## 개발

```sh
npm ci
npm run dev     # 로컬 개발 서버
npm test        # 단위 테스트
npm run build   # 타입 검사 + dist/ 빌드
```

## 배포

- `main`에 push되면 `.github/workflows/deploy-pages.yml`이 테스트·빌드 후 GitHub Pages에 배포합니다.
- 최초 1회 설정이 필요합니다: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택.

## 브랜치 규칙

- 코드를 수정하면 `feat/…`, 텍스트 파일만 수정하면 `docs/…` 브랜치에서 작업합니다.
- 작업 브랜치는 `dev`로 PR을 만들어 머지합니다. `main`에는 요청이 있을 때 `dev` → `main` PR로 반영합니다.
- 머지된 작업 브랜치는 `.github/workflows/delete-merged-branch.yml`이 자동으로 삭제합니다 (`dev`, `main` 제외).

## 구조

의존 방향은 위에서 아래로만 흐르는 트리입니다.

```
src/main.ts      진입점
└─ ui/           DOM 편집기 (패널, 편집 상태 저장소)
   └─ sprite/    스프라이트 도메인: 모델, 그리기, 합성, 저장/불러오기, GIF 내보내기 (DOM 없음)
      └─ codec/  범용 인코딩: GIF89a, deflate, base64 (스프라이트를 모름)
```

각 패키지는 바로 아래 패키지의 `index.ts`만 import합니다.
`tests/architecture.test.ts`가 역방향 의존, `index.ts` 우회, 순환 참조를 검사합니다.
