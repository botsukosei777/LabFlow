/**
 * Image Stitching & Object-Based Alignment / Tiling Map Generator Utility
 * Detects objects via thresholding & connected components, matches shapes,
 * groups connected images, and arranges independent groups on the canvas.
 */
import i18n from '../i18n';

export interface ObjectFeature {
  id: string;
  imageIndex: number;
  area: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  aspectRatio: number;
  circularity: number;
  meanIntensity: number;
}

export interface DetectionParams {
  thresholdMode: 'otsu' | 'manual';
  manualThreshold: number; // 0 - 255
  minArea: number;         // min pixel area
  maxAreaPercent: number;  // max % of image area (filter out giant background)
  invert: boolean;         // true: dark objects on light background, false: bright on dark
}

export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  thresholdMode: 'otsu',
  manualThreshold: 128,
  minArea: 20,
  maxAreaPercent: 40,
  invert: false,
};

export interface ImageGroup {
  id: string;
  name: string;
  color: string;
  imageIndices: number[];
}

export interface StitchImageItem {
  img: HTMLImageElement;
  name: string;
  idx?: number;
}

export interface ImagePlacement {
  imageIndex: number;
  originalIndex?: number;
  name: string;
  groupId: string;
  width: number;
  height: number;
  x: number;
  y: number;
  confidence: number;
}

export type BlendMode = 'feather' | 'max' | 'average';
export type ProgressCallback = (percent: number, message: string) => void;

export function getImageForPlacement(
  items: (HTMLImageElement | StitchImageItem | { img: HTMLImageElement; name: string; idx?: number })[],
  p: ImagePlacement
): HTMLImageElement | undefined {
  if (p.originalIndex !== undefined) {
    const found = items.find((it: any) => it && it.idx === p.originalIndex);
    if (found) return (found as any).img || (found as any);
  }
  const direct = items[p.imageIndex];
  if (!direct) return undefined;
  if ((direct as any).img) return (direct as any).img;
  if (direct instanceof HTMLImageElement) return direct;
  return undefined;
}

/** Yield to the browser's event loop so UI stays responsive */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Group visual colors
export const GROUP_COLORS = [
  '#6366F1', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#14B8A6', // Teal
];

/**
 * Downscale image to a normalized canvas and get 16-bit depth grayscale data (0 - 65535)
 */
export function createDownscaledGrayscale(
  img: HTMLImageElement,
  targetMaxDim: number = 420,
  invertColors: boolean = false
): { data: Float32Array; data16: Uint16Array; width: number; height: number; scale: number } {
  const origW = img.naturalWidth || img.width || 800;
  const origH = img.naturalHeight || img.height || 600;
  const scale = Math.min(1, targetMaxDim / Math.max(origW, origH));
  const w = Math.max(16, Math.round(origW * scale));
  const h = Math.max(16, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;

  // Convert to 16-bit depth (0 - 65535) for high precision thresholding & feature isolation
  const data16 = new Uint16Array(w * h);
  const gray = new Float32Array(w * h);

  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    // High-precision BT.709 luminance
    let g = 0.2126 * pixels[p] + 0.7152 * pixels[p + 1] + 0.0722 * pixels[p + 2];
    if (invertColors) g = 255 - g;

    // Store in normalized float and 16-bit integer (255 * 257.00392 = 65535)
    gray[i] = g;
    data16[i] = Math.min(65535, Math.max(0, Math.round(g * 257.00392)));
  }

  return { data: gray, data16, width: w, height: h, scale };
}

/**
 * Estimate if image has light background (brightfield) or dark background (fluorescence)
 * Returns true if light background, false if dark background
 */
