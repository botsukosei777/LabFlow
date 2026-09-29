import React from 'react';

export type BioCategory = 'molecules' | 'cells' | 'organisms' | 'equipment' | 'custom';

export interface BioItemDef {
  type: string;
  category: BioCategory;
  name: string;
  nameEn?: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultFill: string;
  defaultStroke: string;
  renderSvg: (fill: string, stroke: string, width?: number, height?: number, options?: Record<string, any>) => React.ReactNode;
  getSvgString: (fill: string, stroke: string, width?: number, height?: number, options?: Record<string, any>) => string;
  isImage?: boolean;
  imageSrc?: string;
  tiffSrc?: string;
  badge?: string;
  elementData?: any;
  svgData?: string;
}

// -------------------------------------------------------------
// 5 Variations of Receptor Extracellular Head Domains
// -------------------------------------------------------------
export const RECEPTOR_HEAD_TYPES = [
  { id: 1, name: '球状・ポケット型 (Globular & Pocket)', nameEn: 'Globular & Pocket Type', shortName: '球状ポケット', shortNameEn: 'Globular' },
  { id: 2, name: 'Ig様・リピートドメイン型 (Ig-like Domains)', nameEn: 'Ig-like Repeat Domain', shortName: 'Ig様', shortNameEn: 'Ig-like' },
  { id: 3, name: 'フォーク・システインリッチ型 (Fork / Claw)', nameEn: 'Fork / Cysteine-rich', shortName: 'フォーク', shortNameEn: 'Fork' },
  { id: 4, name: '三日月カップ・LRR型 (Crescent Cup / LRR)', nameEn: 'Crescent Cup / LRR', shortName: '三日月カップ', shortNameEn: 'LRR Cup' },
  { id: 5, name: 'プロペラ・円盤型 (β-propeller / Disc)', nameEn: 'β-Propeller / Disc', shortName: 'プロペラ', shortNameEn: 'Propeller' },
] as const;

export function getReceptorHeadSvg(headType: number, cx: number, cy: number, color: string, stroke: string): string {
  switch (headType) {
    case 1:
      // Type 1: 球状・リガンド結合ポケット型 (Globular domain with binding pocket)
      return `
        <g id="head-globular">
          <!-- Globular lobe with pocket -->
          <path d="M ${cx - 15},${cy + 2} C ${cx - 18},${cy - 14} ${cx - 6},${cy - 20} ${cx},${cy - 12} C ${cx + 6},${cy - 20} ${cx + 18},${cy - 14} ${cx + 15},${cy + 2} C ${cx + 12},${cy + 14} ${cx - 12},${cy + 14} ${cx - 15},${cy + 2} Z" fill="${color}" stroke="${stroke}" stroke-width="2.5"/>
          <!-- Ligand binding cleft indentation -->
          <path d="M ${cx - 6},${cy - 12} Q ${cx},${cy - 5} ${cx + 6},${cy - 12}" fill="none" stroke="${stroke}" stroke-width="2"/>
          <!-- Bound ligand molecule -->
          <circle cx="${cx}" cy="${cy - 3}" r="4" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
        </g>
      `;
    case 2:
      // Type 2: Ig様・リピートドメイン型 (Chained immunoglobulin-like beads)
      return `
        <g id="head-ig">
          <!-- Top Ig domain -->
          <ellipse cx="${cx}" cy="${cy - 12}" rx="12" ry="8" fill="${color}" stroke="${stroke}" stroke-width="2.5"/>
          <line x1="${cx - 7}" y1="${cy - 12}" x2="${cx + 7}" y2="${cy - 12}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2 2"/>
          <!-- Flexible interdomain hinge -->
          <line x1="${cx}" y1="${cy - 4}" x2="${cx}" y2="${cy + 2}" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
          <!-- Lower Ig domain -->
          <ellipse cx="${cx}" cy="${cy + 10}" rx="11" ry="8" fill="${color}" stroke="${stroke}" stroke-width="2.5"/>
          <circle cx="${cx + 6}" cy="${cy - 10}" r="2" fill="#ffffff"/>
        </g>
      `;
    case 3:
      // Type 3: フォーク・システインリッチ型 (Fork / Y-claw / Cysteine-rich)
      return `
        <g id="head-fork">
          <!-- Forked Y-claw arms -->
          <path d="M ${cx},${cy + 16} L ${cx},${cy + 2} Q ${cx - 16},${cy - 4} ${cx - 14},${cy - 18} M ${cx},${cy + 2} Q ${cx + 16},${cy - 4} ${cx + 14},${cy - 18}" fill="none" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round"/>
          <!-- Pincer tips -->
          <circle cx="${cx - 14}" cy="${cy - 18}" r="5" fill="${color}" stroke="${stroke}" stroke-width="2"/>
          <circle cx="${cx + 14}" cy="${cy - 18}" r="5" fill="${color}" stroke="${stroke}" stroke-width="2"/>
          <!-- Disulfide bond bridge -->
          <line x1="${cx - 9}" y1="${cy - 8}" x2="${cx + 9}" y2="${cy - 8}" stroke="#f59e0b" stroke-width="2.5"/>
        </g>
      `;
    case 4:
      // Type 4: 三日月カップ・LRR型 (Curved crescent cup / Leucine-Rich Repeat)
      return `
        <g id="head-cup">
          <!-- Crescent horseshoe cup -->
          <path d="M ${cx - 15},${cy - 18} C ${cx - 26},${cy} ${cx - 10},${cy + 16} ${cx + 6},${cy + 14} C ${cx - 4},${cy + 7} ${cx - 11},${cy} ${cx - 7},${cy - 14} Z" fill="${color}" stroke="${stroke}" stroke-width="2.5"/>
          <!-- LRR repeat ribs -->
          <line x1="${cx - 17}" y1="${cy - 7}" x2="${cx - 10}" y2="${cy - 5}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="${cx - 18}" y1="${cy + 2}" x2="${cx - 11}" y2="${cy + 3}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="${cx - 13}" y1="${cy + 10}" x2="${cx - 7}" y2="${cy + 9}" stroke="${stroke}" stroke-width="1.5"/>
          <!-- Docked ligand bead inside cup -->
          <circle cx="${cx + 4}" cy="${cy - 3}" r="4.5" fill="#10b981" stroke="#047857" stroke-width="1.5"/>
        </g>
      `;
    case 5:
    default:
      // Type 5: プロペラ・円盤型 (β-propeller / Disc-shaped)
      return `
        <g id="head-propeller">
          <!-- Outer circular disc -->
          <circle cx="${cx}" cy="${cy}" r="15" fill="${color}" stroke="${stroke}" stroke-width="2.5"/>
          <!-- Segmented blades -->
          <line x1="${cx}" y1="${cy - 15}" x2="${cx}" y2="${cy + 15}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="${cx - 15}" y1="${cy}" x2="${cx + 15}" y2="${cy}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="${cx - 11}" y1="${cy - 11}" x2="${cx + 11}" y2="${cy + 11}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="${cx - 11}" y1="${cy + 11}" x2="${cx + 11}" y2="${cy - 11}" stroke="${stroke}" stroke-width="1.5"/>
          <!-- Central core hub -->
          <circle cx="${cx}" cy="${cy}" r="6" fill="#ffffff" stroke="${stroke}" stroke-width="2"/>
          <circle cx="${cx}" cy="${cy}" r="3" fill="#f59e0b"/>
        </g>
      `;
  }
}

