import { pathPoints } from '../sprite';
import type { Store } from './store';

const SVG = 'http://www.w3.org/2000/svg';
/** 벡터 점 표시 크기 (화면 픽셀) */
const HANDLE_RADIUS = 4;

function svg(tag: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

/**
 * 캔버스 위에 겹쳐 선택 영역(점선)과 벡터 패스(두께만큼의 반투명 띠, 가운데 선, 점)를 보여준다.
 * 좌표는 스프라이트 픽셀 단위이고, 선 굵기는 확대와 상관없이 화면 픽셀로 유지한다. 포인터 입력은 받지 않는다.
 */
export function createOverlay(): { element: SVGSVGElement; render(store: Store, zoom: number): void } {
  const element = document.createElementNS(SVG, 'svg');
  element.classList.add('overlay');
  element.setAttribute('preserveAspectRatio', 'none');
  const line = { fill: 'none', 'vector-effect': 'non-scaling-stroke' };

  const render = (store: Store, zoom: number) => {
    const { sprite, selection } = store;
    const { path } = sprite;
    element.setAttribute('viewBox', `0 0 ${sprite.width} ${sprite.height}`);
    const shapes: SVGElement[] = [];
    if (selection) {
      const box = { ...line, x: selection.x, y: selection.y, width: selection.width, height: selection.height };
      shapes.push(svg('rect', { ...box, stroke: '#000' }), svg('rect', { ...box, stroke: '#fff', 'stroke-dasharray': '4 4' }));
    }
    if (store.tool === 'vector' && path.points.length > 0) {
      const points = pathPoints(path)
        .map((p) => `${p.x},${p.y}`)
        .join(' ');
      const band = { fill: 'none', stroke: '#4da3ff', 'stroke-opacity': 0.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      shapes.push(svg('polyline', { ...band, points, 'stroke-width': path.width }));
      shapes.push(svg('polyline', { ...line, points, stroke: '#4da3ff', 'stroke-width': 1.5 }));
      for (const p of path.points) {
        shapes.push(svg('circle', { ...line, cx: p.x, cy: p.y, r: HANDLE_RADIUS / zoom, fill: '#fff', stroke: '#4da3ff' }));
      }
    }
    element.replaceChildren(...shapes);
  };
  return { element, render };
}