export function estimateImageBackgroundPolarity(gray: Float32Array, w: number, h: number): boolean {
  // Sample perimeter pixels to determine background tone
  let edgeSum = 0;
  let edgeCount = 0;
  for (let x = 0; x < w; x++) {
    edgeSum += gray[x]; // top
    edgeSum += gray[(h - 1) * w + x]; // bottom
    edgeCount += 2;
  }
  for (let y = 1; y < h - 1; y++) {
    edgeSum += gray[y * w]; // left
    edgeSum += gray[y * w + (w - 1)]; // right
    edgeCount += 2;
  }
  const avgEdge = edgeSum / Math.max(1, edgeCount);
  return avgEdge > 120; // >120 is brightfield / light background
}

/**
 * Calculate Otsu's threshold on grayscale data
 */
export function calculateOtsuThreshold(gray: Float32Array): number {
  const histogram = new Int32Array(256);
  const total = gray.length;

  for (let i = 0; i < total; i++) {
    const v = Math.min(255, Math.max(0, Math.round(gray[i])));
    histogram[v]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Extract objects from image using 16-bit thresholding & connected components,
 * and aggressively subdivide large blobs into small sub-objects by local intensity peaks.
 */
export async function detectObjectsInImage(
  img: HTMLImageElement,
  imageIndex: number,
  params: DetectionParams
): Promise<ObjectFeature[]> {
  const ds = createDownscaledGrayscale(img, 420, params.invertImageColors);
  const { data: gray, data16, width: w, height: h, scale } = ds;
  const origScale = 1 / scale;

  let threshold8 = params.manualThreshold;
  if (params.thresholdMode === 'otsu') {
    threshold8 = calculateOtsuThreshold(gray);
  }

  // 16-bit threshold scale: threshold8 * 257 (0 to 65535)
  const threshold16 = Math.round(threshold8 * 257.00392);

  const binary = new Uint8Array(w * h);
  for (let i = 0; i < binary.length; i++) {
    const val = data16[i];
    const isFg = params.invert ? val < threshold16 : val >= threshold16;
    binary[i] = isFg ? 1 : 0;
  }

  const visited = new Uint8Array(w * h);
  const objects: ObjectFeature[] = [];
  const maxAllowedArea = Math.round(w * h * 0.85); // Filter giant screen-covering background
  const minAllowedArea = Math.max(1, Math.round(params.minArea * scale * scale * 0.4));

  const queueX = new Int32Array(w * h);
  const queueY = new Int32Array(w * h);

  let objCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (binary[idx] === 0 || visited[idx] === 1) continue;

      let qHead = 0;
      let qTail = 0;

      queueX[qTail] = x;
      queueY[qTail] = y;
      qTail++;
      visited[idx] = 1;

      // Track all pixels belonging to this connected component
      const componentPixels: number[] = [idx];

      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (qHead < qTail) {
        const cx = queueX[qHead];
        const cy = queueY[qHead];
        qHead++;

        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = ny * w + nx;
            if (binary[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queueX[qTail] = nx;
              queueY[qTail] = ny;
              qTail++;
              componentPixels.push(nIdx);
            }
          }
        }
      }

      if (area < minAllowedArea || area > maxAllowedArea) continue;

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;

      // ─── Subdivide large components into smaller sub-objects ───
      // If the component is large (e.g. area > 20 or dimensions > 12), find local 16-bit peaks to split it
      const shouldSplit = (area > 24 || bw > 14 || bh > 14);

      if (shouldSplit) {
        // Find local intensity peaks within this component in 16-bit space
        const peaks: { px: number; py: number; val: number }[] = [];

        for (const pIdx of componentPixels) {
          const px = pIdx % w;
          const py = Math.floor(pIdx / w);
          const val = data16[pIdx];

          // Check if local maximum in 3x3 window
          let isMax = true;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const npx = px + dx;
              const npy = py + dy;
              if (npx >= 0 && npx < w && npy >= 0 && npy < h) {
                const nIdx = npy * w + npx;
                if (binary[nIdx] === 1 && data16[nIdx] > val) {
                  isMax = false;
                  break;
                }
              }
            }
            if (!isMax) break;
          }

          if (isMax) {
            // Keep minimum distance between peaks to prevent over-clustering
            const tooClose = peaks.some(pk => Math.hypot(pk.px - px, pk.py - py) < 5);
            if (!tooClose) {
              peaks.push({ px, py, val });
            }
          }
        }

        // If multiple peaks found, split pixels by nearest peak (Voronoi/Watershed subdivision)
        if (peaks.length > 1) {
          const subGroups: { [peakIdx: number]: number[] } = {};
          for (let k = 0; k < peaks.length; k++) subGroups[k] = [];

          for (const pIdx of componentPixels) {
            const px = pIdx % w;
            const py = Math.floor(pIdx / w);
            let bestDist = Infinity;
            let bestK = 0;
            for (let k = 0; k < peaks.length; k++) {
              const d = Math.hypot(px - peaks[k].px, py - peaks[k].py);
              if (d < bestDist) {
                bestDist = d;
                bestK = k;
              }
            }
            subGroups[bestK].push(pIdx);
          }

          // Register each small sub-object
          for (let k = 0; k < peaks.length; k++) {
            const subPixels = subGroups[k];
            if (!subPixels || subPixels.length < Math.max(1, minAllowedArea * 0.5)) continue;

            let sSumX = 0, sSumY = 0, sMinX = w, sMaxX = 0, sMinY = h, sMaxY = 0;
            let sIntensitySum = 0;

            for (const sp of subPixels) {
              const sx = sp % w;
              const sy = Math.floor(sp / w);
              sSumX += sx;
              sSumY += sy;
              sMinX = Math.min(sMinX, sx);
              sMaxX = Math.max(sMaxX, sx);
              sMinY = Math.min(sMinY, sy);
              sMaxY = Math.max(sMaxY, sy);
              sIntensitySum += data16[sp];
            }

            const subArea = subPixels.length;
            const sbw = sMaxX - sMinX + 1;
            const sbh = sMaxY - sMinY + 1;
            objCount++;

            objects.push({
              id: `img${imageIndex}_obj${objCount}`,
              imageIndex,
              area: Math.round(subArea * origScale * origScale),
              cx: (sSumX / subArea) * origScale,
              cy: (sSumY / subArea) * origScale,
              minX: sMinX * origScale,
              minY: sMinY * origScale,
              maxX: sMaxX * origScale,
              maxY: sMaxY * origScale,
              width: sbw * origScale,
              height: sbh * origScale,
              aspectRatio: sbw / Math.max(1, sbh),
              circularity: 1.0,
              meanIntensity: (sIntensitySum / subArea) / 257.0,
            });
          }
          continue;
        }
      }

      // Standard registration for smaller/single-peak objects
      let sumX = 0, sumY = 0, intensitySum = 0;
      for (const pIdx of componentPixels) {
        sumX += (pIdx % w);
        sumY += Math.floor(pIdx / w);
        intensitySum += data16[pIdx];
      }

      objCount++;
      objects.push({
        id: `img${imageIndex}_obj${objCount}`,
        imageIndex,
        area: Math.round(area * origScale * origScale),
        cx: (sumX / area) * origScale,
        cy: (sumY / area) * origScale,
        minX: minX * origScale,
        minY: minY * origScale,
        maxX: maxX * origScale,
        maxY: maxY * origScale,
        width: bw * origScale,
        height: bh * origScale,
        aspectRatio: bw / Math.max(1, bh),
        circularity: 1.0,
        meanIntensity: (intensitySum / area) / 257.0,
      });
    }
  }

  return objects;
}