// -------------------------------------------------------------
// Pure Phospholipid Bilayer Generator (No baked-in channels)
// Supports: straight, wave (S-curve), arc (湾曲), vesicle (円形小胞)
// -------------------------------------------------------------
export function generateLipidBilayerSvg(
  width: number,
  height: number,
  headColor = '#ef4444',
  tailColor = '#f59e0b',
  style: 'straight' | 'wave' | 'arc' | 'vesicle' = 'straight',
  curvature = 35
): string {
  const headRadius = 6;
  const unitSpacing = 15;

  if (style === 'vesicle') {
    // Closed circular liposome/vesicle
    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = Math.max(28, Math.min(width, height) / 2 - 12);
    const innerRadius = Math.max(12, outerRadius - 26);

    const outerCount = Math.max(12, Math.floor((2 * Math.PI * outerRadius) / unitSpacing));
    const innerCount = Math.max(8, Math.floor((2 * Math.PI * innerRadius) / unitSpacing));

    const outerUnits: string[] = [];
    const innerUnits: string[] = [];

    // Outer leaflet: heads outside, tails pointing towards center
    for (let i = 0; i < outerCount; i++) {
      const angle = (2 * Math.PI * i) / outerCount;
      const hx = cx + outerRadius * Math.cos(angle);
      const hy = cy + outerRadius * Math.sin(angle);

      // Tails pointing inward along radial vector
      const tx1 = cx + (outerRadius - 12) * Math.cos(angle - 0.05);
      const ty1 = cy + (outerRadius - 12) * Math.sin(angle - 0.05);
      const tx2 = cx + (outerRadius - 12) * Math.cos(angle + 0.05);
      const ty2 = cy + (outerRadius - 12) * Math.sin(angle + 0.05);

      outerUnits.push(`
        <path d="M ${hx},${hy} L ${tx1},${ty1}" stroke="${tailColor}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M ${hx},${hy} L ${tx2},${ty2}" stroke="${tailColor}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="${hx}" cy="${hy}" r="${headRadius}" fill="${headColor}" stroke="#b91c1c" stroke-width="1.2"/>
      `);
    }

    // Inner leaflet: heads inside lumen, tails pointing outward towards bilayer center
    for (let j = 0; j < innerCount; j++) {
      const angle = (2 * Math.PI * j) / innerCount;
      const hx = cx + innerRadius * Math.cos(angle);
      const hy = cy + innerRadius * Math.sin(angle);

      const tx1 = cx + (innerRadius + 11) * Math.cos(angle - 0.06);
      const ty1 = cy + (innerRadius + 11) * Math.sin(angle - 0.06);
      const tx2 = cx + (innerRadius + 11) * Math.cos(angle + 0.06);
      const ty2 = cy + (innerRadius + 11) * Math.sin(angle + 0.06);

      innerUnits.push(`
        <path d="M ${hx},${hy} L ${tx1},${ty1}" stroke="${tailColor}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M ${hx},${hy} L ${tx2},${ty2}" stroke="${tailColor}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="${hx}" cy="${hy}" r="${headRadius - 0.5}" fill="${headColor}" stroke="#b91c1c" stroke-width="1.2"/>
      `);
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
        <!-- Vesicle aqueous core / lumen -->
        <circle cx="${cx}" cy="${cy}" r="${innerRadius - 6}" fill="${tailColor}" fill-opacity="0.08"/>
        <g id="vesicle-bilayer">
          ${outerUnits.join('')}
          ${innerUnits.join('')}
        </g>
      </svg>
    `;
  }

  // Linear or curved membranes (straight, wave, arc)
  const count = Math.max(4, Math.floor(width / unitSpacing));
  const topUnits: string[] = [];
  const bottomUnits: string[] = [];

  const amp = (Math.max(10, height / 2 - 20) * (curvature || 35)) / 100;

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = t * width;
    let y = height / 2;
    let slope = 0;

    if (style === 'wave') {
      // Smooth sinusoidal S-curve
      y = height / 2 + amp * Math.sin(2 * Math.PI * t);
      slope = ((amp * 2 * Math.PI) / width) * Math.cos(2 * Math.PI * t);
    } else if (style === 'arc') {
      // Smooth arch / dome
      y = height / 2 - 4 * amp * t * (1 - t);
      slope = (-4 * amp * (1 - 2 * t)) / width;
    }

    // Normal angle perpendicular to membrane tangent
    const angle = Math.atan(slope);
    const normAngle = angle - Math.PI / 2; // points upward
    const nx = Math.cos(normAngle);
    const ny = Math.sin(normAngle);

    // Half thickness of bilayer
    const halfThick = 18;

    // Top Leaflet: head center offset outward
    const topHx = x + halfThick * nx;
    const topHy = y + halfThick * ny;
    const topTx1 = topHx - 13 * nx + 3 * Math.sin(normAngle);
    const topTy1 = topHy - 13 * ny - 3 * Math.cos(normAngle);
    const topTx2 = topHx - 13 * nx - 3 * Math.sin(normAngle);
    const topTy2 = topHy - 13 * ny + 3 * Math.cos(normAngle);

    topUnits.push(`
      <path d="M ${topHx},${topHy} Q ${topHx - 6 * nx},${topHy - 6 * ny} ${topTx1},${topTy1}" stroke="${tailColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M ${topHx},${topHy} Q ${topHx - 6 * nx},${topHy - 6 * ny} ${topTx2},${topTy2}" stroke="${tailColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="${topHx}" cy="${topHy}" r="${headRadius}" fill="${headColor}" stroke="#b91c1c" stroke-width="1.3"/>
    `);

    // Bottom Leaflet: head center offset inward
    const btmHx = x - halfThick * nx;
    const btmHy = y - halfThick * ny;
    const btmTx1 = btmHx + 13 * nx + 3 * Math.sin(normAngle);
    const btmTy1 = btmHy + 13 * ny - 3 * Math.cos(normAngle);
    const btmTx2 = btmHx + 13 * nx - 3 * Math.sin(normAngle);
    const btmTy2 = btmHy + 13 * ny + 3 * Math.cos(normAngle);

    bottomUnits.push(`
      <path d="M ${btmHx},${btmHy} Q ${btmHx + 6 * nx},${btmHy + 6 * ny} ${btmTx1},${btmTy1}" stroke="${tailColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M ${btmHx},${btmHy} Q ${btmHx + 6 * nx},${btmHy + 6 * ny} ${btmTx2},${btmTy2}" stroke="${tailColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="${btmHx}" cy="${btmHy}" r="${headRadius}" fill="${headColor}" stroke="#b91c1c" stroke-width="1.3"/>
    `);
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <g id="pure-lipid-bilayer">
        ${topUnits.join('')}
        ${bottomUnits.join('')}
      </g>
    </svg>
  `;
}

// -------------------------------------------------------------
// Standalone Membrane Protein Generators
// -------------------------------------------------------------

// 1. イオンチャネル (Ion Channel / Pore)
export function getChannelSvg(fill = '#3b82f6', stroke = '#1d4ed8', width = 90, height = 115): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 115" width="100%" height="100%">
    <defs>
      <linearGradient id="g-pore-barrel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${fill}"/>
        <stop offset="50%" stop-color="#93c5fd"/>
        <stop offset="100%" stop-color="${stroke}"/>
      </linearGradient>
    </defs>
    <!-- Left Transmembrane Subunit Barrel -->
    <rect x="12" y="24" width="26" height="66" rx="8" fill="url(#g-pore-barrel)" stroke="${stroke}" stroke-width="2.5"/>
    <path d="M 12,28 Q 25,24 38,28" fill="none" stroke="#ffffff" stroke-width="1.5"/>
    <!-- Extracellular Loop Left -->
    <path d="M 16,24 Q 24,12 32,24" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
    
    <!-- Right Transmembrane Subunit Barrel -->
    <rect x="52" y="24" width="26" height="66" rx="8" fill="url(#g-pore-barrel)" stroke="${stroke}" stroke-width="2.5"/>
    <path d="M 52,28 Q 65,24 78,28" fill="none" stroke="#ffffff" stroke-width="1.5"/>
    <!-- Extracellular Loop Right -->
    <path d="M 58,24 Q 66,12 74,24" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>

    <!-- Central Selectivity Filter & Pore Rings -->
    <ellipse cx="45" cy="52" rx="10" ry="3" fill="#ef4444" stroke="#b91c1c" stroke-width="1.5"/>
    <ellipse cx="45" cy="62" rx="10" ry="3" fill="#ef4444" stroke="#b91c1c" stroke-width="1.5"/>
    
    <!-- Permeating Ions (e.g. Na+/K+) and Flow Arrow -->
    <line x1="45" y1="16" x2="45" y2="98" stroke="#10b981" stroke-width="2.5" stroke-dasharray="3 3"/>
    <polygon points="45,104 41,96 49,96" fill="#10b981"/>
    <circle cx="45" cy="36" r="4" fill="#34d399" stroke="#047857" stroke-width="1.5"/>
    <circle cx="45" cy="74" r="4" fill="#34d399" stroke="#047857" stroke-width="1.5"/>

    <!-- Cytoplasmic Gating Loops -->
    <path d="M 20,90 Q 25,105 32,90" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
    <path d="M 58,90 Q 65,105 70,90" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
    
    <text x="45" y="112" font-size="8" font-weight="bold" fill="#64748b" text-anchor="middle">Channel</text>
  </svg>`;
}

// 2. 単量体受容体 (Monomer Receptor, with 5 Head variations)
export function getMonomerReceptorSvg(fill = '#6366f1', stroke = '#4338ca', headType = 1, width = 75, height = 140): string {
  const cx = 37.5;
  const headSvg = getReceptorHeadSvg(headType, cx, 24, fill, stroke);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 75 140" width="100%" height="100%">
    <!-- Extracellular Head Domain (Selected from 5 variations) -->
    ${headSvg}

    <!-- Stalk / Juxtamembrane Segment -->
    <line x1="${cx}" y1="38" x2="${cx}" y2="54" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>

    <!-- Single Transmembrane alpha-helix Cylinder -->
    <rect x="${cx - 7}" y="54" width="14" height="38" rx="5" fill="#a5b4fc" stroke="${stroke}" stroke-width="2.5"/>
    <!-- Diagonal helical stripes -->
    <line x1="${cx - 6}" y1="62" x2="${cx + 6}" y2="68" stroke="${stroke}" stroke-width="2"/>
    <line x1="${cx - 6}" y1="72" x2="${cx + 6}" y2="78" stroke="${stroke}" stroke-width="2"/>
    <line x1="${cx - 6}" y1="82" x2="${cx + 6}" y2="88" stroke="${stroke}" stroke-width="2"/>

    <!-- Intracellular Juxtamembrane link -->
    <line x1="${cx}" y1="92" x2="${cx}" y2="98" stroke="${stroke}" stroke-width="3"/>

    <!-- Intracellular Tyrosine Kinase Domain -->
    <rect x="${cx - 16}" y="98" width="32" height="26" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
    <!-- Phosphorylation sites on C-terminal tail -->
    <path d="M ${cx},124 Q ${cx + 14},132 ${cx + 12},136" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx + 12}" cy="136" r="4" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>
    <text x="${cx + 12}" y="139" font-size="6" font-weight="bold" fill="#78350f" text-anchor="middle">P</text>
  </svg>`;
}

// 3. 受容体ダイマー (Homodimer or Heterodimer with selectable heads)
export function getDimerReceptorSvg(
  fill = '#6366f1',
  stroke = '#4338ca',
  headA = 1,
  headB = 1,
  width = 115,
  height = 140
): string {
  const cxA = 36;
  const cxB = 79;
  const isHomodimer = headA === headB;

  // Subunit A color
  const colorA = fill;
  const strokeA = stroke;
  // Subunit B color (give a distinct tint if heterodimer!)
  const colorB = isHomodimer ? fill : '#ec4899';
  const strokeB = isHomodimer ? stroke : '#be185d';

  const headSvgA = getReceptorHeadSvg(headA, cxA, 24, colorA, strokeA);
  const headSvgB = getReceptorHeadSvg(headB, cxB, 24, colorB, strokeB);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 115 140" width="100%" height="100%">
    <!-- Ligand bridge between heads -->
    <ellipse cx="57.5" cy="22" rx="7" ry="5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>

    <!-- Subunit A (Left) -->
    <g id="dimer-subunit-a">
      ${headSvgA}
      <line x1="${cxA}" y1="38" x2="${cxA}" y2="54" stroke="${strokeA}" stroke-width="3" stroke-linecap="round"/>
      <rect x="${cxA - 6}" y="54" width="12" height="38" rx="4" fill="#a5b4fc" stroke="${strokeA}" stroke-width="2"/>
      <line x1="${cxA - 5}" y1="64" x2="${cxA + 5}" y2="70" stroke="${strokeA}" stroke-width="1.5"/>
      <line x1="${cxA - 5}" y1="76" x2="${cxA + 5}" y2="82" stroke="${strokeA}" stroke-width="1.5"/>
      <!-- Kinase Domain A -->
      <rect x="${cxA - 14}" y="98" width="26" height="24" rx="7" fill="${colorA}" stroke="${strokeA}" stroke-width="2"/>
    </g>

    <!-- Subunit B (Right) -->
    <g id="dimer-subunit-b">
      ${headSvgB}
      <line x1="${cxB}" y1="38" x2="${cxB}" y2="54" stroke="${strokeB}" stroke-width="3" stroke-linecap="round"/>
      <rect x="${cxB - 6}" y="54" width="12" height="38" rx="4" fill="#fbcfe8" stroke="${strokeB}" stroke-width="2"/>
      <line x1="${cxB - 5}" y1="64" x2="${cxB + 5}" y2="70" stroke="${strokeB}" stroke-width="1.5"/>
      <line x1="${cxB - 5}" y1="76" x2="${cxB + 5}" y2="82" stroke="${strokeB}" stroke-width="1.5"/>
      <!-- Kinase Domain B -->
      <rect x="${cxB - 12}" y="98" width="26" height="24" rx="7" fill="${colorB}" stroke="${strokeB}" stroke-width="2"/>
    </g>

    <!-- Transphosphorylation stars & phosphate tags -->
    <circle cx="57.5" cy="110" r="4.5" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>
    <text x="57.5" y="113" font-size="6" font-weight="bold" fill="#78350f" text-anchor="middle">P</text>

    <!-- Homodimer / Heterodimer label -->
    <text x="57.5" y="136" font-size="7.5" font-weight="bold" fill="#64748b" text-anchor="middle">
      ${isHomodimer ? 'Homodimer' : 'Heterodimer'}
    </text>
  </svg>`;
}

// 4. 7回膜貫通受容体 (GPCR)
export function getGpcrSvg(fill = '#8b5cf6', stroke = '#6d28d9', width = 135, height = 125): string {
  const tmPositions = [18, 33, 48, 63, 78, 93, 108];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 135 125" width="100%" height="100%">
    <defs>
      <linearGradient id="g-gpcr-tm" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#c4b5fd"/>
        <stop offset="50%" stop-color="#a78bfa"/>
        <stop offset="100%" stop-color="${stroke}"/>
      </linearGradient>
    </defs>
    
    <!-- Extracellular N-terminal Tail & Loops -->
    <!-- N-term on TM1 -->
    <path d="M 18,34 Q 10,20 18,12" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- ECL1: TM2-TM3 -->
    <path d="M 33,34 Q 40,20 48,34" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- ECL2: TM4-TM5 with ligand pocket -->
    <path d="M 63,34 Q 70,16 78,34" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- ECL3: TM6-TM7 -->
    <path d="M 93,34 Q 100,20 108,34" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>

    <!-- Bound Ligand in GPCR Orthosteric Pocket -->
    <circle cx="63" cy="24" r="5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>

    <!-- 7 Transmembrane Helices (TM1 to TM7) -->
    ${tmPositions
      .map(
        (x, i) => `
      <rect x="${x - 5}" y="34" width="10" height="48" rx="4" fill="url(#g-gpcr-tm)" stroke="${stroke}" stroke-width="1.8"/>
      <text x="${x}" y="62" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">${i + 1}</text>
    `
      )
      .join('')}

    <!-- Intracellular Loops -->
    <!-- ICL1: TM1-TM2 -->
    <path d="M 18,82 Q 25,94 33,82" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- ICL2: TM3-TM4 -->
    <path d="M 48,82 Q 55,94 63,82" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- ICL3: TM5-TM6 (large G-protein binding loop) -->
    <path d="M 78,82 Q 85,98 93,82" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- C-terminal Tail with Helix 8 -->
    <path d="M 108,82 Q 116,92 126,92" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>

    <!-- Interacting Heterotrimeric G-Protein (Gα, Gβ, Gγ) -->
    <g id="g-protein-trimer" transform="translate(48, 96)">
      <!-- G-alpha subunit -->
      <circle cx="16" cy="12" r="11" fill="#ec4899" stroke="#be185d" stroke-width="1.5"/>
      <text x="16" y="15" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">Gα</text>
      <!-- G-beta subunit -->
      <circle cx="34" cy="10" r="9" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1.5"/>
      <text x="34" y="13" font-size="6.5" font-weight="bold" fill="#ffffff" text-anchor="middle">Gβ</text>
      <!-- G-gamma subunit -->
      <circle cx="44" cy="18" r="6" fill="#10b981" stroke="#047857" stroke-width="1.5"/>
      <text x="44" y="20" font-size="5" font-weight="bold" fill="#ffffff" text-anchor="middle">Gγ</text>
    </g>

    <text x="25" y="116" font-size="8" font-weight="bold" fill="#6d28d9">GPCR</text>
  </svg>`;
}

// 5. H+ ATPアーゼ (ATP合成酵素 / ATP Synthase)
export function getAtpSynthaseSvg(fill = '#f59e0b', stroke = '#d97706', width = 130, height = 155): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 155" width="100%" height="100%">
    <!-- ================= F0 SECTOR (IN BILAYER) ================= -->
    <!-- Stator a-subunit (Proton entry & exit half-channels) -->
    <rect x="22" y="20" width="22" height="42" rx="6" fill="#60a5fa" stroke="#2563eb" stroke-width="2"/>
    <text x="33" y="44" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle">a</text>

    <!-- Rotating c-ring rotor in membrane -->
    <rect x="48" y="20" width="44" height="42" rx="7" fill="#34d399" stroke="#059669" stroke-width="2.2"/>
    <!-- c-subunits vertical stripes -->
    <line x1="57" y1="20" x2="57" y2="62" stroke="#059669" stroke-width="1.5"/>
    <line x1="66" y1="20" x2="66" y2="62" stroke="#059669" stroke-width="1.5"/>
    <line x1="75" y1="20" x2="75" y2="62" stroke="#059669" stroke-width="1.5"/>
    <line x1="84" y1="20" x2="84" y2="62" stroke="#059669" stroke-width="1.5"/>
    <text x="70" y="44" font-size="9" font-weight="bold" fill="#065f46" text-anchor="middle">c-ring</text>

    <!-- Proton (H+) flow path through F0 -->
    <path d="M 12,12 Q 24,18 30,30 Q 34,44 48,54 T 70,68" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 3"/>
    <polygon points="73,69 66,65 69,73" fill="#ef4444"/>
    <circle cx="12" cy="12" r="6" fill="#ef4444"/>
    <text x="12" y="15" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">H⁺</text>

    <!-- ================= STALK & STATOR SECTOR ================= -->
    <!-- Central Stalk (gamma-epsilon rotor shaft) -->
    <rect x="65" y="62" width="10" height="36" rx="3" fill="#facc15" stroke="#ca8a04" stroke-width="2"/>
    <path d="M 62,78 Q 70,82 78,78" fill="none" stroke="#ca8a04" stroke-width="1.5"/>

    <!-- Peripheral Stalk (b2-delta stator arm on left) -->
    <path d="M 28,62 L 28,105 Q 35,115 50,115" fill="none" stroke="#3b82f6" stroke-width="3.5" stroke-linecap="round"/>

    <!-- ================= F1 SECTOR (CATALYTIC HEAD) ================= -->
    <!-- alpha3-beta3 Hexamer Head -->
    <ellipse cx="70" cy="120" rx="30" ry="24" fill="${fill}" stroke="${stroke}" stroke-width="2.8"/>
    <!-- Subunit lobes -->
    <circle cx="56" cy="112" r="11" fill="#fde047" stroke="${stroke}" stroke-width="1.8"/>
    <text x="56" y="115" font-size="7" font-weight="bold" fill="#713f12" text-anchor="middle">α</text>
    <circle cx="84" cy="112" r="11" fill="#fb923c" stroke="${stroke}" stroke-width="1.8"/>
    <text x="84" y="115" font-size="7" font-weight="bold" fill="#7c2d12" text-anchor="middle">β</text>
    <circle cx="70" cy="128" r="11" fill="#fde047" stroke="${stroke}" stroke-width="1.8"/>
    <text x="70" y="131" font-size="7" font-weight="bold" fill="#713f12" text-anchor="middle">α/β</text>

    <!-- Reaction Callout: ADP + Pi -> ATP -->
    <g transform="translate(68, 148)">
      <rect x="-38" y="-7" width="76" height="14" rx="4" fill="#1e293b" stroke="#475569" stroke-width="1"/>
      <text x="0" y="3" font-size="7" font-weight="bold" fill="#38bdf8" text-anchor="middle">ADP + Pi → ATP</text>
    </g>
  </svg>`;
}

// -------------------------------------------------------------
// 生命科学向け イラスト素材データベース (Life Science Assets Database)
// -------------------------------------------------------------
export const BIO_ASSETS: BioItemDef[] = [
  // ==========================================
  // 1. 生体分子 (Biomolecules & Membrane Proteins)
  // ==========================================
  {
    type: 'bio_dna',
    category: 'molecules',
    name: 'DNA 二重らせん',
    defaultWidth: 200,
    defaultHeight: 80,
    defaultFill: '#6366f1',
    defaultStroke: '#3b82f6',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
      <path d="M 10,40 C 45,10 65,70 100,40 C 135,10 155,70 190,40" fill="none" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 10,40 C 45,70 65,10 100,40 C 135,70 155,10 190,40" fill="none" stroke="${fill}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="28" y1="28" x2="28" y2="52" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="52" y1="22" x2="52" y2="58" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="76" y1="30" x2="76" y2="50" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="124" y1="28" x2="124" y2="52" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="148" y1="22" x2="148" y2="58" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="172" y1="30" x2="172" y2="50" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 200 80" width="100%" height="100%">
        <path d="M 10,40 C 45,10 65,70 100,40 C 135,10 155,70 190,40" fill="none" stroke={stroke} strokeWidth="4.5" strokeLinecap="round"/>
        <path d="M 10,40 C 45,70 65,10 100,40 C 135,70 155,10 190,40" fill="none" stroke={fill} strokeWidth="4.5" strokeLinecap="round"/>
        <line x1="28" y1="28" x2="28" y2="52" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="52" y1="22" x2="52" y2="58" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="76" y1="30" x2="76" y2="50" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="124" y1="28" x2="124" y2="52" stroke="#ec4899" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="148" y1="22" x2="148" y2="58" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="172" y1="30" x2="172" y2="50" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    type: 'bio_plasmid',
    category: 'molecules',
    name: 'プラスミド環状DNA',
    defaultWidth: 130,
    defaultHeight: 130,
    defaultFill: '#3b82f6',
    defaultStroke: '#1d4ed8',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="48" fill="none" stroke="#cbd5e1" stroke-width="7"/>
      <path d="M 65,17 A 48 48 0 0 1 110,50" fill="none" stroke="${stroke}" stroke-width="9" stroke-linecap="round"/>
      <path d="M 25,85 A 48 48 0 0 1 30,45" fill="none" stroke="#10b981" stroke-width="9" stroke-linecap="round"/>
      <path d="M 85,105 A 48 48 0 0 1 50,112" fill="none" stroke="#f59e0b" stroke-width="9" stroke-linecap="round"/>
      <polygon points="112,50 118,44 116,56" fill="${stroke}"/>
      <text x="65" y="69" font-size="11" font-weight="bold" fill="#64748b" text-anchor="middle">Plasmid</text>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 130 130" width="100%" height="100%">
        <circle cx="65" cy="65" r="48" fill="none" stroke="#cbd5e1" strokeWidth="7"/>
        <path d="M 65,17 A 48 48 0 0 1 110,50" fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round"/>
        <path d="M 25,85 A 48 48 0 0 1 30,45" fill="none" stroke="#10b981" strokeWidth="9" strokeLinecap="round"/>
        <path d="M 85,105 A 48 48 0 0 1 50,112" fill="none" stroke="#f59e0b" strokeWidth="9" strokeLinecap="round"/>
        <polygon points="112,50 118,44 116,56" fill={stroke}/>
        <text x="65" y="69" fontSize="11" fontWeight="bold" fill="#64748b" textAnchor="middle">Plasmid</text>
      </svg>
    )
  },
  {
    type: 'bio_antibody',
    category: 'molecules',
    name: '抗体 (IgG Y-shape)',
    defaultWidth: 120,
    defaultHeight: 140,
    defaultFill: '#ec4899',
    defaultStroke: '#be185d',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140">
      <path d="M 60,135 L 60,75 L 25,20 M 60,75 L 95,20" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 12,38 L 38,78" fill="none" stroke="${fill}" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M 108,38 L 82,78" fill="none" stroke="${fill}" stroke-width="6.5" stroke-linecap="round"/>
      <ellipse cx="20" cy="15" rx="7" ry="5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <ellipse cx="100" cy="15" rx="7" ry="5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <line x1="56" y1="100" x2="64" y2="100" stroke="#f59e0b" stroke-width="3"/>
      <line x1="56" y1="115" x2="64" y2="115" stroke="#f59e0b" stroke-width="3"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 120 140" width="100%" height="100%">
        <path d="M 60,135 L 60,75 L 25,20 M 60,75 L 95,20" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 12,38 L 38,78" fill="none" stroke={fill} strokeWidth="6.5" strokeLinecap="round"/>
        <path d="M 108,38 L 82,78" fill="none" stroke={fill} strokeWidth="6.5" strokeLinecap="round"/>
        <ellipse cx="20" cy="15" rx="7" ry="5" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5"/>
        <ellipse cx="100" cy="15" rx="7" ry="5" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5"/>
        <line x1="56" y1="100" x2="64" y2="100" stroke="#f59e0b" strokeWidth="3"/>
        <line x1="56" y1="115" x2="64" y2="115" stroke="#f59e0b" strokeWidth="3"/>
      </svg>
    )
  },
  {
    type: 'bio_protein_globular',
    category: 'molecules',
    name: '球状タンパク質・酵素',
    defaultWidth: 140,
    defaultHeight: 120,
    defaultFill: '#8b5cf6',
    defaultStroke: '#6d28d9',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 120">
      <path d="M 25,60 C 20,35 45,15 75,20 C 105,15 130,40 125,70 C 130,95 100,115 70,110 C 40,115 15,95 25,60 Z" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="4"/>
      <path d="M 45,45 Q 65,65 85,45 Q 75,80 45,45 Z" fill="#ffffff" fill-opacity="0.6" stroke="${stroke}" stroke-width="2"/>
      <path d="M 35,70 Q 55,85 75,70 T 115,75" fill="none" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="65" cy="55" r="5" fill="#f59e0b"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 140 120" width="100%" height="100%">
        <path d="M 25,60 C 20,35 45,15 75,20 C 105,15 130,40 125,70 C 130,95 100,115 70,110 C 40,115 15,95 25,60 Z" fill={fill} fillOpacity="0.35" stroke={stroke} strokeWidth="4"/>
        <path d="M 45,45 Q 65,65 85,45 Q 75,80 45,45 Z" fill="#ffffff" fillOpacity="0.6" stroke={stroke} strokeWidth="2"/>
        <path d="M 35,70 Q 55,85 75,70 T 115,75" fill="none" stroke={stroke} strokeWidth="3.5" strokeLinecap="round"/>
        <circle cx="65" cy="55" r="5" fill="#f59e0b"/>
      </svg>
    )
  },
  {
    type: 'bio_phospholipid',
    category: 'molecules',
    name: 'リン脂質 (単体分子)',
    defaultWidth: 60,
    defaultHeight: 120,
    defaultFill: '#ef4444',
    defaultStroke: '#b91c1c',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 120">
      <circle cx="30" cy="25" r="18" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
      <path d="M 22,43 Q 14,70 24,95 T 18,115" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
      <path d="M 38,43 Q 48,70 36,95 T 44,115" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
      <text x="30" y="29" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle">P</text>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 60 120" width="100%" height="100%">
        <circle cx="30" cy="25" r="18" fill={fill} stroke={stroke} strokeWidth="3"/>
        <path d="M 22,43 Q 14,70 24,95 T 18,115" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round"/>
        <path d="M 38,43 Q 48,70 36,95 T 44,115" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round"/>
        <text x="30" y="29" fontSize="9" fontWeight="bold" fill="#ffffff" textAnchor="middle">P</text>
      </svg>
    )
  },
  {
    type: 'bio_atp',
    category: 'molecules',
    name: 'ATP / ヌクレオチド',
    defaultWidth: 110,
    defaultHeight: 70,
    defaultFill: '#f59e0b',
    defaultStroke: '#d97706',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 70">
      <rect x="5" y="15" width="40" height="40" rx="8" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2.5"/>
      <text x="25" y="39" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">A</text>
      <line x1="45" y1="35" x2="55" y2="35" stroke="#64748b" stroke-width="3"/>
      <circle cx="63" cy="35" r="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="81" cy="35" r="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="99" cy="35" r="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <polygon points="90,15 94,22 101,23 96,28 97,35 90,31 84,35 85,28 80,23 87,22" fill="#ef4444"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 110 70" width="100%" height="100%">
        <rect x="5" y="15" width="40" height="40" rx="8" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="2.5"/>
        <text x="25" y="39" fontSize="11" fontWeight="bold" fill="#ffffff" textAnchor="middle">A</text>
        <line x1="45" y1="35" x2="55" y2="35" stroke="#64748b" strokeWidth="3"/>
        <circle cx="63" cy="35" r="8" fill={fill} stroke={stroke} strokeWidth="2"/>
        <circle cx="81" cy="35" r="8" fill={fill} stroke={stroke} strokeWidth="2"/>
        <circle cx="99" cy="35" r="8" fill={fill} stroke={stroke} strokeWidth="2"/>
        <polygon points="90,15 94,22 101,23 96,28 97,35 90,31 84,35 85,28 80,23 87,22" fill="#ef4444"/>
      </svg>
    )
  },

  // --- MEMBRANE PROTEINS (膜タンパク質) ---
  {
    type: 'bio_channel',
    category: 'molecules',
    name: 'イオンチャネル / 膜孔',
    defaultWidth: 90,
    defaultHeight: 115,
    defaultFill: '#3b82f6',
    defaultStroke: '#1d4ed8',
    getSvgString: (fill, stroke, w = 90, h = 115) => getChannelSvg(fill, stroke, w, h),
    renderSvg: (fill, stroke, w = 90, h = 115) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getChannelSvg(fill, stroke, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_monomer',
    category: 'molecules',
    name: '受容体 (モノマー・頭部可変)',
    defaultWidth: 75,
    defaultHeight: 140,
    defaultFill: '#6366f1',
    defaultStroke: '#4338ca',
    getSvgString: (fill, stroke, w = 75, h = 140, opts) => getMonomerReceptorSvg(fill, stroke, opts?.headA || 1, w, h),
    renderSvg: (fill, stroke, w = 75, h = 140, opts) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getMonomerReceptorSvg(fill, stroke, opts?.headA || 1, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_m1',
    category: 'molecules',
    name: '受容体: 球状ポケット型',
    defaultWidth: 75,
    defaultHeight: 140,
    defaultFill: '#3b82f6',
    defaultStroke: '#1d4ed8',
    getSvgString: (fill, stroke, w = 75, h = 140) => getMonomerReceptorSvg(fill, stroke, 1, w, h),
    renderSvg: (fill, stroke, w = 75, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getMonomerReceptorSvg(fill, stroke, 1, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_m2',
    category: 'molecules',
    name: '受容体: Ig様ドメイン型',
    defaultWidth: 75,
    defaultHeight: 140,
    defaultFill: '#8b5cf6',
    defaultStroke: '#6d28d9',
    getSvgString: (fill, stroke, w = 75, h = 140) => getMonomerReceptorSvg(fill, stroke, 2, w, h),
    renderSvg: (fill, stroke, w = 75, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getMonomerReceptorSvg(fill, stroke, 2, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_m3',
    category: 'molecules',
    name: '受容体: フォーク/システインリッチ',
    defaultWidth: 75,
    defaultHeight: 140,
    defaultFill: '#ec4899',
    defaultStroke: '#be185d',
    getSvgString: (fill, stroke, w = 75, h = 140) => getMonomerReceptorSvg(fill, stroke, 3, w, h),
    renderSvg: (fill, stroke, w = 75, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getMonomerReceptorSvg(fill, stroke, 3, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_m4',
    category: 'molecules',
    name: '受容体: 三日月カップ/LRR型',
    defaultWidth: 75,
    defaultHeight: 140,
    defaultFill: '#10b981',
    defaultStroke: '#047857',
    getSvgString: (fill, stroke, w = 75, h = 140) => getMonomerReceptorSvg(fill, stroke, 4, w, h),
    renderSvg: (fill, stroke, w = 75, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getMonomerReceptorSvg(fill, stroke, 4, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_m5',
    category: 'molecules',
    name: '受容体: プロペラ円盤型',
    defaultWidth: 75,
    defaultHeight: 140,
    defaultFill: '#f59e0b',
    defaultStroke: '#b45309',
    getSvgString: (fill, stroke, w = 75, h = 140) => getMonomerReceptorSvg(fill, stroke, 5, w, h),
    renderSvg: (fill, stroke, w = 75, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getMonomerReceptorSvg(fill, stroke, 5, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_dimer',
    category: 'molecules',
    name: '受容体ダイマー (ホモ/ヘテロ可変)',
    defaultWidth: 115,
    defaultHeight: 140,
    defaultFill: '#6366f1',
    defaultStroke: '#4338ca',
    getSvgString: (fill, stroke, w = 115, h = 140, opts) => getDimerReceptorSvg(fill, stroke, opts?.headA || 1, opts?.headB || 1, w, h),
    renderSvg: (fill, stroke, w = 115, h = 140, opts) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getDimerReceptorSvg(fill, stroke, opts?.headA || 1, opts?.headB || 1, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_homo',
    category: 'molecules',
    name: '受容体ホモダイマー (同種二量体)',
    defaultWidth: 115,
    defaultHeight: 140,
    defaultFill: '#3b82f6',
    defaultStroke: '#1d4ed8',
    getSvgString: (fill, stroke, w = 115, h = 140) => getDimerReceptorSvg(fill, stroke, 1, 1, w, h),
    renderSvg: (fill, stroke, w = 115, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getDimerReceptorSvg(fill, stroke, 1, 1, w, h) }} />
    )
  },
  {
    type: 'bio_receptor_hetero',
    category: 'molecules',
    name: '受容体ヘテロダイマー (異種二量体)',
    defaultWidth: 115,
    defaultHeight: 140,
    defaultFill: '#6366f1',
    defaultStroke: '#4338ca',
    getSvgString: (fill, stroke, w = 115, h = 140) => getDimerReceptorSvg(fill, stroke, 1, 3, w, h),
    renderSvg: (fill, stroke, w = 115, h = 140) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getDimerReceptorSvg(fill, stroke, 1, 3, w, h) }} />
    )
  },
  {
    type: 'bio_gpcr',
    category: 'molecules',
    name: '7回膜貫通受容体 (GPCR)',
    defaultWidth: 135,
    defaultHeight: 125,
    defaultFill: '#8b5cf6',
    defaultStroke: '#6d28d9',
    getSvgString: (fill, stroke, w = 135, h = 125) => getGpcrSvg(fill, stroke, w, h),
    renderSvg: (fill, stroke, w = 135, h = 125) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getGpcrSvg(fill, stroke, w, h) }} />
    )
  },
  {
    type: 'bio_atp_synthase',
    category: 'molecules',
    name: 'H+ ATPアーゼ (ATP合成酵素)',
    defaultWidth: 130,
    defaultHeight: 155,
    defaultFill: '#f59e0b',
    defaultStroke: '#d97706',
    getSvgString: (fill, stroke, w = 130, h = 155) => getAtpSynthaseSvg(fill, stroke, w, h),
    renderSvg: (fill, stroke, w = 130, h = 155) => (
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: getAtpSynthaseSvg(fill, stroke, w, h) }} />
    )
  },

  // ==========================================
  // 2. 細胞・組織 (Cells & Tissues - Including Bilayers)
  // ==========================================
  {
    type: 'bio_lipid_bilayer',
    category: 'cells',
    name: 'リン脂質二重膜 (直線)',
    defaultWidth: 320,
    defaultHeight: 80,
    defaultFill: '#ef4444',
    defaultStroke: '#f59e0b',
    getSvgString: (fill, stroke, width = 320, height = 80, opts) =>
      generateLipidBilayerSvg(width, height, fill, stroke, opts?.membraneStyle || 'straight', opts?.curvature || 35),
    renderSvg: (fill, stroke, width = 320, height = 80, opts) => (
      <div
        style={{ width: '100%', height: '100%' }}
        dangerouslySetInnerHTML={{
          __html: generateLipidBilayerSvg(width, height, fill, stroke, opts?.membraneStyle || 'straight', opts?.curvature || 35)
        }}
      />
    )
  },
  {
    type: 'bio_lipid_bilayer_curve',
    category: 'cells',
    name: 'リン脂質二重膜 (S字曲線)',
    defaultWidth: 340,
    defaultHeight: 110,
    defaultFill: '#ef4444',
    defaultStroke: '#f59e0b',
    getSvgString: (fill, stroke, width = 340, height = 110, opts) =>
      generateLipidBilayerSvg(width, height, fill, stroke, 'wave', opts?.curvature || 40),
    renderSvg: (fill, stroke, width = 340, height = 110, opts) => (
      <div
        style={{ width: '100%', height: '100%' }}
        dangerouslySetInnerHTML={{
          __html: generateLipidBilayerSvg(width, height, fill, stroke, 'wave', opts?.curvature || 40)
        }}
      />
    )
  },
  {
    type: 'bio_lipid_bilayer_arc',
    category: 'cells',
    name: 'リン脂質二重膜 (湾曲アーチ)',
    defaultWidth: 340,
    defaultHeight: 110,
    defaultFill: '#ef4444',
    defaultStroke: '#f59e0b',
    getSvgString: (fill, stroke, width = 340, height = 110, opts) =>
      generateLipidBilayerSvg(width, height, fill, stroke, 'arc', opts?.curvature || 40),
    renderSvg: (fill, stroke, width = 340, height = 110, opts) => (
      <div
        style={{ width: '100%', height: '100%' }}
        dangerouslySetInnerHTML={{
          __html: generateLipidBilayerSvg(width, height, fill, stroke, 'arc', opts?.curvature || 40)
        }}
      />
    )
  },
  {
    type: 'bio_lipid_bilayer_vesicle',
    category: 'cells',
    name: '小胞 / リポソーム (円形二重膜)',
    defaultWidth: 150,
    defaultHeight: 150,
    defaultFill: '#ef4444',
    defaultStroke: '#f59e0b',
    getSvgString: (fill, stroke, width = 150, height = 150) =>
      generateLipidBilayerSvg(width, height, fill, stroke, 'vesicle'),
    renderSvg: (fill, stroke, width = 150, height = 150) => (
      <div
        style={{ width: '100%', height: '100%' }}
        dangerouslySetInnerHTML={{
          __html: generateLipidBilayerSvg(width, height, fill, stroke, 'vesicle')
        }}
      />
    )
  },
  {
    type: 'bio_cell_animal',
    category: 'cells',
    name: '動物細胞 (オルガネラ付)',
    defaultWidth: 160,
    defaultHeight: 160,
    defaultFill: '#10b981',
    defaultStroke: '#047857',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <ellipse cx="80" cy="80" rx="74" ry="70" fill="${fill}" fill-opacity="0.25" stroke="${stroke}" stroke-width="4"/>
      <ellipse cx="68" cy="72" rx="32" ry="28" fill="#8b5cf6" fill-opacity="0.35" stroke="#6d28d9" stroke-width="2.5"/>
      <circle cx="64" cy="68" r="10" fill="#6d28d9"/>
      <ellipse cx="120" cy="90" rx="16" ry="9" fill="#ef4444" stroke="#b91c1c" stroke-width="2" transform="rotate(-20 120 90)"/>
      <path d="M 108,90 Q 120,84 132,90" fill="none" stroke="#ffffff" stroke-width="1.5"/>
      <path d="M 38,70 Q 30,85 45,100 T 70,110" fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round"/>
      <path d="M 45,65 Q 35,80 50,95" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"/>
      <path d="M 105,50 Q 125,55 110,65" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 160 160" width="100%" height="100%">
        <ellipse cx="80" cy="80" rx="74" ry="70" fill={fill} fillOpacity="0.25" stroke={stroke} strokeWidth="4"/>
        <ellipse cx="68" cy="72" rx="32" ry="28" fill="#8b5cf6" fillOpacity="0.35" stroke="#6d28d9" strokeWidth="2.5"/>
        <circle cx="64" cy="68" r="10" fill="#6d28d9"/>
        <ellipse cx="120" cy="90" rx="16" ry="9" fill="#ef4444" stroke="#b91c1c" strokeWidth="2" transform="rotate(-20 120 90)"/>
        <path d="M 108,90 Q 120,84 132,90" fill="none" stroke="#ffffff" strokeWidth="1.5"/>
        <path d="M 38,70 Q 30,85 45,100 T 70,110" fill="none" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round"/>
        <path d="M 45,65 Q 35,80 50,95" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/>
        <path d="M 105,50 Q 125,55 110,65" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    type: 'bio_cell_plant',
    category: 'cells',
    name: '植物細胞 (細胞壁・液胞・葉緑体)',
    defaultWidth: 170,
    defaultHeight: 150,
    defaultFill: '#22c55e',
    defaultStroke: '#15803d',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 150">
      <!-- Outer Rigid Cell Wall (厚い細胞壁 & 中間層) -->
      <polygon points="20,15 150,15 160,135 15,135" fill="#dcfce7" stroke="${stroke}" stroke-width="7" stroke-linejoin="round"/>
      <!-- Middle Lamella / Primary Wall boundary -->
      <polygon points="22,17 148,17 158,133 17,133" fill="none" stroke="#86efac" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Plasma Membrane (細胞膜) -->
      <polygon points="25,20 145,20 154,130 21,130" fill="${fill}" fill-opacity="0.15" stroke="#16a34a" stroke-width="1.8"/>

      <!-- Large Central Vacuole (大型中央液胞 & トノプラスト) -->
      <ellipse cx="92" cy="78" rx="46" ry="36" fill="#e0f2fe" fill-opacity="0.75" stroke="#38bdf8" stroke-width="2"/>
      <text x="92" y="82" font-size="8.5" font-weight="bold" fill="#0284c7" text-anchor="middle" opacity="0.8">液胞 (Vacuole)</text>

      <!-- Chloroplasts (葉緑体: チラコイド・グラナ積層付き) -->
      <g id="chloroplasts">
        <!-- Chl 1 (Top Left) -->
        <ellipse cx="45" cy="38" rx="14" ry="8" fill="#15803d" stroke="#14532d" stroke-width="1.5" transform="rotate(-15 45 38)"/>
        <line x1="37" y1="38" x2="53" y2="38" stroke="#86efac" stroke-width="1.5"/>
        <line x1="39" y1="35" x2="51" y2="35" stroke="#86efac" stroke-width="1.2"/>
        <line x1="40" y1="41" x2="50" y2="41" stroke="#86efac" stroke-width="1.2"/>
        <!-- Chl 2 (Top Right) -->
        <ellipse cx="125" cy="36" rx="14" ry="8" fill="#15803d" stroke="#14532d" stroke-width="1.5" transform="rotate(10 125 36)"/>
        <line x1="117" y1="36" x2="133" y2="36" stroke="#86efac" stroke-width="1.5"/>
        <line x1="119" y1="33" x2="131" y2="33" stroke="#86efac" stroke-width="1.2"/>
        <!-- Chl 3 (Bottom Left) -->
        <ellipse cx="40" cy="115" rx="13" ry="7.5" fill="#15803d" stroke="#14532d" stroke-width="1.5" transform="rotate(25 40 115)"/>
        <line x1="33" y1="115" x2="47" y2="115" stroke="#86efac" stroke-width="1.5"/>
        <!-- Chl 4 (Bottom Right) -->
        <ellipse cx="135" cy="112" rx="13" ry="8" fill="#15803d" stroke="#14532d" stroke-width="1.5" transform="rotate(-20 135 112)"/>
        <line x1="128" y1="112" x2="142" y2="112" stroke="#86efac" stroke-width="1.5"/>
      </g>

      <!-- Nucleus (核・核小体: 液胞により周辺部に押しやられた特徴的配置) -->
      <g id="nucleus" transform="translate(38, 72)">
        <circle cx="0" cy="0" r="16" fill="#c084fc" fill-opacity="0.5" stroke="#7e22ce" stroke-width="2"/>
        <circle cx="-3" cy="-2" r="5.5" fill="#6b21a8"/>
        <!-- Chromatin threads -->
        <path d="M 4,-6 Q 8,0 4,6" fill="none" stroke="#9333ea" stroke-width="1.5"/>
        <text x="0" y="24" font-size="7" font-weight="bold" fill="#6b21a8" text-anchor="middle">核</text>
      </g>

      <!-- Mitochondria (ミトコンドリア) -->
      <ellipse cx="80" cy="30" rx="9" ry="5" fill="#ef4444" stroke="#b91c1c" stroke-width="1.3"/>
      <path d="M 74,30 Q 80,27 86,30" fill="none" stroke="#ffffff" stroke-width="1"/>

      <!-- Endoplasmic Reticulum & Golgi (ゴルジ小体) -->
      <path d="M 52,60 Q 56,66 52,72" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"/>
      <path d="M 55,58 Q 59,66 55,74" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"/>

      <!-- Plasmodesmata channels (原形質連絡孔) -->
      <line x1="85" y1="12" x2="85" y2="18" stroke="#16a34a" stroke-width="2"/>
      <line x1="158" y1="75" x2="164" y2="75" stroke="#16a34a" stroke-width="2"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 170 150" width="100%" height="100%">
        <polygon points="20,15 150,15 160,135 15,135" fill="#dcfce7" stroke={stroke} strokeWidth="7" strokeLinejoin="round"/>
        <polygon points="22,17 148,17 158,133 17,133" fill="none" stroke="#86efac" strokeWidth="2.5" strokeLinejoin="round"/>
        <polygon points="25,20 145,20 154,130 21,130" fill={fill} fillOpacity="0.15" stroke="#16a34a" strokeWidth="1.8"/>
        <ellipse cx="92" cy="78" rx="46" ry="36" fill="#e0f2fe" fillOpacity="0.75" stroke="#38bdf8" strokeWidth="2"/>
        <text x="92" y="82" fontSize="8.5" fontWeight="bold" fill="#0284c7" textAnchor="middle" opacity="0.8">液胞 (Vacuole)</text>
        <ellipse cx="45" cy="38" rx="14" ry="8" fill="#15803d" stroke="#14532d" strokeWidth="1.5" transform="rotate(-15 45 38)"/>
        <line x1="37" y1="38" x2="53" y2="38" stroke="#86efac" strokeWidth="1.5"/>
        <line x1="39" y1="35" x2="51" y2="35" stroke="#86efac" strokeWidth="1.2"/>
        <line x1="40" y1="41" x2="50" y2="41" stroke="#86efac" strokeWidth="1.2"/>
        <ellipse cx="125" cy="36" rx="14" ry="8" fill="#15803d" stroke="#14532d" strokeWidth="1.5" transform="rotate(10 125 36)"/>
        <line x1="117" y1="36" x2="133" y2="36" stroke="#86efac" strokeWidth="1.5"/>
        <line x1="119" y1="33" x2="131" y2="33" stroke="#86efac" strokeWidth="1.2"/>
        <ellipse cx="40" cy="115" rx="13" ry="7.5" fill="#15803d" stroke="#14532d" strokeWidth="1.5" transform="rotate(25 40 115)"/>
        <line x1="33" y1="115" x2="47" y2="115" stroke="#86efac" strokeWidth="1.5"/>
        <ellipse cx="135" cy="112" rx="13" ry="8" fill="#15803d" stroke="#14532d" strokeWidth="1.5" transform="rotate(-20 135 112)"/>
        <line x1="128" y1="112" x2="142" y2="112" stroke="#86efac" strokeWidth="1.5"/>
        <g id="nucleus" transform="translate(38, 72)">
          <circle cx="0" cy="0" r="16" fill="#c084fc" fillOpacity="0.5" stroke="#7e22ce" strokeWidth="2"/>
          <circle cx="-3" cy="-2" r="5.5" fill="#6b21a8"/>
          <path d="M 4,-6 Q 8,0 4,6" fill="none" stroke="#9333ea" strokeWidth="1.5"/>
          <text x="0" y="24" fontSize="7" fontWeight="bold" fill="#6b21a8" textAnchor="middle">核</text>
        </g>
        <ellipse cx="80" cy="30" rx="9" ry="5" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.3"/>
        <path d="M 74,30 Q 80,27 86,30" fill="none" stroke="#ffffff" strokeWidth="1"/>
        <path d="M 52,60 Q 56,66 52,72" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/>
        <path d="M 55,58 Q 59,66 55,74" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/>
        <line x1="85" y1="12" x2="85" y2="18" stroke="#16a34a" strokeWidth="2"/>
        <line x1="158" y1="75" x2="164" y2="75" stroke="#16a34a" strokeWidth="2"/>
      </svg>
    )
  },
  {
    type: 'bio_bacteria',
    category: 'cells',
    name: '細菌 / 大腸菌 (鞭毛付き)',
    defaultWidth: 160,
    defaultHeight: 90,
    defaultFill: '#10b981',
    defaultStroke: '#047857',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">
      <path d="M 20,45 Q -5,30 -25,45 T -45,35" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 20,35 Q 0,15 -20,25 T -40,15" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
      <rect x="25" y="20" width="90" height="50" rx="25" fill="${fill}" fill-opacity="0.3" stroke="${stroke}" stroke-width="4"/>
      <path d="M 45,45 Q 60,32 75,45 T 100,45 T 60,55 Z" fill="none" stroke="#3b82f6" stroke-width="2.5"/>
      <line x1="40" y1="18" x2="35" y2="8" stroke="${stroke}" stroke-width="1.5"/>
      <line x1="70" y1="18" x2="70" y2="7" stroke="${stroke}" stroke-width="1.5"/>
      <line x1="100" y1="18" x2="105" y2="8" stroke="${stroke}" stroke-width="1.5"/>
      <line x1="55" y1="72" x2="50" y2="82" stroke="${stroke}" stroke-width="1.5"/>
      <line x1="85" y1="72" x2="90" y2="82" stroke="${stroke}" stroke-width="1.5"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 160 90" width="100%" height="100%">
        <path d="M 20,45 Q -5,30 -25,45 T -45,35" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M 20,35 Q 0,15 -20,25 T -40,15" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
        <rect x="25" y="20" width="90" height="50" rx="25" fill={fill} fillOpacity="0.3" stroke={stroke} strokeWidth="4"/>
        <path d="M 45,45 Q 60,32 75,45 T 100,45 T 60,55 Z" fill="none" stroke="#3b82f6" strokeWidth="2.5"/>
        <line x1="40" y1="18" x2="35" y2="8" stroke={stroke} strokeWidth="1.5"/>
        <line x1="70" y1="18" x2="70" y2="7" stroke={stroke} strokeWidth="1.5"/>
        <line x1="100" y1="18" x2="105" y2="8" stroke={stroke} strokeWidth="1.5"/>
        <line x1="55" y1="72" x2="50" y2="82" stroke={stroke} strokeWidth="1.5"/>
        <line x1="85" y1="72" x2="90" y2="82" stroke={stroke} strokeWidth="1.5"/>
      </svg>
    )
  },
  {
    type: 'bio_virus',
    category: 'cells',
    name: 'ウイルス (スパイク付き)',
    defaultWidth: 120,
    defaultHeight: 120,
    defaultFill: '#ec4899',
    defaultStroke: '#be185d',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="40" fill="${fill}" fill-opacity="0.3" stroke="${stroke}" stroke-width="3.5"/>
      <path d="M 45,60 Q 55,45 65,60 T 75,60" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315]
        .map(deg => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 60 + Math.cos(rad) * 40;
          const y1 = 60 + Math.sin(rad) * 40;
          const x2 = 60 + Math.cos(rad) * 54;
          const y2 = 60 + Math.sin(rad) * 54;
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="3"/>
                  <circle cx="${x2}" cy="${y2}" r="4" fill="#f59e0b"/>`;
        })
        .join('')}
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <circle cx="60" cy="60" r="40" fill={fill} fillOpacity="0.3" stroke={stroke} strokeWidth="3.5"/>
        <path d="M 45,60 Q 55,45 65,60 T 75,60" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"/>
        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 60 + Math.cos(rad) * 40;
          const y1 = 60 + Math.sin(rad) * 40;
          const x2 = 60 + Math.cos(rad) * 54;
          const y2 = 60 + Math.sin(rad) * 54;
          return (
            <g key={deg}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="3"/>
              <circle cx={x2} cy={y2} r="4" fill="#f59e0b"/>
            </g>
          );
        })}
      </svg>
    )
  },
  {
    type: 'bio_neuron',
    category: 'cells',
    name: '神経細胞 (ニューロン)',
    defaultWidth: 180,
    defaultHeight: 100,
    defaultFill: '#3b82f6',
    defaultStroke: '#1d4ed8',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 100">
      <polygon points="40,50 30,30 15,25 20,40 5,55 22,65 18,80 35,70" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="2.5"/>
      <circle cx="30" cy="50" r="8" fill="${stroke}"/>
      <line x1="40" y1="50" x2="150" y2="50" stroke="${stroke}" stroke-width="3"/>
      <rect x="55" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <rect x="80" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <rect x="105" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <rect x="130" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <path d="M 150,50 L 170,35 M 150,50 L 175,50 M 150,50 L 170,65" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="170" cy="35" r="2.5" fill="${stroke}"/>
      <circle cx="175" cy="50" r="2.5" fill="${stroke}"/>
      <circle cx="170" cy="65" r="2.5" fill="${stroke}"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 180 100" width="100%" height="100%">
        <polygon points="40,50 30,30 15,25 20,40 5,55 22,65 18,80 35,70" fill={fill} fillOpacity="0.35" stroke={stroke} strokeWidth="2.5"/>
        <circle cx="30" cy="50" r="8" fill={stroke}/>
        <line x1="40" y1="50" x2="150" y2="50" stroke={stroke} strokeWidth="3"/>
        <rect x="55" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5"/>
        <rect x="80" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5"/>
        <rect x="105" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5"/>
        <rect x="130" y="44" width="18" height="12" rx="4" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5"/>
        <path d="M 150,50 L 170,35 M 150,50 L 175,50 M 150,50 L 170,65" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
        <circle cx="170" cy="35" r="2.5" fill={stroke}/>
        <circle cx="175" cy="50" r="2.5" fill={stroke}/>
        <circle cx="170" cy="65" r="2.5" fill={stroke}/>
      </svg>
    )
  },

  // ==========================================
  // 3. 器官・個体 (Organs & Organisms)
  // ==========================================
  {
    type: 'bio_mouse',
    category: 'organisms',
    name: '実験マウス (Lab Mouse)',
    defaultWidth: 150,
    defaultHeight: 90,
    defaultFill: '#cbd5e1',
    defaultStroke: '#475569',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 90">
      <path d="M 125,50 Q 140,55 145,70 T 135,85" fill="none" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
      <path d="M 30,55 C 20,45 35,28 65,30 C 95,30 128,40 125,60 C 120,72 80,72 50,68 Z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
      <path d="M 40,45 Q 20,45 15,50 Q 20,58 35,58 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <circle cx="15" cy="50" r="2" fill="#ef4444"/>
      <ellipse cx="45" cy="32" rx="8" ry="11" fill="#fecdd3" stroke="${stroke}" stroke-width="2" transform="rotate(-15 45 32)"/>
      <circle cx="28" cy="46" r="2.5" fill="#ef4444"/>
      <ellipse cx="45" cy="70" rx="6" ry="3" fill="#fca5a5"/>
      <ellipse cx="105" cy="68" rx="8" ry="4" fill="#fca5a5"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 150 90" width="100%" height="100%">
        <path d="M 125,50 Q 140,55 145,70 T 135,85" fill="none" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round"/>
        <path d="M 30,55 C 20,45 35,28 65,30 C 95,30 128,40 125,60 C 120,72 80,72 50,68 Z" fill={fill} stroke={stroke} strokeWidth="3"/>
        <path d="M 40,45 Q 20,45 15,50 Q 20,58 35,58 Z" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <circle cx="15" cy="50" r="2" fill="#ef4444"/>
        <ellipse cx="45" cy="32" rx="8" ry="11" fill="#fecdd3" stroke={stroke} strokeWidth="2" transform="rotate(-15 45 32)"/>
        <circle cx="28" cy="46" r="2.5" fill="#ef4444"/>
        <ellipse cx="45" cy="70" rx="6" ry="3" fill="#fca5a5"/>
        <ellipse cx="105" cy="68" rx="8" ry="4" fill="#fca5a5"/>
      </svg>
    )
  },
  {
    type: 'bio_plant_shoot',
    category: 'organisms',
    name: 'シロイヌナズナ / 植物個体',
    defaultWidth: 100,
    defaultHeight: 140,
    defaultFill: '#22c55e',
    defaultStroke: '#15803d',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">
      <path d="M 50,135 L 50,30" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
      <path d="M 50,125 Q 30,115 15,130 Q 35,135 50,128 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <path d="M 50,125 Q 70,115 85,130 Q 65,135 50,128 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <path d="M 50,85 Q 25,75 20,60 Q 40,65 50,85 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <path d="M 50,65 Q 75,55 80,40 Q 60,45 50,65 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="50" cy="25" r="5" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5"/>
      <circle cx="43" cy="20" r="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <circle cx="57" cy="20" r="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 100 140" width="100%" height="100%">
        <path d="M 50,135 L 50,30" stroke={stroke} strokeWidth="3" strokeLinecap="round"/>
        <path d="M 50,125 Q 30,115 15,130 Q 35,135 50,128 Z" fill={fill} stroke={stroke} strokeWidth="2"/>
        <path d="M 50,125 Q 70,115 85,130 Q 65,135 50,128 Z" fill={fill} stroke={stroke} strokeWidth="2"/>
        <path d="M 50,85 Q 25,75 20,60 Q 40,65 50,85 Z" fill={fill} stroke={stroke} strokeWidth="2"/>
        <path d="M 50,65 Q 75,55 80,40 Q 60,45 50,65 Z" fill={fill} stroke={stroke} strokeWidth="2"/>
        <circle cx="50" cy="25" r="5" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5"/>
        <circle cx="43" cy="20" r="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
        <circle cx="57" cy="20" r="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
      </svg>
    )
  },
  {
    type: 'bio_brain',
    category: 'organisms',
    name: '脳 (Brain)',
    defaultWidth: 130,
    defaultHeight: 110,
    defaultFill: '#f472b6',
    defaultStroke: '#db2777',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 110">
      <path d="M 30,70 C 15,60 15,35 35,25 C 45,15 70,10 90,20 C 110,15 125,35 120,55 C 125,75 105,90 90,85 C 80,95 65,95 55,85 C 40,90 25,80 30,70 Z" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="3.5"/>
      <path d="M 85,85 Q 95,95 85,105 L 75,105 Q 70,95 75,88" fill="#fda4af" stroke="${stroke}" stroke-width="2.5"/>
      <path d="M 35,45 Q 60,40 75,55 T 110,50" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 50,25 Q 60,45 50,65" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 80,25 Q 90,45 85,75" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 130 110" width="100%" height="100%">
        <path d="M 30,70 C 15,60 15,35 35,25 C 45,15 70,10 90,20 C 110,15 125,35 120,55 C 125,75 105,90 90,85 C 80,95 65,95 55,85 C 40,90 25,80 30,70 Z" fill={fill} fillOpacity="0.35" stroke={stroke} strokeWidth="3.5"/>
        <path d="M 85,85 Q 95,95 85,105 L 75,105 Q 70,95 75,88" fill="#fda4af" stroke={stroke} strokeWidth="2.5"/>
        <path d="M 35,45 Q 60,40 75,55 T 110,50" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M 50,25 Q 60,45 50,65" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M 80,25 Q 90,45 85,75" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    type: 'bio_wheat',
    category: 'organisms',
    name: 'コムギ / 小麦 (出穂・小穂)',
    defaultWidth: 100,
    defaultHeight: 160,
    defaultFill: '#eab308',
    defaultStroke: '#a16207',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160">
      <path d="M 50,158 L 50,75" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="50" cy="115" rx="3.5" ry="2" fill="${stroke}"/>
      <path d="M 50,115 Q 75,100 88,115 Q 65,122 50,117 Z" fill="#84cc16" stroke="#4d7c0f" stroke-width="1.8"/>
      <path d="M 50,75 L 50,22" stroke="${stroke}" stroke-width="2.5"/>
      <path d="M 50,70 Q 32,65 35,56 Q 48,58 50,65 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M 35,56 L 15,35" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 50,64 Q 68,59 65,50 Q 52,52 50,59 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M 65,50 L 85,30" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 50,55 Q 34,50 37,41 Q 48,43 50,50 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M 37,41 L 20,20" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 50,49 Q 66,44 63,35 Q 52,37 50,44 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M 63,35 L 80,15" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 50,40 Q 36,35 39,26 Q 48,28 50,35 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M 39,26 L 25,6" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 50,34 Q 64,29 61,20 Q 52,22 50,29 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M 61,20 L 75,2" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 46,24 Q 50,14 54,24 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
      <line x1="50" y1="14" x2="50" y2="2" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="47" y1="16" x2="42" y2="4" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="53" y1="16" x2="58" y2="4" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 100 160" width="100%" height="100%">
        <path d="M 50,158 L 50,75" stroke={stroke} strokeWidth="3" strokeLinecap="round"/>
        <ellipse cx="50" cy="115" rx="3.5" ry="2" fill={stroke}/>
        <path d="M 50,115 Q 75,100 88,115 Q 65,122 50,117 Z" fill="#84cc16" stroke="#4d7c0f" strokeWidth="1.8"/>
        <path d="M 50,75 L 50,22" stroke={stroke} strokeWidth="2.5"/>
        <path d="M 50,70 Q 32,65 35,56 Q 48,58 50,65 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <path d="M 35,56 L 15,35" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 50,64 Q 68,59 65,50 Q 52,52 50,59 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <path d="M 65,50 L 85,30" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 50,55 Q 34,50 37,41 Q 48,43 50,50 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <path d="M 37,41 L 20,20" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 50,49 Q 66,44 63,35 Q 52,37 50,44 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <path d="M 63,35 L 80,15" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 50,40 Q 36,35 39,26 Q 48,28 50,35 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <path d="M 39,26 L 25,6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 50,34 Q 64,29 61,20 Q 52,22 50,29 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <path d="M 61,20 L 75,2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 46,24 Q 50,14 54,24 Z" fill={fill} stroke={stroke} strokeWidth="1.8"/>
        <line x1="50" y1="14" x2="50" y2="2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="47" y1="16" x2="42" y2="4" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="53" y1="16" x2="58" y2="4" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    type: 'bio_mouse_realistic',
    category: 'organisms',
    name: '実験マウス (写実・TIFF/PNG)',
    defaultWidth: 170,
    defaultHeight: 125,
    defaultFill: '#ffffff',
    defaultStroke: '#64748b',
    isImage: true,
    imageSrc: '/illustrations/mouse_realistic.png',
    tiffSrc: '/illustrations/mouse_realistic.tiff',
    badge: 'TIFF/PNG',
    getSvgString: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 125"><image href="/illustrations/mouse_realistic.png" width="170" height="125"/></svg>`,
    renderSvg: () => (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/illustrations/mouse_realistic.png" alt="マウス" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    )
  },
  {
    type: 'bio_arabidopsis_realistic',
    category: 'organisms',
    name: 'シロイヌナズナ (個体全体・TIFF/PNG)',
    defaultWidth: 130,
    defaultHeight: 175,
    defaultFill: '#ffffff',
    defaultStroke: '#15803d',
    isImage: true,
    imageSrc: '/illustrations/arabidopsis_realistic.png',
    tiffSrc: '/illustrations/arabidopsis_realistic.tiff',
    badge: 'TIFF/PNG',
    getSvgString: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 175"><image href="/illustrations/arabidopsis_realistic.png" width="130" height="175"/></svg>`,
    renderSvg: () => (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/illustrations/arabidopsis_realistic.png" alt="シロイヌナズナ" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    )
  },
  {
    type: 'bio_wheat_realistic',
    category: 'organisms',
    name: 'コムギ (個体全体・TIFF/PNG)',
    defaultWidth: 130,
    defaultHeight: 175,
    defaultFill: '#ffffff',
    defaultStroke: '#a16207',
    isImage: true,
    imageSrc: '/illustrations/wheat_realistic.png',
    tiffSrc: '/illustrations/wheat_realistic.tiff',
    badge: 'TIFF/PNG',
    getSvgString: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 175"><image href="/illustrations/wheat_realistic.png" width="130" height="175"/></svg>`,
    renderSvg: () => (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/illustrations/wheat_realistic.png" alt="コムギ" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    )
  },

  // ==========================================
  // 4. 実験器具 (Labware & Equipment - 2D & 3D)
  // ==========================================
  {
    type: 'bio_beaker_2d',
    category: 'equipment',
    name: 'ビーカー (2D 平面図)',
    defaultWidth: 110,
    defaultHeight: 130,
    defaultFill: '#38bdf8',
    defaultStroke: '#0284c7',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 130">
      <path d="M 15,15 L 95,15 M 15,15 L 8,11" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 15,15 L 18,115 Q 18,125 30,125 L 80,125 Q 92,125 92,115 L 95,15" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 19,70 Q 55,75 91,70 L 90,115 Q 90,123 80,123 L 30,123 Q 20,123 20,115 Z" fill="${fill}" fill-opacity="0.55"/>
      <line x1="20" y1="40" x2="35" y2="40" stroke="#94a3b8" stroke-width="2"/>
      <line x1="20" y1="60" x2="45" y2="60" stroke="#94a3b8" stroke-width="2"/>
      <line x1="20" y1="80" x2="35" y2="80" stroke="#94a3b8" stroke-width="2"/>
      <line x1="20" y1="100" x2="45" y2="100" stroke="#94a3b8" stroke-width="2"/>
      <text x="50" y="63" font-size="8" fill="#64748b">100ml</text>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 110 130" width="100%" height="100%">
        <path d="M 15,15 L 95,15 M 15,15 L 8,11" stroke={stroke} strokeWidth="4" strokeLinecap="round"/>
        <path d="M 15,15 L 18,115 Q 18,125 30,125 L 80,125 Q 92,125 92,115 L 95,15" fill="none" stroke={stroke} strokeWidth="4" strokeLinejoin="round"/>
        <path d="M 19,70 Q 55,75 91,70 L 90,115 Q 90,123 80,123 L 30,123 Q 20,123 20,115 Z" fill={fill} fillOpacity="0.55"/>
        <line x1="20" y1="40" x2="35" y2="40" stroke="#94a3b8" strokeWidth="2"/>
        <line x1="20" y1="60" x2="45" y2="60" stroke="#94a3b8" strokeWidth="2"/>
        <line x1="20" y1="80" x2="35" y2="80" stroke="#94a3b8" strokeWidth="2"/>
        <line x1="20" y1="100" x2="45" y2="100" stroke="#94a3b8" strokeWidth="2"/>
        <text x="50" y="63" fontSize="8" fill="#64748b">100ml</text>
      </svg>
    )
  },
  {
    type: 'bio_beaker_3d',
    category: 'equipment',
    name: 'ビーカー (3D 立体図)',
    defaultWidth: 120,
    defaultHeight: 140,
    defaultFill: '#38bdf8',
    defaultStroke: '#0284c7',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140">
      <defs>
        <linearGradient id="g-beaker-glare" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6"/>
          <stop offset="25%" stop-color="#ffffff" stop-opacity="0.1"/>
          <stop offset="85%" stop-color="#ffffff" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.7"/>
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="120" rx="42" ry="12" fill="#e2e8f0" stroke="${stroke}" stroke-width="3"/>
      <path d="M 20,75 L 20,120 C 20,128 100,128 100,120 L 100,75 Z" fill="${fill}" fill-opacity="0.6"/>
      <ellipse cx="60" cy="75" rx="40" ry="10" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="1.5"/>
      <path d="M 18,25 L 18,120 C 18,132 102,132 102,120 L 102,25" fill="url(#g-beaker-glare)" stroke="${stroke}" stroke-width="3.5"/>
      <ellipse cx="60" cy="25" rx="42" ry="12" fill="#ffffff" fill-opacity="0.2" stroke="${stroke}" stroke-width="3.5"/>
      <path d="M 18,25 Q 10,21 14,18 Q 23,20 28,24" fill="none" stroke="${stroke}" stroke-width="3"/>
      <path d="M 22,50 Q 40,55 55,54" fill="none" stroke="#94a3b8" stroke-width="2"/>
      <path d="M 20,70 Q 45,76 65,74" fill="none" stroke="#94a3b8" stroke-width="2.5"/>
      <path d="M 20,90 Q 45,96 65,94" fill="none" stroke="#ffffff" stroke-width="2"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 120 140" width="100%" height="100%">
        <defs>
          <linearGradient id="g-beaker-glare" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6"/>
            <stop offset="25%" stopColor="#ffffff" stopOpacity="0.1"/>
            <stop offset="85%" stopColor="#ffffff" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.7"/>
          </linearGradient>
        </defs>
        <ellipse cx="60" cy="120" rx="42" ry="12" fill="#e2e8f0" stroke={stroke} strokeWidth="3"/>
        <path d="M 20,75 L 20,120 C 20,128 100,128 100,120 L 100,75 Z" fill={fill} fillOpacity="0.6"/>
        <ellipse cx="60" cy="75" rx="40" ry="10" fill={fill} fillOpacity="0.85" stroke={stroke} strokeWidth="1.5"/>
        <path d="M 18,25 L 18,120 C 18,132 102,132 102,120 L 102,25" fill="url(#g-beaker-glare)" stroke={stroke} strokeWidth="3.5"/>
        <ellipse cx="60" cy="25" rx="42" ry="12" fill="#ffffff" fillOpacity="0.2" stroke={stroke} strokeWidth="3.5"/>
        <path d="M 18,25 Q 10,21 14,18 Q 23,20 28,24" fill="none" stroke={stroke} strokeWidth="3"/>
        <path d="M 22,50 Q 40,55 55,54" fill="none" stroke="#94a3b8" strokeWidth="2"/>
        <path d="M 20,70 Q 45,76 65,74" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
        <path d="M 20,90 Q 45,96 65,94" fill="none" stroke="#ffffff" strokeWidth="2"/>
      </svg>
    )
  },
  {
    type: 'bio_flask_2d',
    category: 'equipment',
    name: '三角フラスコ (2D 平面図)',
    defaultWidth: 110,
    defaultHeight: 140,
    defaultFill: '#10b981',
    defaultStroke: '#047857',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 140">
      <path d="M 45,15 L 65,15 L 65,45 L 98,120 C 100,125 96,130 90,130 L 20,130 C 14,130 10,125 12,120 L 45,45 Z" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
      <line x1="40" y1="12" x2="70" y2="12" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 28,125 L 82,125 L 70,95 Q 55,90 40,95 Z" fill="${fill}" fill-opacity="0.6"/>
      <line x1="42" y1="95" x2="55" y2="95" stroke="#94a3b8" stroke-width="2"/>
      <line x1="36" y1="110" x2="52" y2="110" stroke="#94a3b8" stroke-width="2"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 110 140" width="100%" height="100%">
        <path d="M 45,15 L 65,15 L 65,45 L 98,120 C 100,125 96,130 90,130 L 20,130 C 14,130 10,125 12,120 L 45,45 Z" fill="none" stroke={stroke} strokeWidth="4" strokeLinejoin="round"/>
        <line x1="40" y1="12" x2="70" y2="12" stroke={stroke} strokeWidth="4" strokeLinecap="round"/>
        <path d="M 28,125 L 82,125 L 70,95 Q 55,90 40,95 Z" fill={fill} fillOpacity="0.6"/>
        <line x1="42" y1="95" x2="55" y2="95" stroke="#94a3b8" strokeWidth="2"/>
        <line x1="36" y1="110" x2="52" y2="110" stroke="#94a3b8" strokeWidth="2"/>
      </svg>
    )
  },
  {
    type: 'bio_flask_3d',
    category: 'equipment',
    name: '三角フラスコ (3D 立体図)',
    defaultWidth: 120,
    defaultHeight: 150,
    defaultFill: '#10b981',
    defaultStroke: '#047857',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">
      <ellipse cx="60" cy="132" rx="46" ry="12" fill="#e2e8f0" stroke="${stroke}" stroke-width="3"/>
      <path d="M 32,95 L 14,132 C 14,142 106,142 106,132 L 88,95 Z" fill="${fill}" fill-opacity="0.6"/>
      <ellipse cx="60" cy="95" rx="28" ry="7" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="1.5"/>
      <path d="M 48,45 L 14,132 C 14,144 106,144 106,132 L 72,45 Z" fill="#ffffff" fill-opacity="0.2" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
      <rect x="48" y="16" width="24" height="30" fill="#ffffff" fill-opacity="0.2" stroke="${stroke}" stroke-width="3"/>
      <ellipse cx="60" cy="16" rx="14" ry="5" fill="#ffffff" stroke="${stroke}" stroke-width="3"/>
      <path d="M 28,128 L 52,50" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-opacity="0.75"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 120 150" width="100%" height="100%">
        <ellipse cx="60" cy="132" rx="46" ry="12" fill="#e2e8f0" stroke={stroke} strokeWidth="3"/>
        <path d="M 32,95 L 14,132 C 14,142 106,142 106,132 L 88,95 Z" fill={fill} fillOpacity="0.6"/>
        <ellipse cx="60" cy="95" rx="28" ry="7" fill={fill} fillOpacity="0.85" stroke={stroke} strokeWidth="1.5"/>
        <path d="M 48,45 L 14,132 C 14,144 106,144 106,132 L 72,45 Z" fill="#ffffff" fillOpacity="0.2" stroke={stroke} strokeWidth="3.5" strokeLinejoin="round"/>
        <rect x="48" y="16" width="24" height="30" fill="#ffffff" fillOpacity="0.2" stroke={stroke} strokeWidth="3"/>
        <ellipse cx="60" cy="16" rx="14" ry="5" fill="#ffffff" stroke={stroke} strokeWidth="3"/>
        <path d="M 28,128 L 52,50" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.75"/>
      </svg>
    )
  },
  {
    type: 'bio_pipette',
    category: 'equipment',
    name: 'マイクロピペット',
    defaultWidth: 60,
    defaultHeight: 180,
    defaultFill: '#f59e0b',
    defaultStroke: '#b45309',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 180">
      <rect x="22" y="6" width="16" height="18" rx="3" fill="#64748b"/>
      <rect x="18" y="24" width="24" height="90" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
      <rect x="21" y="42" width="18" height="24" rx="2" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="30" y="58" font-size="9" font-family="monospace" font-weight="bold" fill="#0f172a" text-anchor="middle">100</text>
      <path d="M 24,114 L 27,155 L 33,155 L 36,114 Z" fill="#e2e8f0" stroke="${stroke}" stroke-width="2"/>
      <polygon points="28,155 32,155 30,174" fill="#38bdf8" stroke="#0284c7" stroke-width="1"/>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 60 180" width="100%" height="100%">
        <rect x="22" y="6" width="16" height="18" rx="3" fill="#64748b"/>
        <rect x="18" y="24" width="24" height="90" rx="6" fill={fill} stroke={stroke} strokeWidth="3"/>
        <rect x="21" y="42" width="18" height="24" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5"/>
        <text x="30" y="58" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" textAnchor="middle">100</text>
        <path d="M 24,114 L 27,155 L 33,155 L 36,114 Z" fill="#e2e8f0" stroke={stroke} strokeWidth="2"/>
        <polygon points="28,155 32,155 30,174" fill="#38bdf8" stroke="#0284c7" strokeWidth="1"/>
      </svg>
    )
  },
  {
    type: 'bio_tube_eppendorf',
    category: 'equipment',
    name: 'エッペン管 (マイクロチューブ)',
    defaultWidth: 70,
    defaultHeight: 120,
    defaultFill: '#38bdf8',
    defaultStroke: '#0284c7',
    getSvgString: (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 120">
      <path d="M 20,20 Q 5,15 10,5 Q 25,5 24,16" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
      <rect x="20" y="15" width="30" height="8" rx="2" fill="#e2e8f0" stroke="${stroke}" stroke-width="2.5"/>
      <path d="M 24,23 L 24,80 Q 24,115 35,115 Q 46,115 46,80 L 46,23 Z" fill="${fill}" fill-opacity="0.3" stroke="${stroke}" stroke-width="3"/>
      <path d="M 25,75 Q 35,78 45,75 L 45,82 Q 45,114 35,114 Q 25,114 25,82 Z" fill="${fill}" fill-opacity="0.8"/>
      <line x1="24" y1="45" x2="33" y2="45" stroke="#94a3b8" stroke-width="1.5"/>
      <line x1="24" y1="65" x2="36" y2="65" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="39" y="67" font-size="7" fill="#64748b">1.5</text>
    </svg>`,
    renderSvg: (fill, stroke) => (
      <svg viewBox="0 0 70 120" width="100%" height="100%">
        <path d="M 20,20 Q 5,15 10,5 Q 25,5 24,16" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round"/>
        <rect x="20" y="15" width="30" height="8" rx="2" fill="#e2e8f0" stroke={stroke} strokeWidth="2.5"/>
        <path d="M 24,23 L 24,80 Q 24,115 35,115 Q 46,115 46,80 L 46,23 Z" fill={fill} fillOpacity="0.3" stroke={stroke} strokeWidth="3"/>
        <path d="M 25,75 Q 35,78 45,75 L 45,82 Q 45,114 35,114 Q 25,114 25,82 Z" fill={fill} fillOpacity="0.8"/>
        <line x1="24" y1="45" x2="33" y2="45" stroke="#94a3b8" strokeWidth="1.5"/>
        <line x1="24" y1="65" x2="36" y2="65" stroke="#94a3b8" strokeWidth="1.5"/>
        <text x="39" y="67" fontSize="7" fill="#64748b">1.5</text>
      </svg>
    )
  },
  {
    type: 'bio_petridish',
    category: 'equipment',
    name: 'シャーレ (3D 立体ペトリ皿・培地コロニー)',
    defaultWidth: 150,
    defaultHeight: 100,
    defaultFill: '#fef08a',
    defaultStroke: '#ca8a04',
    getSvgString: (fill, stroke) => {
      const colonies = [
        { x: 50, y: 70, r: 3.6 },
        { x: 63, y: 72, r: 3.4 },
        { x: 76, y: 71, r: 3.6 },
        { x: 58, y: 64, r: 3.2 },
        { x: 72, y: 63, r: 3.9 },
        { x: 86, y: 66, r: 3.5 },
        { x: 84, y: 73, r: 3.1 },
        { x: 97, y: 69, r: 2.8 },
        { x: 105, y: 64, r: 3.2 },
        { x: 114, y: 61, r: 2.6 },
        { x: 65, y: 56, r: 2.7 },
        { x: 80, y: 56, r: 2.8 },
        { x: 44, y: 64, r: 2.9 },
        { x: 36, y: 47, r: 2.0 },
        { x: 42, y: 52, r: 2.3 },
        { x: 48, y: 46, r: 2.2 },
        { x: 54, y: 49, r: 2.4 },
        { x: 62, y: 47, r: 2.1 },
        { x: 74, y: 48, r: 2.3 },
        { x: 85, y: 47, r: 2.5 },
        { x: 96, y: 48, r: 2.3 },
        { x: 108, y: 49, r: 2.2 },
        { x: 118, y: 54, r: 2.4 },
        { x: 124, y: 61, r: 2.2 },
        { x: 118, y: 67, r: 2.5 },
        { x: 126, y: 66, r: 1.8 }
      ];

      const colonySvgs = colonies.map((c) => `
        <ellipse cx="${c.x + 0.3}" cy="${c.y + c.r * 0.4}" rx="${c.r * 1.1}" ry="${c.r * 0.55}" fill="#78350f" fill-opacity="0.36"/>
        <circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="#dc2626"/>
        <ellipse cx="${c.x - c.r * 0.15}" cy="${c.y - c.r * 0.15}" rx="${c.r * 0.8}" ry="${c.r * 0.72}" fill="#f87171"/>
        <ellipse cx="${c.x - c.r * 0.38}" cy="${c.y - c.r * 0.38}" rx="${c.r * 0.35}" ry="${c.r * 0.22}" fill="#ffffff" fill-opacity="0.92"/>
      `).join('');

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" width="100%" height="100%">
        <!-- Ground Shadow -->
        <ellipse cx="80" cy="85" rx="72" ry="14" fill="#0f172a" fill-opacity="0.12"/>
        
        <!-- Dish Outer Glass Cylinder Base -->
        <path d="M 12,44 L 12,74 A 68 24 0 0 0 148,74 L 148,44 Z" fill="#f8fafc" fill-opacity="0.32" stroke="#94a3b8" stroke-width="2"/>
        <path d="M 12,74 A 68 24 0 0 0 148,74" fill="none" stroke="#64748b" stroke-width="2.5"/>
        
        <!-- Agar Gel Depth Slab (Vertical Layer) -->
        <path d="M 16,56 L 16,70 A 64 21 0 0 0 144,70 L 144,56 A 64 21 0 0 1 16,56 Z" fill="${stroke}" fill-opacity="0.45"/>
        
        <!-- Agar Gel Top Surface -->
        <ellipse cx="80" cy="56" rx="64" ry="21" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="1.2"/>
        <!-- Meniscus Highlight -->
        <ellipse cx="80" cy="56" rx="62.5" ry="20" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.5"/>
        
        <!-- Quadrant Streak Loops (画線塗抹法) -->
        <path d="M 30,46 Q 38,42 46,45 T 38,51 T 52,48 T 42,56 T 60,52" fill="none" stroke="#b91c1c" stroke-width="1.8" stroke-opacity="0.65" stroke-linecap="round"/>
        <path d="M 58,48 Q 72,44 88,46 T 74,52 T 96,50 T 82,56 T 106,53" fill="none" stroke="#dc2626" stroke-width="1.4" stroke-opacity="0.55" stroke-linecap="round"/>
        <path d="M 104,52 Q 116,56 122,62 T 104,66 T 120,69 T 98,71" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-opacity="0.45" stroke-linecap="round"/>
        <path d="M 98,71 Q 82,73 68,69 T 54,67" fill="none" stroke="#f87171" stroke-width="1.0" stroke-opacity="0.4" stroke-dasharray="2 3" stroke-linecap="round"/>
        
        <!-- 3D Convex Bacterial Colonies -->
        ${colonySvgs}
        
        <!-- Front Glass Specular Sheen -->
        <path d="M 20,49 A 64 21 0 0 0 66,69" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.6"/>
        <path d="M 25,55 A 62 20 0 0 0 55,69" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.35"/>
        
        <!-- Glass Dish Top Rim -->
        <ellipse cx="80" cy="44" rx="68" ry="24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-opacity="0.8"/>
        <ellipse cx="80" cy="44" rx="65" ry="22.5" fill="none" stroke="#cbd5e1" stroke-width="1.2" stroke-opacity="0.85"/>
        <!-- Upper Rim Specular Highlights -->
        <path d="M 24,37 A 68 24 0 0 1 76,20" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.9"/>
        <path d="M 88,67 A 68 24 0 0 0 142,54" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.7"/>
        <line x1="12" y1="44" x2="12" y2="74" stroke="#e2e8f0" stroke-width="1.6" stroke-opacity="0.75"/>
        <line x1="148" y1="44" x2="148" y2="74" stroke="#94a3b8" stroke-width="1.6" stroke-opacity="0.6"/>
      </svg>`;
    },
    renderSvg: (fill, stroke) => {
      const colonies = [
        { x: 50, y: 70, r: 3.6 },
        { x: 63, y: 72, r: 3.4 },
        { x: 76, y: 71, r: 3.6 },
        { x: 58, y: 64, r: 3.2 },
        { x: 72, y: 63, r: 3.9 },
        { x: 86, y: 66, r: 3.5 },
        { x: 84, y: 73, r: 3.1 },
        { x: 97, y: 69, r: 2.8 },
        { x: 105, y: 64, r: 3.2 },
        { x: 114, y: 61, r: 2.6 },
        { x: 65, y: 56, r: 2.7 },
        { x: 80, y: 56, r: 2.8 },
        { x: 44, y: 64, r: 2.9 },
        { x: 36, y: 47, r: 2.0 },
        { x: 42, y: 52, r: 2.3 },
        { x: 48, y: 46, r: 2.2 },
        { x: 54, y: 49, r: 2.4 },
        { x: 62, y: 47, r: 2.1 },
        { x: 74, y: 48, r: 2.3 },
        { x: 85, y: 47, r: 2.5 },
        { x: 96, y: 48, r: 2.3 },
        { x: 108, y: 49, r: 2.2 },
        { x: 118, y: 54, r: 2.4 },
        { x: 124, y: 61, r: 2.2 },
        { x: 118, y: 67, r: 2.5 },
        { x: 126, y: 66, r: 1.8 }
      ];

      return (
        <svg viewBox="0 0 160 100" width="100%" height="100%">
          {/* Ground Shadow */}
          <ellipse cx="80" cy="85" rx="72" ry="14" fill="#0f172a" fillOpacity="0.12"/>
          
          {/* Dish Outer Glass Cylinder Base */}
          <path d="M 12,44 L 12,74 A 68 24 0 0 0 148,74 L 148,44 Z" fill="#f8fafc" fillOpacity="0.32" stroke="#94a3b8" strokeWidth="2"/>
          <path d="M 12,74 A 68 24 0 0 0 148,74" fill="none" stroke="#64748b" strokeWidth="2.5"/>
          
          {/* Agar Gel Depth Slab (Vertical Layer) */}
          <path d="M 16,56 L 16,70 A 64 21 0 0 0 144,70 L 144,56 A 64 21 0 0 1 16,56 Z" fill={stroke} fillOpacity="0.45"/>
          
          {/* Agar Gel Top Surface */}
          <ellipse cx="80" cy="56" rx="64" ry="21" fill={fill} fillOpacity="0.85" stroke={stroke} strokeWidth="1.2"/>
          {/* Meniscus Highlight */}
          <ellipse cx="80" cy="56" rx="62.5" ry="20" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.5"/>
          
          {/* Quadrant Streak Loops (画線塗抹法) */}
          <path d="M 30,46 Q 38,42 46,45 T 38,51 T 52,48 T 42,56 T 60,52" fill="none" stroke="#b91c1c" strokeWidth="1.8" strokeOpacity="0.65" strokeLinecap="round"/>
          <path d="M 58,48 Q 72,44 88,46 T 74,52 T 96,50 T 82,56 T 106,53" fill="none" stroke="#dc2626" strokeWidth="1.4" strokeOpacity="0.55" strokeLinecap="round"/>
          <path d="M 104,52 Q 116,56 122,62 T 104,66 T 120,69 T 98,71" fill="none" stroke="#ef4444" strokeWidth="1.2" strokeOpacity="0.45" strokeLinecap="round"/>
          <path d="M 98,71 Q 82,73 68,69 T 54,67" fill="none" stroke="#f87171" strokeWidth="1.0" strokeOpacity="0.4" strokeDasharray="2 3" strokeLinecap="round"/>
          
          {/* 3D Convex Bacterial Colonies */}
          {colonies.map((c, i) => (
            <g key={`colony-${i}`}>
              <ellipse cx={c.x + 0.3} cy={c.y + c.r * 0.4} rx={c.r * 1.1} ry={c.r * 0.55} fill="#78350f" fillOpacity="0.36"/>
              <circle cx={c.x} cy={c.y} r={c.r} fill="#dc2626"/>
              <ellipse cx={c.x - c.r * 0.15} cy={c.y - c.r * 0.15} rx={c.r * 0.8} ry={c.r * 0.72} fill="#f87171"/>
              <ellipse cx={c.x - c.r * 0.38} cy={c.y - c.r * 0.38} rx={c.r * 0.35} ry={c.r * 0.22} fill="#ffffff" fillOpacity="0.92"/>
            </g>
          ))}
          
          {/* Front Glass Specular Sheen */}
          <path d="M 20,49 A 64 21 0 0 0 66,69" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.6"/>
          <path d="M 25,55 A 62 20 0 0 0 55,69" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.35"/>
          
          {/* Glass Dish Top Rim */}
          <ellipse cx="80" cy="44" rx="68" ry="24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeOpacity="0.8"/>
          <ellipse cx="80" cy="44" rx="65" ry="22.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" strokeOpacity="0.85"/>
          {/* Upper Rim Specular Highlights */}
          <path d="M 24,37 A 68 24 0 0 1 76,20" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.9"/>
          <path d="M 88,67 A 68 24 0 0 0 142,54" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.7"/>
          <line x1="12" y1="44" x2="12" y2="74" stroke="#e2e8f0" strokeWidth="1.6" strokeOpacity="0.75"/>
          <line x1="148" y1="44" x2="148" y2="74" stroke="#94a3b8" strokeWidth="1.6" strokeOpacity="0.6"/>
        </svg>
      );
    }
  },
  {
    type: 'bio_plate_96',
    category: 'equipment',
    name: '96ウェルマイクロプレート (8×12 均等配置)',
    defaultWidth: 190,
    defaultHeight: 135,
    defaultFill: '#ffffff',
    defaultStroke: '#94a3b8',
    getSvgString: (fill, stroke) => {
      const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const colLabels = Array.from({ length: 12 }, (_, c) => {
        const cx = 32 + c * 11.5;
        return `<text x="${cx}" y="19" font-size="5.5" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" fill="#64748b" text-anchor="middle">${c + 1}</text>`;
      }).join('');

      const rowLabels = ROWS.map((row, r) => {
        const cy = 27 + r * 11.5 + 2;
        return `<text x="21" y="${cy}" font-size="5.5" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" fill="#64748b" text-anchor="middle">${row}</text>`;
      }).join('');

      const wells = Array.from({ length: 96 }, (_, i) => {
        const r = Math.floor(i / 12);
        const c = i % 12;
        const cx = 32 + c * 11.5;
        const cy = 27 + r * 11.5;
        return `
          <circle cx="${cx}" cy="${cy}" r="4.5" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.8"/>
          <circle cx="${cx}" cy="${cy}" r="3.7" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.5"/>
          <circle cx="${cx}" cy="${cy}" r="3.1" fill="${fill}" fill-opacity="${fill === '#ffffff' ? '0.15' : '0.4'}"/>
          <ellipse cx="${cx - 1}" cy="${cy - 1}" rx="1.5" ry="0.9" fill="#ffffff" fill-opacity="0.8"/>
        `;
      }).join('');

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 135" width="100%" height="100%">
        <!-- Outer Plate Skirt -->
        <rect x="8" y="6" width="174" height="123" rx="6" fill="#f1f5f9" stroke="${stroke}" stroke-width="2"/>
        <!-- Top-Left A1 Notch Chamfer -->
        <polygon points="8,16 18,6 8,6" fill="#cbd5e1"/>
        <!-- Inner Raised Rim -->
        <rect x="13" y="10" width="164" height="115" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>
        <!-- Well Matrix Recess Base -->
        <rect x="25" y="21" width="147" height="98" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <!-- Grid Column Labels 1-12 -->
        ${colLabels}
        <!-- Grid Row Labels A-H -->
        ${rowLabels}
        <!-- 96 Uniform Wells (8x12) -->
        ${wells}
      </svg>`;
    },
    renderSvg: (fill, stroke) => {
      const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      return (
        <svg viewBox="0 0 190 135" width="100%" height="100%">
          <rect x="8" y="6" width="174" height="123" rx="6" fill="#f1f5f9" stroke={stroke} strokeWidth="2"/>
          <polygon points="8,16 18,6 8,6" fill="#cbd5e1"/>
          <rect x="13" y="10" width="164" height="115" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.2"/>
          <rect x="25" y="21" width="147" height="98" rx="3" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1"/>
          {Array.from({ length: 12 }, (_, c) => (
            <text key={`col-${c}`} x={32 + c * 11.5} y={19} fontSize="5.5" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" fontWeight="bold" fill="#64748b" textAnchor="middle">
              {c + 1}
            </text>
          ))}
          {ROWS.map((row, r) => (
            <text key={`row-${r}`} x={21} y={27 + r * 11.5 + 2} fontSize="5.5" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" fontWeight="bold" fill="#64748b" textAnchor="middle">
              {row}
            </text>
          ))}
          {Array.from({ length: 96 }, (_, i) => {
            const r = Math.floor(i / 12);
            const c = i % 12;
            const cx = 32 + c * 11.5;
            const cy = 27 + r * 11.5;
            return (
              <g key={`well-${i}`}>
                <circle cx={cx} cy={cy} r="4.5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8"/>
                <circle cx={cx} cy={cy} r="3.7" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5"/>
                <circle cx={cx} cy={cy} r="3.1" fill={fill} fillOpacity={fill === '#ffffff' ? 0.15 : 0.4}/>
                <ellipse cx={cx - 1} cy={cy - 1} rx="1.5" ry="0.9" fill="#ffffff" fillOpacity={0.8}/>
              </g>
            );
          })}
        </svg>
      );
    }
  }
];

export const BIO_CATEGORIES = [
  { id: 'molecules', label: '生体分子', labelEn: 'Biomolecules', icon: '🧬' },
  { id: 'cells', label: '細胞・組織', labelEn: 'Cells & Tissues', icon: '🧫' },
  { id: 'organisms', label: '器官・個体', labelEn: 'Organisms & Models', icon: '🐁' },
  { id: 'equipment', label: '実験器具', labelEn: 'Lab Equipment', icon: '🧪' },
  { id: 'custom', label: 'マイ素材', labelEn: 'My Assets', icon: '📁' }
] as const;

export const BIO_ASSET_EN_NAMES: Record<string, string> = {
  bio_dna: 'DNA Double Helix',
  bio_plasmid: 'Plasmid Circular DNA',
  bio_antibody: 'Antibody (IgG Y-shape)',
  bio_protein: 'Globular Protein / Enzyme',
  bio_phospholipid: 'Phospholipid (Monomer)',
  bio_atp: 'ATP / Nucleotide',
  bio_channel: 'Ion Channel / Membrane Pore',
  bio_receptor_monomer: 'Receptor Monomer (Variable Head)',
  bio_receptor_m_globular: 'Receptor: Globular Pocket',
  bio_receptor_m_ig: 'Receptor: Ig-like Domain',
  bio_receptor_m_fork: 'Receptor: Fork / Cysteine-rich',
  bio_receptor_m_lrr: 'Receptor: Crescent Cup / LRR',
  bio_receptor_m_propeller: 'Receptor: β-Propeller / Disc',
  bio_receptor_dimer: 'Receptor Dimer (Variable)',
  bio_receptor_homo: 'Receptor Homodimer',
  bio_receptor_hetero: 'Receptor Heterodimer',
  bio_gpcr: '7-TM Receptor (GPCR)',
  bio_atp_synthase: 'H+ ATPase (ATP Synthase)',
  bio_lipid_bilayer: 'Lipid Bilayer (Straight)',
  bio_lipid_bilayer_curve: 'Lipid Bilayer (S-Wave Curve)',
  bio_lipid_bilayer_arc: 'Lipid Bilayer (Curved Arc)',
  bio_lipid_bilayer_vesicle: 'Vesicle / Liposome (Bilayer)',
  bio_cell_animal: 'Animal Cell (with Organelles)',
  bio_cell_plant: 'Plant Cell (Wall, Vacuole, Chloroplast)',
  bio_bacteria: 'Bacterium / E. coli (Flagellated)',
  bio_virus: 'Virus (Spike Glycoproteins)',
  bio_neuron: 'Neuron (Nerve Cell)',
  bio_mouse: 'Lab Mouse (SVG Schematic)',
  bio_arabidopsis: 'Arabidopsis thaliana (SVG Schematic)',
  bio_brain: 'Brain',
  bio_wheat: 'Wheat / Triticum (SVG Schematic)',
  bio_mouse_realistic: 'Lab Mouse (Realistic TIFF/PNG)',
  bio_arabidopsis_realistic: 'Arabidopsis thaliana (Realistic TIFF/PNG)',
  bio_wheat_realistic: 'Wheat (Realistic TIFF/PNG)',
  bio_beaker_2d: 'Beaker (2D Schematic)',
  bio_beaker_3d: 'Beaker (3D Realistic)',
  bio_flask_2d: 'Erlenmeyer Flask (2D Schematic)',
  bio_flask_3d: 'Erlenmeyer Flask (3D Realistic)',
  bio_pipette: 'Micropipette',
  bio_tube_eppendorf: 'Microcentrifuge Tube (Eppendorf)',
  bio_petridish: 'Petri Dish (3D Agar & Colonies)',
  bio_plate_96: '96-Well Microplate (8×12 Uniform)'
};

export function getBioAssetName(asset: BioItemDef, isEn = false): string {
  if (isEn) {
    return asset.nameEn || BIO_ASSET_EN_NAMES[asset.type] || asset.name;
  }
  return asset.name;
}

