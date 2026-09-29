export interface Point {
  x: number;
  y: number;
}

/**
 * Converts an array of raw mouse/pen points into a smooth SVG path `d` string
 * using midpoint quadratic Bezier interpolation.
 */
export function pointsToSmoothSvgPath(points: Point[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x},${p.y} L ${p.x + 0.1},${p.y + 0.1}`;
  }
  if (points.length === 2) {
    const p0 = points[0]!;
    const p1 = points[1]!;
    return `M ${p0.x},${p0.y} L ${p1.x},${p1.y}`;
  }

  // Midpoint quadratic bezier smoothing
  const p0 = points[0]!;
  let d = `M ${p0.x},${p0.y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    d += ` Q ${current.x},${current.y} ${midX},${midY}`;
  }

  const last = points[points.length - 1]!;
  d += ` L ${last.x},${last.y}`;
  return d;
}

/**
 * Calculates smooth curve geometry between two endpoints P1 and P2 with curvature.
 */
export function calculateTwoPointCurve(
  p1: Point,
  p2: Point,
  curvature = 40,
  curveStyle: 'arc' | 's_curve' | 'arrow_arc' = 'arc'
): {
  pathD: string;
  ctrl: Point;
  ctrl1: Point;
  ctrl2: Point;
} {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);

  // Normal unit vector perpendicular to P1->P2 line
  const nx = dist === 0 ? 0 : -dy / dist;
  const ny = dist === 0 ? 0 : dx / dist;

  // Midpoint
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  // Single quadratic control point for arc
  const ctrl: Point = {
    x: Math.round(mx + nx * curvature),
    y: Math.round(my + ny * curvature)
  };

  // Two cubic control points for s_curve
  const p1_3rd: Point = { x: p1.x + dx / 3, y: p1.y + dy / 3 };
  const p2_3rd: Point = { x: p1.x + (2 * dx) / 3, y: p1.y + (2 * dy) / 3 };

  const ctrl1: Point = {
    x: Math.round(p1_3rd.x + nx * curvature),
    y: Math.round(p1_3rd.y + ny * curvature)
  };
  const ctrl2: Point = {
    x: Math.round(p2_3rd.x - nx * curvature),
    y: Math.round(p2_3rd.y - ny * curvature)
  };

  let pathD = '';
  if (curveStyle === 's_curve') {
    pathD = `M ${p1.x},${p1.y} C ${ctrl1.x},${ctrl1.y} ${ctrl2.x},${ctrl2.y} ${p2.x},${p2.y}`;
  } else {
    // arc or arrow_arc
    pathD = `M ${p1.x},${p1.y} Q ${ctrl.x},${ctrl.y} ${p2.x},${p2.y}`;
  }

  return { pathD, ctrl, ctrl1, ctrl2 };
}

/**
 * Generates clean standalone SVG markup for a curve connecting two points.
 */
export function generateTwoPointCurveSvg(
  p1: Point,
  p2: Point,
  curvature = 40,
  curveStyle: 'arc' | 's_curve' | 'arrow_arc' = 'arc',
  stroke = '#2563eb',
  strokeWidth = 3,
  id = 'curve'
): string {
  const { pathD, ctrl, ctrl1, ctrl2 } = calculateTwoPointCurve(p1, p2, curvature, curveStyle);

  // Compute bounding box
  const allX = [p1.x, p2.x, ctrl.x, ctrl1.x, ctrl2.x];
  const allY = [p1.y, p2.y, ctrl.y, ctrl1.y, ctrl2.y];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const pad = Math.max(strokeWidth * 3, 20);
  const boxX = minX - pad;
  const boxY = minY - pad;
  const boxW = Math.max(40, maxX - minX + pad * 2);
  const boxH = Math.max(40, maxY - minY + pad * 2);

  const markerId = `arrow-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hasArrow = curveStyle === 'arrow_arc';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${boxX} ${boxY} ${boxW} ${boxH}" width="${boxW}" height="${boxH}">
      ${hasArrow ? `
      <defs>
        <marker id="${markerId}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${stroke}" />
        </marker>
      </defs>` : ''}
      <path
        d="${pathD}"
        fill="none"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-linejoin="round"
        ${hasArrow ? `marker-end="url(#${markerId})"` : ''}
      />
    </svg>
  `.trim();
}

/**
 * Generates clean standalone SVG markup for freehand drawing paths.
 */
export function generateFreehandSvg(
  points: Point[],
  stroke = '#2563eb',
  strokeWidth = 3,
  id = 'freehand'
): string {
  if (!points || points.length === 0) return '';
  const pathD = pointsToSmoothSvgPath(points);

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pad = Math.max(strokeWidth * 2, 10);
  const boxX = minX - pad;
  const boxY = minY - pad;
  const boxW = Math.max(20, maxX - minX + pad * 2);
  const boxH = Math.max(20, maxY - minY + pad * 2);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${boxX} ${boxY} ${boxW} ${boxH}" width="${boxW}" height="${boxH}">
      <path
        d="${pathD}"
        fill="none"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `.trim();
}