export interface DetailedDetectionResult {
  objects: ObjectFeature[];
  threshold: number;
  maskWidth: number;
  maskHeight: number;
  binaryMask: Uint8Array;
  estimatedInvert: boolean;
}

export async function detectObjectsWithMask(
  img: HTMLImageElement,
  imageIndex: number,
  params: DetectionParams
): Promise<DetailedDetectionResult> {
  const ds = createDownscaledGrayscale(img, 384, params.invertImageColors);
  const { data: gray, width: w, height: h } = ds;
  const estimatedInvert = estimateImageBackgroundPolarity(gray, w, h);

  let threshold = params.manualThreshold;
  if (params.thresholdMode === 'otsu') {
    threshold = calculateOtsuThreshold(gray);
  }

  const binary = new Uint8Array(w * h);
  for (let i = 0; i < binary.length; i++) {
    const val = gray[i];
    const isFg = params.invert ? val < threshold : val >= threshold;
    binary[i] = isFg ? 1 : 0;
  }

  const objects = await detectObjectsInImage(img, imageIndex, params);
  return {
    objects,
    threshold,
    maskWidth: w,
    maskHeight: h,
    binaryMask: binary,
    estimatedInvert,
  };
}

export function matchObjectsPair(
  objs1: ObjectFeature[],
  objs2: ObjectFeature[],
  imgW: number,
  imgH: number
): { dx: number; dy: number; score: number; inliersCount: number } {
  if (objs1.length === 0 || objs2.length === 0) {
    return { dx: 0, dy: 0, score: 0, inliersCount: 0 };
  }

  const candidateMatches = [];

  for (const o1 of objs1) {
    for (const o2 of objs2) {
      const areaRatio = Math.min(o1.area, o2.area) / Math.max(o1.area, o2.area);
      const aspectDiff = Math.abs(o1.aspectRatio - o2.aspectRatio);
      const circDiff = Math.abs(o1.circularity - o2.circularity);

      if (areaRatio > 0.55 && aspectDiff < 0.45 && circDiff < 0.35) {
        const dx = Math.round(o1.cx - o2.cx);
        const dy = Math.round(o1.cy - o2.cy);

        if (Math.abs(dx) < imgW * 0.95 && Math.abs(dy) < imgH * 0.95) {
          candidateMatches.push({ o1, o2, dx, dy });
        }
      }
    }
  }

  if (candidateMatches.length === 0) {
    return { dx: 0, dy: 0, score: 0, inliersCount: 0 };
  }

  const tol = Math.max(25, Math.round(Math.min(imgW, imgH) * 0.05));
  let bestCount = 0;
  let bestDx = 0;
  let bestDy = 0;

  for (let i = 0; i < candidateMatches.length; i++) {
    const target = candidateMatches[i];
    let count = 0;
    let sumDx = 0;
    let sumDy = 0;

    for (let j = 0; j < candidateMatches.length; j++) {
      const other = candidateMatches[j];
      const dist = Math.hypot(target.dx - other.dx, target.dy - other.dy);
      if (dist <= tol) {
        count++;
        sumDx += other.dx;
        sumDy += other.dy;
      }
    }

    if (count > bestCount) {
      bestCount = count;
      bestDx = Math.round(sumDx / count);
      bestDy = Math.round(sumDy / count);
    }
  }

  const minObjs = Math.min(objs1.length, objs2.length);
  const score = Math.min(1.0, bestCount / Math.max(2, Math.min(8, minObjs)));

  return {
    dx: bestDx,
    dy: bestDy,
    score,
    inliersCount: bestCount,
  };
}

