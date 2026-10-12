/**
 * sprite 패키지: DOM을 모르는 스프라이트 도메인 (모델, 그리기, 합성, 저장/불러오기, GIF 내보내기).
 * 하위 패키지는 codec 하나뿐이며, 상위(ui)는 이 파일로 공개된 API만 사용한다.
 */
export * from './model';
export { drawLine, floodFill } from './draw';
export { compositeFrame, renderFrameRGBA } from './render';
export { saveProject, loadProject } from './project-file';
export { exportGif } from './gif-export';