export function buildConnectedGroups(
  imageCount: number,
  edges: { i: number; j: number; dx: number; dy: number; score: number }[]
): {
  groups: { id: string; name: string; imageIndices: number[] }[];
  relativeOffsets: Map<string, { dx: number; dy: number }>;
} {
  const adj = new Map();
  for (let i = 0; i < imageCount; i++) adj.set(i, []);

  for (const edge of edges) {
    adj.get(edge.i).push({ neighbor: edge.j, dx: edge.dx, dy: edge.dy, score: edge.score });
    adj.get(edge.j).push({ neighbor: edge.i, dx: -edge.dx, dy: -edge.dy, score: edge.score });
  }

  const visited = new Set();
  const groups = [];
  const relativeOffsets = new Map();

  let groupCounter = 1;

  for (let i = 0; i < imageCount; i++) {
    if (visited.has(i)) continue;

    const groupIndices = [];
    const queue = [i];
    visited.add(i);

    relativeOffsets.set(`node_${i}`, { dx: 0, dy: 0 });

    while (queue.length > 0) {
      const curr = queue.shift();
      groupIndices.push(curr);
      const currPos = relativeOffsets.get(`node_${curr}`);

      for (const edge of adj.get(curr) || []) {
        if (!visited.has(edge.neighbor)) {
          visited.add(edge.neighbor);
          relativeOffsets.set(`node_${edge.neighbor}`, {
            dx: currPos.dx + edge.dx,
            dy: currPos.dy + edge.dy,
          });
          queue.push(edge.neighbor);
        }
      }
    }

    groups.push({
      id: `group_${groupCounter}`,
      name: i18n.t('analysis.imageProcessor.groupName', { counter: groupCounter, count: groupIndices.length, defaultValue: `画像群 ${groupCounter} (${groupIndices.length}枚)` }),
      imageIndices: groupIndices,
    });
    groupCounter++;
  }

  return { groups, relativeOffsets };
}

export async function analyzeObjectsAndGroupImages(
  images: { img: HTMLImageElement; name: string }[],
  params: DetectionParams = DEFAULT_DETECTION_PARAMS,
  onProgress?: ProgressCallback
): Promise<{
  groups: ImageGroup[];
  detectedFeatures: Map<number, ObjectFeature[]>;
  placements: ImagePlacement[];
}> {
  const count = images.length;
  if (count === 0) {
    return { groups: [], detectedFeatures: new Map(), placements: [] };
  }

  const featuresMap = new Map();
  for (let i = 0; i < count; i++) {
    const pct = Math.round((i / count) * 40);
    onProgress?.(pct, i18n.t('analysis.imageProcessor.stitchingProgressDetect', { current: i + 1, total: count, defaultValue: `画像 ${i + 1}/${count} の物体(オブジェクト)を検出中...` }));
    await yieldToUI();

    const objs = await detectObjectsInImage(images[i].img, i, params);
    featuresMap.set(i, objs);
  }

  const edges = [];
  const totalPairs = (count * (count - 1)) / 2;
  let pairIdx = 0;

  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      pairIdx++;
      const pct = 40 + Math.round((pairIdx / Math.max(1, totalPairs)) * 40);
      onProgress?.(pct, i18n.t('analysis.imageProcessor.stitchingProgressMatching', { img1: i + 1, img2: j + 1, defaultValue: `画像ペア (${i + 1} ↔ ${j + 1}) の物体形状マッチング中...` }));
      await yieldToUI();

      const objs1 = featuresMap.get(i) || [];
      const objs2 = featuresMap.get(j) || [];

      const match = matchObjectsPair(
        objs1,
        objs2,
        images[i].img.naturalWidth || 500,
        images[i].img.naturalHeight || 500
      );

      if (match.inliersCount >= 2 && match.score >= 0.3) {
        edges.push({
          i,
          j,
          dx: match.dx,
          dy: match.dy,
          score: match.score,
        });
      }
    }
  }

  onProgress?.(85, i18n.t('analysis.imageProcessor.stitchingProgressGrouping', '画像群(グループ)を編成・配置計算中...'));
  await yieldToUI();

  const { groups: rawGroups, relativeOffsets } = buildConnectedGroups(count, edges);

  const formattedGroups: ImageGroup[] = rawGroups.map((g, idx) => ({
    id: g.id,
    name: g.name,
    color: GROUP_COLORS[idx % GROUP_COLORS.length],
    imageIndices: g.imageIndices,
  }));

  const placements = calculatePlacementsFromGroups(images, formattedGroups, relativeOffsets);

  onProgress?.(100, i18n.t('analysis.imageProcessor.stitchingProgressAnalysisDone', '解析完了'));
  return {
    groups: formattedGroups,
    detectedFeatures: featuresMap,
    placements,
  };
}

export function calculatePlacementsFromGroups(
  images: (HTMLImageElement | StitchImageItem | { img: HTMLImageElement; name: string; idx?: number })[],
  groups: ImageGroup[],
  offsetsMap?: Map<string, { dx: number; dy: number }>
): ImagePlacement[] {
  const placements: ImagePlacement[] = [];
  const GROUP_MARGIN = 60;

  // Step 1: Calculate local normalized coordinates and dimensions for each group
  interface GroupLayoutInfo {
    group: ImageGroup;
    placements: ImagePlacement[];
    width: number;
    height: number;
  }

  const processedGroups: GroupLayoutInfo[] = [];

  for (const group of groups) {
    const groupPlacements: ImagePlacement[] = [];

    for (let idxInGroup = 0; idxInGroup < group.imageIndices.length; idxInGroup++) {
      const origIdx = group.imageIndices[idxInGroup];
      let localIdx = images.findIndex((it: any) => it && it.idx === origIdx);
      if (localIdx === -1) localIdx = Math.min(origIdx, images.length - 1);
      const item: any = images[localIdx] || images[idxInGroup];

      const img = item?.img || (item instanceof HTMLImageElement ? item : undefined);
      const w = img?.naturalWidth || img?.width || 800;
      const h = img?.naturalHeight || img?.height || 600;

      let localX = 0;
      let localY = 0;

      if (offsetsMap && (offsetsMap.has(`node_${localIdx}`) || offsetsMap.has(`node_${origIdx}`))) {
        const off = offsetsMap.get(`node_${localIdx}`) || offsetsMap.get(`node_${origIdx}`)!;
        localX = off.dx;
        localY = off.dy;
      } else {
        // Wrap images within an unaligned group into a neat sub-grid
        const colsInGroup = Math.ceil(Math.sqrt(group.imageIndices.length));
        localX = (idxInGroup % colsInGroup) * Math.round(w * 0.85);
        localY = Math.floor(idxInGroup / colsInGroup) * Math.round(h * 0.85);
      }

      groupPlacements.push({
        imageIndex: localIdx >= 0 ? localIdx : idxInGroup,
        originalIndex: origIdx,
        name: item?.name || `Image #${origIdx + 1}`,
        groupId: group.id,
        width: w,
        height: h,
        x: localX,
        y: localY,
        confidence: 1.0,
      });
    }

    if (groupPlacements.length > 0) {
      const minX = Math.min(...groupPlacements.map((p) => p.x));
      const minY = Math.min(...groupPlacements.map((p) => p.y));
      let gMaxX = 0;
      let gMaxY = 0;

      for (const p of groupPlacements) {
        p.x = p.x - minX;
        p.y = p.y - minY;
        gMaxX = Math.max(gMaxX, p.x + p.width);
        gMaxY = Math.max(gMaxY, p.y + p.height);
      }

      processedGroups.push({
        group,
        placements: groupPlacements,
        width: gMaxX,
        height: gMaxY,
      });
    }
  }

  // Step 2: 2D Grid Packing for Groups
  // (Prevents long horizontal single-row stretch by wrapping groups vertically as well)
  const numGroups = processedGroups.length;
  // Compute balanced column count (e.g. 2 cols for 3-4 groups, 3 cols for 5-9 groups)
  const maxCols = Math.max(1, Math.ceil(Math.sqrt(numGroups * 1.35)));

  let curX = 0;
  let curY = 0;
  let rowMaxHeight = 0;
  let colIndex = 0;

  for (const gInfo of processedGroups) {
    if (colIndex >= maxCols && colIndex > 0) {
      curX = 0;
      curY += rowMaxHeight + GROUP_MARGIN;
      rowMaxHeight = 0;
      colIndex = 0;
    }

    for (const p of gInfo.placements) {
      p.x += curX;
      p.y += curY;
    }

    placements.push(...gInfo.placements);

    curX += gInfo.width + GROUP_MARGIN;
    rowMaxHeight = Math.max(rowMaxHeight, gInfo.height);
    colIndex++;
  }

  return normalizePlacements(placements);
}

export async function calculateGridPlacements(
  images: { img: HTMLImageElement; name: string }[],
  columns: number,
  rows: number,
  overlapRatio: number = 0.15,
  autoRefine: boolean = true,
  onProgress?: ProgressCallback
): Promise<ImagePlacement[]> {
  const count = Math.min(images.length, columns * rows);
  const placements: ImagePlacement[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const item = images[i];
    const w = item.img.naturalWidth;
    const h = item.img.naturalHeight;
    const stepX = Math.round(w * (1 - overlapRatio));
    const stepY = Math.round(h * (1 - overlapRatio));

    placements.push({
      imageIndex: i,
      name: item.name,
      groupId: 'grid_group',
      width: w,
      height: h,
      x: col * stepX,
      y: row * stepY,
      confidence: 1.0,
    });
  }

  onProgress?.(100, i18n.t('analysis.imageProcessor.stitchingProgressGridDone', 'グリッド配置完了'));
  return normalizePlacements(placements);
}

export function normalizePlacements(placements: ImagePlacement[]): ImagePlacement[] {
  if (placements.length === 0) return [];
  const minX = Math.min(...placements.map((p) => p.x));
  const minY = Math.min(...placements.map((p) => p.y));
  return placements.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
}

export async function renderStitchedCanvas(
  images: { img: HTMLImageElement; name: string }[],
  placements: ImagePlacement[],
  blendMode: BlendMode = 'feather',
  onProgress?: ProgressCallback
): Promise<HTMLCanvasElement> {
  const norm = normalizePlacements(placements);
  let totalW = 0;
  let totalH = 0;
  norm.forEach((p) => {
    totalW = Math.max(totalW, p.x + p.width);
    totalH = Math.max(totalH, p.y + p.height);
  });

  const MAX_PIXELS = 100_000_000;
  if (totalW * totalH > MAX_PIXELS) {
    const ratio = Math.sqrt(MAX_PIXELS / (totalW * totalH));
    totalW = Math.round(totalW * ratio);
    totalH = Math.round(totalH * ratio);
    norm.forEach((p) => {
      p.x = Math.round(p.x * ratio);
      p.y = Math.round(p.y * ratio);
      p.width = Math.round(p.width * ratio);
      p.height = Math.round(p.height * ratio);
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(10, totalW);
  canvas.height = Math.max(10, totalH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');

  if (blendMode === 'max') {
    const mergedData = ctx.createImageData(totalW, totalH);
    const mPix = mergedData.data;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = totalW;
    tempCanvas.height = totalH;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) throw new Error('Temp context failed');

    for (let pi = 0; pi < norm.length; pi++) {
      const p = norm[pi];
      onProgress?.(
        Math.round(((pi + 0.5) / norm.length) * 100),
        i18n.t('analysis.imageProcessor.stitchingProgressBlendingMax', { current: pi + 1, total: norm.length, defaultValue: `画像 ${pi + 1}/${norm.length} を最大輝度合成中...` })
      );
      await yieldToUI();
      const img = getImageForPlacement(images, p);
      if (!img) continue;
      tempCtx.clearRect(0, 0, totalW, totalH);
      tempCtx.drawImage(img, p.x, p.y, p.width, p.height);
      const imgData = tempCtx.getImageData(p.x, p.y, p.width, p.height);
      const sPix = imgData.data;
      for (let ly = 0; ly < p.height; ly++) {
        const gRow = (p.y + ly) * totalW;
        const lRow = ly * p.width;
        for (let lx = 0; lx < p.width; lx++) {
          const gIdx = (gRow + p.x + lx) * 4;
          const lIdx = (lRow + lx) * 4;
          if (sPix[lIdx + 3] > 0) {
            if (sPix[lIdx] > mPix[gIdx]) mPix[gIdx] = sPix[lIdx];
            if (sPix[lIdx + 1] > mPix[gIdx + 1]) mPix[gIdx + 1] = sPix[lIdx + 1];
            if (sPix[lIdx + 2] > mPix[gIdx + 2]) mPix[gIdx + 2] = sPix[lIdx + 2];
            mPix[gIdx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(mergedData, 0, 0);
  } else if (blendMode === 'feather') {
    const accumR = new Float32Array(totalW * totalH);
    const accumG = new Float32Array(totalW * totalH);
    const accumB = new Float32Array(totalW * totalH);
    const accumWt = new Float32Array(totalW * totalH);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = totalW;
    tempCanvas.height = totalH;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) throw new Error('Temp context failed');

    for (let pi = 0; pi < norm.length; pi++) {
      const p = norm[pi];
      onProgress?.(
        Math.round(((pi + 0.5) / norm.length) * 100),
        i18n.t('analysis.imageProcessor.stitchingProgressBlendingFeather', { current: pi + 1, total: norm.length, defaultValue: `画像 ${pi + 1}/${norm.length} をフェザーブレンド中...` })
      );
      await yieldToUI();
      const img = getImageForPlacement(images, p);
      if (!img) continue;
      tempCtx.clearRect(0, 0, totalW, totalH);
      tempCtx.drawImage(img, p.x, p.y, p.width, p.height);
      const imgData = tempCtx.getImageData(p.x, p.y, p.width, p.height);
      const sPix = imgData.data;
      const halfW = p.width / 2;
      const halfH = p.height / 2;
      for (let ly = 0; ly < p.height; ly++) {
        const gRow = (p.y + ly) * totalW;
        const lRow = ly * p.width;
        const distY = 1 - Math.abs(ly - halfH) / halfH;
        for (let lx = 0; lx < p.width; lx++) {
          const gIdx = gRow + p.x + lx;
          const lIdx = (lRow + lx) * 4;
          const sa = sPix[lIdx + 3] / 255;
          if (sa > 0.05) {
            const distX = 1 - Math.abs(lx - halfW) / halfW;
            const wt = Math.max(
              0.001,
              Math.sin((distX * Math.PI) / 2) * Math.sin((distY * Math.PI) / 2) * sa
            );
            accumR[gIdx] += sPix[lIdx] * wt;
            accumG[gIdx] += sPix[lIdx + 1] * wt;
            accumB[gIdx] += sPix[lIdx + 2] * wt;
            accumWt[gIdx] += wt;
          }
        }
      }
    }
    onProgress?.(95, i18n.t('analysis.imageProcessor.stitchingProgressFinalizing', '最終合成中...'));
    await yieldToUI();
    const outData = ctx.createImageData(totalW, totalH);
    const oPix = outData.data;
    for (let i = 0; i < totalW * totalH; i++) {
      const w = accumWt[i];
      const idx = i * 4;
      if (w > 0) {
        oPix[idx] = Math.min(255, Math.round(accumR[i] / w));
        oPix[idx + 1] = Math.min(255, Math.round(accumG[i] / w));
        oPix[idx + 2] = Math.min(255, Math.round(accumB[i] / w));
        oPix[idx + 3] = 255;
      }
    }
    ctx.putImageData(outData, 0, 0);
  } else {
    for (let pi = 0; pi < norm.length; pi++) {
      const p = norm[pi];
      onProgress?.(
        Math.round(((pi + 0.5) / norm.length) * 100),
        i18n.t('analysis.imageProcessor.stitchingProgressPlacing', { current: pi + 1, total: norm.length, defaultValue: `画像 ${pi + 1}/${norm.length} を配置中...` })
      );
      await yieldToUI();
      const img = getImageForPlacement(images, p);
      if (img) {
        ctx.drawImage(img, p.x, p.y, p.width, p.height);
      }
    }
  }

  onProgress?.(100, i18n.t('analysis.imageProcessor.stitchingProgressDone', '合成完了'));
  return canvas;
}
