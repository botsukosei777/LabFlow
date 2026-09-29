import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import pptxgen from 'pptxgenjs';
import {
  Type,
  Square,
  Circle,
  Triangle,
  ArrowRight,
  ArrowLeftRight,
  Minus,
  Spline,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Superscript,
  Subscript,
  Image as ImageIcon,
  Download,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Layers,
  Palette,
  Dna,
  FlaskConical,
  Pipette,
  Check,
  Undo2,
  Redo2,
  X,
  Search,
  Sparkles,
  MousePointer,
  PenTool,
  Save,
  RotateCcw,
  Upload,
  FolderInput,
  BookmarkPlus,
  FileDown,
  Boxes,
  Box,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Maximize
} from 'lucide-react';
import {
  BIO_ASSETS,
  BIO_CATEGORIES,
  BioCategory,
  BioItemDef,
  generateLipidBilayerSvg,
  RECEPTOR_HEAD_TYPES,
  getMonomerReceptorSvg,
  getDimerReceptorSvg,
  getBioAssetName
} from './bioIcons';
import {
  Point,
  pointsToSmoothSvgPath,
  calculateTwoPointCurve,
  generateTwoPointCurveSvg,
  generateFreehandSvg
} from './curveUtils';

// Canvas standard dimensions (16:9 aspect ratio)
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

export type ElementType =
  | 'text'
  | 'rect'
  | 'rounded_rect'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'arrow_right'
  | 'arrow_double'
  | 'line'
  | 'curve'
  | 'freehand'
  | 'image'
  | 'group'
  | string; // Any bio_* asset id

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Group properties
  elements?: SlideElement[];
  origWidth?: number;
  origHeight?: number;
  groupName?: string;
  // Text properties
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  // Shape & Bio properties
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  // Curve properties
  curveStyle?: 'arc' | 's_curve' | 'arrow_arc';
  startPoint?: Point;
  endPoint?: Point;
  // Freehand points
  points?: Point[];
  // Image properties
  src?: string;
  // Membrane properties
  membraneStyle?: 'straight' | 'wave' | 'arc' | 'vesicle';
  curvature?: number;
  // Receptor properties
  receptorHeadA?: 1 | 2 | 3 | 4 | 5;
  receptorHeadB?: 1 | 2 | 3 | 4 | 5;
}

export interface Slide {
  id: string;
  background: string;
  elements: SlideElement[];
}

// Available fonts for text boxes
export const FONT_OPTIONS = [
  { id: 'Arial', label: 'Arial', cssFamily: 'Arial, sans-serif', pptxName: 'Arial' },
  { id: 'Calibri', label: 'Calibri', cssFamily: 'Calibri, sans-serif', pptxName: 'Calibri' },
  { id: 'Meiryo', label: 'メイリオ (Meiryo)', cssFamily: "'Meiryo', 'メイリオ', sans-serif", pptxName: 'Meiryo' },
  { id: 'BIZ UDPGothic', label: 'BIZ UDPゴシック', cssFamily: "'BIZ UDPGothic', 'BIZ UDP Gothic', sans-serif", pptxName: 'BIZ UDPGothic' },
  { id: 'Yu Gothic', label: '游ゴシック (Yu Gothic)', cssFamily: "'Yu Gothic', '游ゴシック', sans-serif", pptxName: 'Yu Gothic' },
  { id: 'Times New Roman', label: 'Times New Roman', cssFamily: "'Times New Roman', serif", pptxName: 'Times New Roman' }
];

// Helper to render formatted text with superscript (<sup>...</sup>) and subscript (<sub>...</sub>)
function renderFormattedText(rawText: string) {
  if (!rawText) return null;
  const parts = rawText.split(/(<sub>[\s\S]*?<\/sub>|<sup>[\s\S]*?<\/sup>)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('<sup>') && part.endsWith('</sup>')) {
          return (
            <sup key={idx} style={{ fontSize: '0.68em', verticalAlign: 'super', lineHeight: 0 }}>
              {part.slice(5, -6)}
            </sup>
          );
        }
        if (part.startsWith('<sub>') && part.endsWith('</sub>')) {
          return (
            <sub key={idx} style={{ fontSize: '0.68em', verticalAlign: 'sub', lineHeight: 0 }}>
              {part.slice(5, -6)}
            </sub>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

// Helper to parse text into PPTXgenJS formatted text chunks
function parsePptxTextChunks(
  rawText: string,
  baseOpts: {
    fontSize: number;
    color: string;
    fontFace: string;
    bold: boolean;
    italic: boolean;
    underline?: { style: 'sng' };
  }
) {
  const parts = (rawText || '').split(/(<sub>[\s\S]*?<\/sub>|<sup>[\s\S]*?<\/sup>)/g);
  const chunks: Array<{ text: string; options: any }> = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<sup>') && part.endsWith('</sup>')) {
      chunks.push({
        text: part.slice(5, -6),
        options: {
          ...baseOpts,
          superscript: true
        }
      });
    } else if (part.startsWith('<sub>') && part.endsWith('</sub>')) {
      chunks.push({
        text: part.slice(5, -6),
        options: {
          ...baseOpts,
          subscript: true
        }
      });
    } else {
      chunks.push({
        text: part,
        options: {
          ...baseOpts
        }
      });
    }
  }

  if (chunks.length === 0) {
    chunks.push({ text: '', options: baseOpts });
  }

  return chunks;
}

// Helper to generate crisp SVG markup for curves (arc, s_curve, arrow_arc)
export function generateCurveSvg(
  w: number,
  h: number,
  stroke = '#2563eb',
  strokeWidth = 3,
  curveStyle: 'arc' | 's_curve' | 'arrow_arc' = 'arc',
  curvature = 40,
  id = 'curve',
  p1?: Point,
  p2?: Point
) {
  const pad = 12;
  const start: Point = p1 || { x: pad, y: h / 2 };
  const end: Point = p2 || { x: Math.max(pad + 10, w - pad), y: h / 2 };

  const { pathD } = calculateTwoPointCurve(start, end, curvature, curveStyle);
  const markerId = `arrowhead-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hasArrow = curveStyle === 'arrow_arc';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
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

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function stripHtmlTags(str: string): string {
  return (str || '').replace(/<[^>]*>/g, '');
}

export function getElementSvgString(
  el: SlideElement,
  isRoot = true,
  customAssets: BioItemDef[] = []
): string {
  const w = el.width || 100;
  const h = el.height || 100;
  let innerMarkup = '';

  if (el.type === 'text') {
    const raw = el.text || '';
    const cleanText = stripHtmlTags(raw);
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const textX = el.align === 'center' ? w / 2 : el.align === 'right' ? w - 4 : 4;
    const textY = h / 2;
    const fontFam = el.fontFamily ? el.fontFamily.replace(/"/g, "'") : 'Arial, sans-serif';
    innerMarkup = `
      <text
        x="${textX}"
        y="${textY}"
        fill="${el.color || '#000000'}"
        font-family="${escapeXml(fontFam)}"
        font-size="${el.fontSize || 18}"
        font-weight="${el.bold ? 'bold' : 'normal'}"
        font-style="${el.italic ? 'italic' : 'normal'}"
        text-decoration="${el.underline ? 'underline' : 'none'}"
        text-anchor="${anchor}"
        dominant-baseline="middle"
      >${escapeXml(cleanText)}</text>
    `;
  } else if (el.type === 'rect') {
    innerMarkup = `
      <rect
        x="0"
        y="0"
        width="${w}"
        height="${h}"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${el.strokeWidth ?? 1}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'rounded_rect') {
    innerMarkup = `
      <rect
        x="0"
        y="0"
        width="${w}"
        height="${h}"
        rx="12"
        ry="12"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${el.strokeWidth ?? 1}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'circle') {
    const sw = el.strokeWidth ?? 1;
    innerMarkup = `
      <ellipse
        cx="${w / 2}"
        cy="${h / 2}"
        rx="${Math.max(1, w / 2 - sw / 2)}"
        ry="${Math.max(1, h / 2 - sw / 2)}"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${sw}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'triangle') {
    const sw = el.strokeWidth ?? 1;
    innerMarkup = `
      <polygon
        points="${w / 2},${sw / 2} ${w - sw / 2},${h - sw / 2} ${sw / 2},${h - sw / 2}"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${sw}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'diamond') {
    const sw = el.strokeWidth ?? 1;
    innerMarkup = `
      <polygon
        points="${w / 2},${sw / 2} ${w - sw / 2},${h / 2} ${w / 2},${h - sw / 2} ${sw / 2},${h / 2}"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${sw}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'star') {
    innerMarkup = `
      <polygon
        points="${w * 0.5},${h * 0.05} ${w * 0.62},${h * 0.38} ${w * 0.98},${h * 0.38} ${w * 0.68},${h * 0.58} ${w * 0.79},${h * 0.92} ${w * 0.5},${h * 0.72} ${w * 0.21},${h * 0.92} ${w * 0.32},${h * 0.58} ${w * 0.02},${h * 0.38} ${w * 0.38},${h * 0.38}"
        fill="${el.fill || '#eab308'}"
        stroke="${el.stroke || '#ca8a04'}"
        stroke-width="${el.strokeWidth ?? 1}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'arrow_right') {
    innerMarkup = `
      <path
        d="M 0 ${h * 0.35} L ${w * 0.65} ${h * 0.35} L ${w * 0.65} ${h * 0.15} L ${w} ${h * 0.5} L ${w * 0.65} ${h * 0.85} L ${w * 0.65} ${h * 0.65} L 0 ${h * 0.65} Z"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${el.strokeWidth ?? 1}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'arrow_double') {
    innerMarkup = `
      <path
        d="M ${w * 0.35} ${h * 0.15} L 0 ${h * 0.5} L ${w * 0.35} ${h * 0.85} L ${w * 0.35} ${h * 0.65} L ${w * 0.65} ${h * 0.65} L ${w * 0.65} ${h * 0.85} L ${w} ${h * 0.5} L ${w * 0.65} ${h * 0.15} L ${w * 0.65} ${h * 0.35} L ${w * 0.35} ${h * 0.35} Z"
        fill="${el.fill || '#3b82f6'}"
        stroke="${el.stroke || '#1d4ed8'}"
        stroke-width="${el.strokeWidth ?? 1}"
        opacity="${el.opacity ?? 1}"
      />
    `;
  } else if (el.type === 'line') {
    innerMarkup = `
      <line
        x1="0"
        y1="${h / 2}"
        x2="${w}"
        y2="${h / 2}"
        stroke="${el.stroke || '#000000'}"
        stroke-width="${el.strokeWidth ?? 2}"
      />
    `;
  } else if (el.type === 'curve') {
    const rawCurve = generateCurveSvg(
      w,
      h,
      el.stroke || '#2563eb',
      el.strokeWidth || 3,
      el.curveStyle || 'arc',
      el.curvature ?? 40,
      el.id,
      el.startPoint,
      el.endPoint
    );
    innerMarkup = rawCurve.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
  } else if (el.type === 'freehand') {
    const rawFh = generateFreehandSvg(
      el.points || [],
      el.stroke || '#2563eb',
      el.strokeWidth || 3,
      el.id
    );
    innerMarkup = rawFh.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
  } else if (el.type === 'image') {
    innerMarkup = `
      <image
        href="${el.src || ''}"
        x="0"
        y="0"
        width="${w}"
        height="${h}"
        preserveAspectRatio="xMidYMid meet"
      />
    `;
  } else if (el.type === 'group' && el.elements) {
    const origW = el.origWidth || el.width || 1;
    const origH = el.origHeight || el.height || 1;
    const scaleX = w / origW;
    const scaleY = h / origH;
    const childrenMarkup = el.elements.map(child => {
      const childSvg = getElementSvgString(child, false, customAssets);
      return `<g transform="translate(${child.x * scaleX}, ${child.y * scaleY}) scale(${scaleX}, ${scaleY})">${childSvg}</g>`;
    }).join('\n');
    innerMarkup = `<g id="group-${el.id}">${childrenMarkup}</g>`;
  } else if (el.type.startsWith('bio_lipid_bilayer')) {
    const style = el.membraneStyle || (el.type.includes('curve') ? 'wave' : el.type.includes('arc') ? 'arc' : el.type.includes('vesicle') ? 'vesicle' : 'straight');
    const rawMb = generateLipidBilayerSvg(w, h, el.fill || '#ef4444', el.stroke || '#f59e0b', style, el.curvature ?? 35);
    innerMarkup = rawMb.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
  } else if (el.type === 'bio_receptor_monomer' || el.type.startsWith('bio_receptor_m')) {
    const rawRc = getMonomerReceptorSvg(el.fill || '#6366f1', el.stroke || '#4338ca', el.receptorHeadA || 1, w, h);
    innerMarkup = rawRc.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
  } else if (el.type === 'bio_receptor_dimer' || el.type === 'bio_receptor_homo' || el.type === 'bio_receptor_hetero') {
    const rawDm = getDimerReceptorSvg(el.fill || '#6366f1', el.stroke || '#4338ca', el.receptorHeadA || 1, el.receptorHeadB || (el.type === 'bio_receptor_hetero' ? 3 : 1), w, h);
    innerMarkup = rawDm.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
  } else {
    const bioDef = [...BIO_ASSETS, ...customAssets].find(a => a.type === el.type);
    if (bioDef) {
      if (bioDef.svgData) {
        innerMarkup = bioDef.svgData.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
      } else if (bioDef.getSvgString) {
        const rawDef = bioDef.getSvgString(el.fill || bioDef.defaultFill, el.stroke || bioDef.defaultStroke, w, h);
        innerMarkup = rawDef.replace(/^<svg[^>]*>|<\/svg>$/gi, '');
      }
    }
  }

  if (isRoot) {
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${innerMarkup}\n</svg>`.trim();
  }
  return innerMarkup.trim();
}

export default function SlideStudio() {
  const { t, i18n } = useTranslation();
  const isEn = !i18n.language?.startsWith('ja');
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: 'slide-1',
      background: '#ffffff',
      elements: [
        {
          id: 'el-title',
          type: 'text',
          x: 80,
          y: 60,
          width: 800,
          height: 60,
          text: t('analysis.slideStudio.defaultTitle', '研究発表タイトルを入力'),
          fontSize: 32,
          color: '#1e293b',
          bold: true,
          align: 'left',
          zIndex: 1
        },
        {
          id: 'el-subtitle',
          type: 'text',
          x: 80,
          y: 130,
          width: 800,
          height: 40,
          text: t('analysis.slideStudio.defaultSubtitle', '副題または発表者名 / 所属研究室'),
          fontSize: 18,
          color: '#64748b',
          align: 'left',
          zIndex: 2
        }
      ]
    }
  ]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  // Multi-selection state
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [isEditingText, setIsEditingText] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // 生命科学向け イラスト素材パレット Modal / Drawer
  const [isAssetPaletteOpen, setIsAssetPaletteOpen] = useState(false);
  const [isPaletteExpanded, setIsPaletteExpanded] = useState(false);
  const [activeBioCategory, setActiveBioCategory] = useState<BioCategory>('molecules');
  const [assetSearchQuery, setAssetSearchQuery] = useState('');

  // Custom user assets uploaded to palette
  const [customAssets, setCustomAssets] = useState<BioItemDef[]>(() => {
    try {
      const saved = localStorage.getItem('labflow_custom_bio_assets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            ...item,
            renderSvg: () => {
              if (item.svgData) {
                return (
                  <div
                    style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    dangerouslySetInnerHTML={{ __html: item.svgData }}
                  />
                );
              }
              return (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={item.imageSrc} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
              );
            },
            getSvgString: () =>
              item.svgData ||
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${item.defaultWidth || 160} ${item.defaultHeight || 140}"><image href="${item.imageSrc}" width="${item.defaultWidth || 160}" height="${item.defaultHeight || 140}"/></svg>`
          }));
        }
      }
    } catch (e) {
      console.error('Failed to load custom assets:', e);
    }
    return [];
  });
  const customAssetInputRef = useRef<HTMLInputElement>(null);

  // Register to My Materials modal state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerModalTarget, setRegisterModalTarget] = useState<SlideElement | null>(null);
  const [registerMaterialName, setRegisterMaterialName] = useState('');

  // Save to PC local file modal state
  const [isSaveLocalModalOpen, setIsSaveLocalModalOpen] = useState(false);
  const [saveLocalModalTarget, setSaveLocalModalTarget] = useState<SlideElement | null>(null);
  const [saveLocalFilename, setSaveLocalFilename] = useState('');
  const [saveLocalFormat, setSaveLocalFormat] = useState<'svg' | 'png' | 'json'>('svg');

  // Input ref for importing files (SVG / JSON / Images) to My Materials
  const importMaterialInputRef = useRef<HTMLInputElement>(null);

  // Temporary save / draft status notification
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Restore slide draft on mount if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('labflow_slide_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSlides(parsed);
          setHistory([parsed]);
          setHistoryIndex(0);
          setSaveStatus(t('analysis.slideStudio.draftAutoRestored', '下書きを自動復元しました'));
          const timer = setTimeout(() => setSaveStatus(null), 3000);
          return () => clearTimeout(timer);
        }
      }
    } catch (e) {
      console.error('Failed to restore slide draft:', e);
    }
  }, []);

  // Drawing tool modes: 'select' | 'membrane' | 'curve' | 'freehand'
  const [activeDrawTool, setActiveDrawTool] = useState<'select' | 'membrane' | 'curve' | 'freehand'>('select');
  const [membraneDrawStyle, setMembraneDrawStyle] = useState<'straight' | 'wave' | 'arc' | 'vesicle'>('straight');
  const [drawStartPos, setDrawStartPos] = useState<Point | null>(null);
  const [currentDrawPos, setCurrentDrawPos] = useState<Point | null>(null);
  // Real-time freehand drawing
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);

  // Compatibility helpers for membrane draw mode
  const isMembraneDrawMode = activeDrawTool === 'membrane';
  const setIsMembraneDrawMode = (val: boolean) => setActiveDrawTool(val ? 'membrane' : 'select');

  // History stack for Undo / Redo (Ctrl+Z / Ctrl+Y)
  const [history, setHistory] = useState<Slide[][]>(() => [slides]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isPerformingUndoRedoRef = useRef(false);

  const pushHistory = useCallback(
    (newSlides: Slide[]) => {
      if (isPerformingUndoRedoRef.current) return;
      setHistory(prev => {
        const truncated = prev.slice(0, historyIndex + 1);
        const updated = [...truncated, newSlides].slice(-50);
        return updated;
      });
      setHistoryIndex(prev => Math.min(prev + 1, 49));
    },
    [historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isPerformingUndoRedoRef.current = true;
      const targetIndex = historyIndex - 1;
      const targetSlides = history[targetIndex];
      if (targetSlides) {
        setSlides(targetSlides);
        setHistoryIndex(targetIndex);
        setSelectedElementIds([]);
      }
      setTimeout(() => {
        isPerformingUndoRedoRef.current = false;
      }, 0);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isPerformingUndoRedoRef.current = true;
      const targetIndex = historyIndex + 1;
      const targetSlides = history[targetIndex];
      if (targetSlides) {
        setSlides(targetSlides);
        setHistoryIndex(targetIndex);
        setSelectedElementIds([]);
      }
      setTimeout(() => {
        isPerformingUndoRedoRef.current = false;
      }, 0);
    }
  }, [history, historyIndex]);

  // Dragging and resizing state
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialElementPositions, setInitialElementPositions] = useState<
    Map<string, { x: number; y: number; w: number; h: number; p1?: Point; p2?: Point }>
  >(new Map());
  const hasDraggedRef = useRef(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');

  const currentSlide = slides[currentSlideIndex] || slides[0];
  const primarySelectedId = selectedElementIds[selectedElementIds.length - 1] || null;
  const primarySelectedElement =
    currentSlide?.elements.find(el => el.id === primarySelectedId) || null;

  // Auto-fit canvas scale to available viewport dimensions
  const autoFitCanvas = useCallback(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current;
    // 48px padding (24px each side)
    const availWidth = Math.max(120, viewport.clientWidth - 48);
    const availHeight = Math.max(120, viewport.clientHeight - 48);
    const scaleX = availWidth / CANVAS_WIDTH;
    const scaleY = availHeight / CANVAS_HEIGHT;
    const fitScale = Math.min(scaleX, scaleY, 1.25);
    setCanvasScale(Math.max(Number(fitScale.toFixed(2)), 0.25));
  }, []);

  // Recalculate auto-fit when window resizes or panels toggle
  useEffect(() => {
    if (zoomMode === 'fit') {
      const timer = setTimeout(autoFitCanvas, 40);
      return () => clearTimeout(timer);
    }
  }, [zoomMode, isAssetPaletteOpen, isPaletteExpanded, autoFitCanvas]);

  useEffect(() => {
    const handleResize = () => {
      if (zoomMode === 'fit') {
        autoFitCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    let ro: ResizeObserver | null = null;
    if (viewportRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (zoomMode === 'fit') {
          autoFitCanvas();
        }
      });
      ro.observe(viewportRef.current);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
    };
  }, [zoomMode, autoFitCanvas]);

  const handleZoomIn = () => {
    setZoomMode('custom');
    setCanvasScale(prev => Math.min(2.5, Number((prev + 0.1).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setCanvasScale(prev => Math.max(0.2, Number((prev - 0.1).toFixed(2))));
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoomMode('custom');
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      setCanvasScale(prev => Math.min(2.5, Math.max(0.2, Number((prev + delta).toFixed(2)))));
    }
  };

  const updateCurrentSlideElements = (
    updater: (prevElements: SlideElement[]) => SlideElement[],
    skipHistory = false
  ) => {
    setSlides(prev => {
      const next = prev.map((s, idx) => {
        if (idx !== currentSlideIndex) return s;
        return { ...s, elements: updater(s.elements) };
      });
      if (!skipHistory) {
        pushHistory(next);
      }
      return next;
    });
  };

  const updateSelectedElements = (partial: Partial<SlideElement>) => {
    if (selectedElementIds.length === 0) return;
    updateCurrentSlideElements(elements =>
      elements.map(el => (selectedElementIds.includes(el.id) ? { ...el, ...partial } : el))
    );
  };

  const addElement = (type: ElementType) => {
    const newId = `el-${Date.now()}`;
    const baseZ = (currentSlide?.elements.length || 0) + 1;

    // Check if it's a bio asset (built-in or custom)
    const bioDef = [...BIO_ASSETS, ...customAssets].find(a => a.type === type);

    let newElement: SlideElement = {
      id: newId,
      type,
      x: Math.round(CANVAS_WIDTH / 2 - (bioDef ? bioDef.defaultWidth / 2 : 100)),
      y: Math.round(CANVAS_HEIGHT / 2 - (bioDef ? bioDef.defaultHeight / 2 : 60)),
      width: bioDef ? bioDef.defaultWidth : 200,
      height: bioDef ? bioDef.defaultHeight : 120,
      zIndex: baseZ,
      fill: bioDef ? bioDef.defaultFill : '#3b82f6',
      stroke: bioDef ? bioDef.defaultStroke : '#1d4ed8',
      strokeWidth: 2
    };

    if (bioDef) {
      if (bioDef.elementData) {
        // Restore registered custom element or group
        const baseEl = JSON.parse(JSON.stringify(bioDef.elementData)) as SlideElement;
        const newX = Math.max(20, Math.round((CANVAS_WIDTH - baseEl.width) / 2));
        const newY = Math.max(20, Math.round((CANVAS_HEIGHT - baseEl.height) / 2));

        if (baseEl.type === 'group' && baseEl.elements) {
          baseEl.elements = baseEl.elements.map((ch, idx) => ({
            ...ch,
            id: `el-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`
          }));
        }

        const restoredElement: SlideElement = {
          ...baseEl,
          id: newId,
          x: newX,
          y: newY,
          zIndex: baseZ
        };

        updateCurrentSlideElements(elements => [...elements, restoredElement]);
        setSelectedElementIds([newId]);
        setIsAssetPaletteOpen(false);
        return;
      }

      if (bioDef.isImage && bioDef.imageSrc) {
        newElement = {
          ...newElement,
          type: 'image',
          src: bioDef.imageSrc,
          width: bioDef.defaultWidth,
          height: bioDef.defaultHeight,
          x: Math.round((CANVAS_WIDTH - bioDef.defaultWidth) / 2),
          y: Math.round((CANVAS_HEIGHT - bioDef.defaultHeight) / 2)
        };
      } else if (type.startsWith('bio_lipid_bilayer')) {
        const style = type.includes('curve')
          ? 'wave'
          : type.includes('arc')
          ? 'arc'
          : type.includes('vesicle')
          ? 'vesicle'
          : 'straight';
        newElement.membraneStyle = style;
        newElement.curvature = 35;
      } else if (type === 'bio_receptor_monomer' || type.startsWith('bio_receptor_m')) {
        const m = type.match(/bio_receptor_m(\d)/);
        newElement.receptorHeadA = m ? (Number(m[1]) as any) : 1;
      } else if (type === 'bio_receptor_dimer' || type === 'bio_receptor_homo' || type === 'bio_receptor_hetero') {
        newElement.receptorHeadA = 1;
        newElement.receptorHeadB = type === 'bio_receptor_hetero' ? 3 : 1;
      }
    } else {
      switch (type) {
        case 'text':
          newElement = {
            ...newElement,
            width: 280,
            height: 50,
            text: t('analysis.slideStudio.defaultNewText', 'テキストを入力'),
            fontSize: 20,
            fontFamily: 'Arial, sans-serif',
            color: '#1e293b',
            align: 'center'
          };
          break;
        case 'rect':
          newElement = {
            ...newElement,
            width: 200,
            height: 120,
            fill: '#3b82f6',
            stroke: '#1d4ed8',
            strokeWidth: 2
          };
          break;
        case 'rounded_rect':
          newElement = {
            ...newElement,
            width: 200,
            height: 120,
            fill: '#6366f1',
            stroke: '#4338ca',
            strokeWidth: 2
          };
          break;
        case 'circle':
          newElement = {
            ...newElement,
            width: 140,
            height: 140,
            fill: '#ec4899',
            stroke: '#be185d',
            strokeWidth: 2
          };
          break;
        case 'triangle':
          newElement = {
            ...newElement,
            width: 140,
            height: 120,
            fill: '#10b981',
            stroke: '#047857',
            strokeWidth: 2
          };
          break;
        case 'arrow_right':
          newElement = {
            ...newElement,
            width: 160,
            height: 50,
            fill: '#3b82f6',
            stroke: '#1d4ed8',
            strokeWidth: 2
          };
          break;
        case 'line':
          newElement = {
            ...newElement,
            width: 180,
            height: 20,
            stroke: '#475569',
            strokeWidth: 3
          };
          break;
        case 'curve':
          newElement = {
            ...newElement,
            width: 220,
            height: 100,
            stroke: '#2563eb',
            strokeWidth: 3,
            fill: 'none',
            curveStyle: 'arc',
            curvature: 40,
            startPoint: { x: 10, y: 80 },
            endPoint: { x: 210, y: 20 }
          };
          break;
        case 'freehand':
          newElement = {
            ...newElement,
            width: 200,
            height: 100,
            stroke: '#2563eb',
            strokeWidth: 3,
            fill: 'none',
            points: [
              { x: 10, y: 80 },
              { x: 50, y: 20 },
              { x: 100, y: 80 },
              { x: 150, y: 30 },
              { x: 190, y: 60 }
            ]
          };
          break;
      }
    }

    updateCurrentSlideElements(elements => [...elements, newElement]);
    setSelectedElementIds([newId]);
    setIsAssetPaletteOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const src = event.target?.result as string;
      const newId = `el-img-${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxDim = 320;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const newElement: SlideElement = {
          id: newId,
          type: 'image',
          x: Math.round((CANVAS_WIDTH - w) / 2),
          y: Math.round((CANVAS_HEIGHT - h) / 2),
          width: w,
          height: h,
          src,
          zIndex: (currentSlide?.elements.length || 0) + 1
        };

        updateCurrentSlideElements(elements => [...elements, newElement]);
        setSelectedElementIds([newId]);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const duplicateSelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    const newDuplicates: SlideElement[] = [];
    const newSelectedIds: string[] = [];

    currentSlide.elements.forEach(el => {
      if (selectedElementIds.includes(el.id)) {
        const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        newDuplicates.push({
          ...el,
          id: newId,
          x: Math.min(el.x + 24, CANVAS_WIDTH - el.width),
          y: Math.min(el.y + 24, CANVAS_HEIGHT - el.height),
          zIndex: (currentSlide.elements.length || 0) + newDuplicates.length + 1
        });
        newSelectedIds.push(newId);
      }
    });

    updateCurrentSlideElements(elements => [...elements, ...newDuplicates]);
    setSelectedElementIds(newSelectedIds);
  };

  const deleteSelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    updateCurrentSlideElements(elements => elements.filter(el => !selectedElementIds.includes(el.id)));
    setSelectedElementIds([]);
  };

  const bringToFront = () => {
    if (selectedElementIds.length === 0) return;
    updateCurrentSlideElements(elements => {
      const maxZ = Math.max(...elements.map(e => e.zIndex), 0);
      return elements.map(el =>
        selectedElementIds.includes(el.id) ? { ...el, zIndex: maxZ + 1 } : el
      );
    });
  };

  const sendToBack = () => {
    if (selectedElementIds.length === 0) return;
    updateCurrentSlideElements(elements => {
      const minZ = Math.min(...elements.map(e => e.zIndex), 1);
      return elements.map(el =>
        selectedElementIds.includes(el.id) ? { ...el, zIndex: Math.max(minZ - 1, 0) } : el
      );
    });
  };

  // Custom Asset Management (マイ素材)
  const saveCustomAssetsToStorage = (assets: BioItemDef[]) => {
    setCustomAssets(assets);
    try {
      const serialized = assets.map(
        ({ type, category, name, defaultWidth, defaultHeight, defaultFill, defaultStroke, isImage, imageSrc, badge, elementData, svgData }) => ({
          type,
          category,
          name,
          defaultWidth,
          defaultHeight,
          defaultFill,
          defaultStroke,
          isImage,
          imageSrc,
          badge,
          elementData,
          svgData
        })
      );
      localStorage.setItem('labflow_custom_bio_assets', JSON.stringify(serialized));
    } catch (e) {
      console.error('Failed to persist custom assets:', e);
    }
  };

  // Grouping multiple selected elements into 1 group element
  const groupSelectedElements = () => {
    if (selectedElementIds.length <= 1) return;
    const elementsToGroup = currentSlide.elements.filter(el => selectedElementIds.includes(el.id));
    if (elementsToGroup.length <= 1) return;

    const minX = Math.min(...elementsToGroup.map(e => e.x));
    const minY = Math.min(...elementsToGroup.map(e => e.y));
    const maxX = Math.max(...elementsToGroup.map(e => e.x + e.width));
    const maxY = Math.max(...elementsToGroup.map(e => e.y + e.height));
    const groupWidth = Math.max(10, maxX - minX);
    const groupHeight = Math.max(10, maxY - minY);

    const relativeChildren: SlideElement[] = elementsToGroup.map(el => ({
      ...el,
      x: el.x - minX,
      y: el.y - minY
    }));

    const maxZ = Math.max(...elementsToGroup.map(e => e.zIndex), 0);
    const newGroupId = `el-group-${Date.now()}`;
    const newGroup: SlideElement = {
      id: newGroupId,
      type: 'group',
      x: minX,
      y: minY,
      width: groupWidth,
      height: groupHeight,
      origWidth: groupWidth,
      origHeight: groupHeight,
      zIndex: maxZ,
      elements: relativeChildren,
      groupName: isEn
        ? `Group (${elementsToGroup.length} items)`
        : `グループ (${elementsToGroup.length}個のオブジェクト)`
    };

    updateCurrentSlideElements(elements => {
      const remaining = elements.filter(el => !selectedElementIds.includes(el.id));
      return [...remaining, newGroup];
    });

    setSelectedElementIds([newGroupId]);
    setSaveStatus(t('analysis.slideStudio.groupedSuccess', 'オブジェクトを1つにまとめました'));
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Ungroup a group element back into individual elements
  const ungroupSelectedElements = () => {
    const groupElements = currentSlide.elements.filter(
      el => selectedElementIds.includes(el.id) && el.type === 'group' && el.elements && el.elements.length > 0
    );
    if (groupElements.length === 0) return;

    const newSelectedIds: string[] = [];
    updateCurrentSlideElements(elements => {
      let nextElements: SlideElement[] = [];

      for (const el of elements) {
        if (selectedElementIds.includes(el.id) && el.type === 'group' && el.elements) {
          const origW = el.origWidth || el.width || 1;
          const origH = el.origHeight || el.height || 1;
          const scaleX = el.width / origW;
          const scaleY = el.height / origH;

          const unpacked = el.elements.map((child, idx) => {
            const newChildId = `el-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
            newSelectedIds.push(newChildId);

            const newX = el.x + child.x * scaleX;
            const newY = el.y + child.y * scaleY;
            const newW = child.width * scaleX;
            const newH = child.height * scaleY;

            const updatedChild: SlideElement = {
              ...child,
              id: newChildId,
              x: Math.round(newX),
              y: Math.round(newY),
              width: Math.max(10, Math.round(newW)),
              height: Math.max(10, Math.round(newH)),
              zIndex: el.zIndex + idx
            };

            if (child.fontSize) {
              updatedChild.fontSize = Math.max(8, Math.round(child.fontSize * Math.min(scaleX, scaleY)));
            }

            if (child.points) {
              updatedChild.points = child.points.map(pt => ({
                x: pt.x * scaleX,
                y: pt.y * scaleY
              }));
            }

            if (child.startPoint) {
              updatedChild.startPoint = {
                x: child.startPoint.x * scaleX,
                y: child.startPoint.y * scaleY
              };
            }
            if (child.endPoint) {
              updatedChild.endPoint = {
                x: child.endPoint.x * scaleX,
                y: child.endPoint.y * scaleY
              };
            }

            return updatedChild;
          });

          nextElements.push(...unpacked);
        } else {
          nextElements.push(el);
        }
      }

      return nextElements;
    });

    if (newSelectedIds.length > 0) {
      setSelectedElementIds(newSelectedIds);
      setSaveStatus(t('analysis.slideStudio.ungroupedSuccess', 'グループを解除しました'));
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Convert current selection into a target element (single or virtual group)
  const getSelectedTargetAsSingleElement = (): SlideElement | null => {
    if (selectedElementIds.length === 0) return null;
    if (selectedElementIds.length === 1) {
      return currentSlide.elements.find(el => el.id === selectedElementIds[0]) || null;
    }
    const selectedElements = currentSlide.elements.filter(el => selectedElementIds.includes(el.id));
    if (selectedElements.length === 0) return null;

    const minX = Math.min(...selectedElements.map(e => e.x));
    const minY = Math.min(...selectedElements.map(e => e.y));
    const maxX = Math.max(...selectedElements.map(e => e.x + e.width));
    const maxY = Math.max(...selectedElements.map(e => e.y + e.height));
    const groupW = Math.max(10, maxX - minX);
    const groupH = Math.max(10, maxY - minY);

    const relativeChildren = selectedElements.map(el => ({
      ...el,
      x: el.x - minX,
      y: el.y - minY
    }));

    return {
      id: `preview-group-${Date.now()}`,
      type: 'group',
      x: 0,
      y: 0,
      width: groupW,
      height: groupH,
      origWidth: groupW,
      origHeight: groupH,
      zIndex: 1,
      elements: relativeChildren,
      groupName: isEn ? `Group (${selectedElements.length} items)` : `グループ (${selectedElements.length}個)`
    };
  };

  // Open "マイ素材に登録" Modal
  const handleOpenRegisterModal = () => {
    const target = getSelectedTargetAsSingleElement();
    if (!target) return;

    let defaultName = '';
    if (target.groupName) {
      defaultName = target.groupName;
    } else if (target.type === 'text' && target.text) {
      defaultName = stripHtmlTags(target.text).slice(0, 16);
    } else if (target.type.startsWith('bio_')) {
      defaultName = getBioAssetName(target.type, isEn ? 'en' : 'ja');
    } else {
      defaultName = isEn ? 'My Material' : 'マイ素材';
    }

    setRegisterModalTarget(target);
    setRegisterMaterialName(defaultName);
    setIsRegisterModalOpen(true);
  };

  // Confirm Registration to My Materials
  const confirmRegisterToMyMaterials = () => {
    if (!registerModalTarget) return;

    const name = registerMaterialName.trim() || (isEn ? 'Custom Material' : 'カスタム素材');
    const assetId = `custom_bio_${Date.now()}`;
    const svgStr = getElementSvgString(registerModalTarget, true, customAssets);

    const newAsset: BioItemDef = {
      type: assetId,
      category: 'custom',
      name,
      defaultWidth: registerModalTarget.width,
      defaultHeight: registerModalTarget.height,
      defaultFill: registerModalTarget.fill || '#3b82f6',
      defaultStroke: registerModalTarget.stroke || '#1d4ed8',
      isImage: false,
      elementData: registerModalTarget,
      svgData: svgStr,
      badge: isEn ? 'My Material' : 'マイ素材',
      renderSvg: () => (
        <div
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          dangerouslySetInnerHTML={{ __html: svgStr }}
        />
      ),
      getSvgString: () => svgStr
    };

    const updated = [newAsset, ...customAssets];
    saveCustomAssetsToStorage(updated);
    setIsRegisterModalOpen(false);
    setRegisterModalTarget(null);
    setSaveStatus(t('analysis.slideStudio.registerSuccess', { name, defaultValue: `「${name}」をマイ素材に登録しました` }));
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Open "PCに保存" Modal
  const handleOpenSaveLocalModal = () => {
    const target = getSelectedTargetAsSingleElement();
    if (!target) return;

    let defaultName = 'slide-object';
    if (target.groupName) {
      defaultName = target.groupName.replace(/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]/g, '_');
    } else if (target.type === 'text' && target.text) {
      defaultName = stripHtmlTags(target.text).slice(0, 16).replace(/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]/g, '_');
    } else {
      defaultName = `${target.type}-${Date.now().toString().slice(-4)}`;
    }

    setSaveLocalModalTarget(target);
    setSaveLocalFilename(defaultName);
    setSaveLocalFormat('svg');
    setIsSaveLocalModalOpen(true);
  };

  // Execute export to local file on PC (SVG, PNG 2x, or JSON)
  const executeExportToLocalFile = () => {
    if (!saveLocalModalTarget) return;

    const baseName = (saveLocalFilename.trim() || 'slide-object').replace(/\.[^/.]+$/, '');

    if (saveLocalFormat === 'svg') {
      const svgStr = getElementSvgString(saveLocalModalTarget, true, customAssets);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      setSaveStatus(t('analysis.slideStudio.savedToPcSuccess', { filename: `${baseName}.svg`, defaultValue: `PCに保存しました (${baseName}.svg)` }));
    } else if (saveLocalFormat === 'png') {
      const svgStr = getElementSvgString(saveLocalModalTarget, true, customAssets);
      const canvas = document.createElement('canvas');
      const scaleFactor = 2; // 2x high resolution for publication
      canvas.width = Math.max(20, Math.round(saveLocalModalTarget.width * scaleFactor));
      canvas.height = Math.max(20, Math.round(saveLocalModalTarget.height * scaleFactor));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(blob => {
            if (blob) {
              const downloadUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = downloadUrl;
              a.download = `${baseName}.png`;
              a.click();
              URL.revokeObjectURL(downloadUrl);
            }
          }, 'image/png');
        };
        img.src = url;
      }
      setSaveStatus(t('analysis.slideStudio.savedToPcSuccess', { filename: `${baseName}.png`, defaultValue: `PCに保存しました (${baseName}.png)` }));
    } else if (saveLocalFormat === 'json') {
      const exportData = {
        version: 1,
        type: 'labflow_slide_element',
        data: saveLocalModalTarget,
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSaveStatus(t('analysis.slideStudio.savedToPcSuccess', { filename: `${baseName}.json`, defaultValue: `PCに保存しました (${baseName}.json)` }));
    }

    setIsSaveLocalModalOpen(false);
    setSaveLocalModalTarget(null);
    setTimeout(() => setSaveStatus(null), 3500);
  };

  const handleCustomAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxDim = 160;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        const assetId = `custom_bio_${Date.now()}`;
        const newAsset: BioItemDef = {
          type: assetId,
          category: 'custom',
          name: cleanName,
          defaultWidth: w,
          defaultHeight: h,
          defaultFill: '#ffffff',
          defaultStroke: '#64748b',
          isImage: true,
          imageSrc: src,
          badge: isEn ? 'Custom' : '自前画像',
          renderSvg: () => (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={src} alt={cleanName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ),
          getSvgString: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><image href="${src}" width="${w}" height="${h}"/></svg>`
        };

        const updated = [newAsset, ...customAssets];
        saveCustomAssetsToStorage(updated);
        setActiveBioCategory('custom');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Import file (JSON / SVG / Image) into My Materials palette
  const handleImportMaterialFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const cleanName = fileName.replace(/\.[^/.]+$/, '');
    const isJson = fileName.toLowerCase().endsWith('.json');
    const isSvg = fileName.toLowerCase().endsWith('.svg');

    if (isJson) {
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && (parsed.type === 'labflow_slide_element' || parsed.data)) {
            const elData: SlideElement = parsed.data || parsed;
            const assetId = `custom_bio_${Date.now()}`;
            const svgStr = getElementSvgString(elData, true, customAssets);
            const newAsset: BioItemDef = {
              type: assetId,
              category: 'custom',
              name: cleanName,
              defaultWidth: elData.width || 120,
              defaultHeight: elData.height || 100,
              defaultFill: elData.fill || '#3b82f6',
              defaultStroke: elData.stroke || '#1d4ed8',
              isImage: false,
              elementData: elData,
              svgData: svgStr,
              badge: 'JSON',
              renderSvg: () => (
                <div
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  dangerouslySetInnerHTML={{ __html: svgStr }}
                />
              ),
              getSvgString: () => svgStr
            };
            const updated = [newAsset, ...customAssets];
            saveCustomAssetsToStorage(updated);
            setActiveBioCategory('custom');
            setSaveStatus(t('analysis.slideStudio.importedAssetSuccess', '素材をインポートしました'));
            setTimeout(() => setSaveStatus(null), 3000);
          }
        } catch (err) {
          console.error('Failed to parse JSON asset:', err);
        }
      };
      reader.readAsText(file);
    } else if (isSvg) {
      const reader = new FileReader();
      reader.onload = event => {
        const svgContent = event.target?.result as string;
        let w = 120;
        let h = 100;
        const vbMatch = svgContent.match(/viewBox=["']([^"']+)["']/i);
        if (vbMatch && vbMatch[1]) {
          const parts = vbMatch[1].trim().split(/\s+/).map(Number);
          if (parts.length === 4 && parts[2] && parts[3]) {
            w = Math.round(parts[2]);
            h = Math.round(parts[3]);
          }
        }
        const assetId = `custom_bio_${Date.now()}`;
        const newAsset: BioItemDef = {
          type: assetId,
          category: 'custom',
          name: cleanName,
          defaultWidth: w,
          defaultHeight: h,
          defaultFill: '#3b82f6',
          defaultStroke: '#1d4ed8',
          isImage: false,
          svgData: svgContent,
          badge: 'SVG',
          renderSvg: () => (
            <div
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ),
          getSvgString: () => svgContent
        };
        const updated = [newAsset, ...customAssets];
        saveCustomAssetsToStorage(updated);
        setActiveBioCategory('custom');
        setSaveStatus(t('analysis.slideStudio.importedAssetSuccess', '素材をインポートしました'));
        setTimeout(() => setSaveStatus(null), 3000);
      };
      reader.readAsText(file);
    } else {
      handleCustomAssetUpload(e);
      return;
    }
    e.target.value = '';
  };

  // Download a single custom asset as SVG from palette
  const handleDownloadSingleAsset = (asset: BioItemDef, e: React.MouseEvent) => {
    e.stopPropagation();
    const svgStr = asset.getSvgString(asset.defaultFill, asset.defaultStroke, asset.defaultWidth, asset.defaultHeight);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.name || 'custom-material'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteCustomAsset = (assetType: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('analysis.slideStudio.confirmDeleteCustomAsset', 'この自前素材を削除しますか？'))) {
      const updated = customAssets.filter(a => a.type !== assetType);
      saveCustomAssetsToStorage(updated);
    }
  };

  // Slide management & Temporary Save
  const addSlide = () => {
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      background: '#ffffff',
      elements: []
    };
    const nextSlides = [...slides, newSlide];
    setSlides(nextSlides);
    pushHistory(nextSlides);
    setCurrentSlideIndex(slides.length);
    setSelectedElementIds([]);
  };

  const deleteSlideAtIndex = (idxToDelete: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (slides.length <= 1) {
      if (window.confirm(t('analysis.slideStudio.confirmClearSlide', 'このスライドの全要素を削除して白紙に戻しますか？'))) {
        updateCurrentSlideElements(() => []);
        setSelectedElementIds([]);
        setSaveStatus(t('analysis.slideStudio.slideCleared', 'スライドを白紙にしました'));
        setTimeout(() => setSaveStatus(null), 3000);
      }
      return;
    }
    if (window.confirm(t('analysis.slideStudio.confirmDeleteSlide', { number: idxToDelete + 1, defaultValue: `スライド ${idxToDelete + 1} を削除しますか？` }))) {
      const nextSlides = slides.filter((_, idx) => idx !== idxToDelete);
      setSlides(nextSlides);
      pushHistory(nextSlides);
      setCurrentSlideIndex(prev => {
        if (prev > idxToDelete) return prev - 1;
        if (prev === idxToDelete) return Math.max(0, prev - 1);
        return prev;
      });
      setSelectedElementIds([]);
      setSaveStatus(t('analysis.slideStudio.slideDeleted', { number: idxToDelete + 1, defaultValue: `スライド ${idxToDelete + 1} を削除しました` }));
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const deleteCurrentSlide = () => {
    deleteSlideAtIndex(currentSlideIndex);
  };

  const handleSaveDraft = () => {
    try {
      localStorage.setItem('labflow_slide_draft', JSON.stringify(slides));
      const now = new Date();
      const timeStr = now.toLocaleTimeString(isEn ? 'en-US' : 'ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSaveStatus(t('analysis.slideStudio.draftSaved', { time: timeStr, defaultValue: `一時保存完了 (${timeStr})` }));
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (e) {
      console.error('Failed to save slide draft:', e);
      alert(t('analysis.slideStudio.draftSaveFailed', '一時保存に失敗しました。画像データが大きすぎる可能性があります。'));
    }
  };

  const handleResetSlides = () => {
    if (window.confirm(t('analysis.slideStudio.confirmResetSlides', 'すべてのスライドをリセットして新規作成しますか？保存されていない変更は破棄されます。'))) {
      const freshSlide: Slide = {
        id: `slide-${Date.now()}`,
        background: '#ffffff',
        elements: [
          {
            id: 'el-title',
            type: 'text',
            x: 80,
            y: 60,
            width: 800,
            height: 60,
            text: t('analysis.slideStudio.defaultTitle', '研究発表タイトルを入力'),
            fontSize: 32,
            color: '#1e293b',
            bold: true,
            align: 'left',
            zIndex: 1
          }
        ]
      };
      setSlides([freshSlide]);
      pushHistory([freshSlide]);
      setCurrentSlideIndex(0);
      setSelectedElementIds([]);
      localStorage.removeItem('labflow_slide_draft');
      setSaveStatus(t('analysis.slideStudio.slidesReset', 'スライドを初期化しました'));
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Selection & Mouse Drag Handlers
  const handleElementMouseDown = (e: React.MouseEvent, elId: string, handle?: string) => {
    e.stopPropagation();
    hasDraggedRef.current = false;

    let nextSelected = [...selectedElementIds];

    if (e.ctrlKey || e.metaKey) {
      // Toggle selection with Ctrl / Cmd
      if (nextSelected.includes(elId)) {
        nextSelected = nextSelected.filter(id => id !== elId);
      } else {
        nextSelected.push(elId);
      }
    } else {
      // If clicking an element already in the selection, keep the group selected for dragging!
      if (!nextSelected.includes(elId)) {
        nextSelected = [elId];
      }
    }

    setSelectedElementIds(nextSelected);

    // Save starting coordinates for all selected elements
    const startMap = new Map<string, { x: number; y: number; w: number; h: number; p1?: Point; p2?: Point }>();
    currentSlide.elements.forEach(item => {
      if (nextSelected.includes(item.id)) {
        startMap.set(item.id, {
          x: item.x,
          y: item.y,
          w: item.width,
          h: item.height,
          p1: item.startPoint ? { ...item.startPoint } : undefined,
          p2: item.endPoint ? { ...item.endPoint } : undefined
        });
      }
    });

    setInitialElementPositions(startMap);
    setDragStart({ x: e.clientX, y: e.clientY });
    setIsDragging(!handle);
    setResizeHandle(handle || null);
  };

  // Global mouse move & up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Freehand drawing in progress
      if (isDrawingFreehand) {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const px = Math.round((e.clientX - rect.left) / canvasScale);
        const py = Math.round((e.clientY - rect.top) / canvasScale);
        setFreehandPoints(prev => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1]!;
            if (Math.hypot(px - last.x, py - last.y) < 2) return prev;
          }
          return [...prev, { x: px, y: py }];
        });
        return;
      }

      // Curve or Membrane drawing in progress
      if ((activeDrawTool === 'curve' || activeDrawTool === 'membrane') && drawStartPos) {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const px = Math.round((e.clientX - rect.left) / canvasScale);
        const py = Math.round((e.clientY - rect.top) / canvasScale);
        setCurrentDrawPos({ x: px, y: py });
        return;
      }

      if (!isDragging && !resizeHandle) return;
      if (selectedElementIds.length === 0) return;

      const dx = (e.clientX - dragStart.x) / canvasScale;
      const dy = (e.clientY - dragStart.y) / canvasScale;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        hasDraggedRef.current = true;
      }

      // Dragging Curve P1 Endpoint handle
      if (resizeHandle === 'curve_p1' && primarySelectedId) {
        const init = initialElementPositions.get(primarySelectedId);
        if (!init) return;
        const initP1 = init.p1 || { x: 10, y: Math.round(init.h / 2) };
        const newP1X = Math.round(Math.max(0, Math.min(init.w, initP1.x + dx)));
        const newP1Y = Math.round(Math.max(0, Math.min(init.h, initP1.y + dy)));
        updateCurrentSlideElements(
          elements =>
            elements.map(el =>
              el.id === primarySelectedId
                ? { ...el, startPoint: { x: newP1X, y: newP1Y } }
                : el
            ),
          true
        );
        return;
      }

      // Dragging Curve P2 Endpoint handle
      if (resizeHandle === 'curve_p2' && primarySelectedId) {
        const init = initialElementPositions.get(primarySelectedId);
        if (!init) return;
        const initP2 = init.p2 || { x: Math.max(20, init.w - 10), y: Math.round(init.h / 2) };
        const newP2X = Math.round(Math.max(0, Math.min(init.w, initP2.x + dx)));
        const newP2Y = Math.round(Math.max(0, Math.min(init.h, initP2.y + dy)));
        updateCurrentSlideElements(
          elements =>
            elements.map(el =>
              el.id === primarySelectedId
                ? { ...el, endPoint: { x: newP2X, y: newP2Y } }
                : el
            ),
          true
        );
        return;
      }

      if (isDragging) {
        // Move all selected elements together
        updateCurrentSlideElements(
          elements =>
            elements.map(el => {
              const init = initialElementPositions.get(el.id);
              if (!init) return el;
              const newX = Math.round(Math.max(0, Math.min(CANVAS_WIDTH - init.w, init.x + dx)));
              const newY = Math.round(Math.max(0, Math.min(CANVAS_HEIGHT - init.h, init.y + dy)));
              return { ...el, x: newX, y: newY };
            }),
          true
        );
      } else if (resizeHandle && primarySelectedId) {
        // Resize primary element
        const init = initialElementPositions.get(primarySelectedId);
        if (!init) return;

        let newX = init.x;
        let newY = init.y;
        let newW = init.w;
        let newH = init.h;

        if (resizeHandle.includes('e')) newW = Math.max(30, init.w + dx);
        if (resizeHandle.includes('s')) newH = Math.max(20, init.h + dy);
        if (resizeHandle.includes('w')) {
          const maxDx = init.w - 30;
          const actualDx = Math.min(dx, maxDx);
          newX = init.x + actualDx;
          newW = init.w - actualDx;
        }
        if (resizeHandle.includes('n')) {
          const maxDy = init.h - 20;
          const actualDy = Math.min(dy, maxDy);
          newY = init.y + actualDy;
          newH = init.h - actualDy;
        }

        updateCurrentSlideElements(
          elements =>
            elements.map(el =>
              el.id === primarySelectedId
                ? {
                    ...el,
                    x: Math.round(newX),
                    y: Math.round(newY),
                    width: Math.round(newW),
                    height: Math.round(newH)
                  }
                : el
            ),
          true
        );
      }
    };

    const handleMouseUp = () => {
      // Commit dragged changes to history
      if (hasDraggedRef.current) {
        pushHistory(slides);
        hasDraggedRef.current = false;
      }
      setIsDragging(false);
      setResizeHandle(null);

      // Finish Freehand drawing
      if (isDrawingFreehand) {
        if (freehandPoints.length >= 2) {
          const xs = freehandPoints.map(p => p.x);
          const ys = freehandPoints.map(p => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const pad = 12;
          const elX = Math.max(0, minX - pad);
          const elY = Math.max(0, minY - pad);
          const elW = Math.max(30, maxX - minX + pad * 2);
          const elH = Math.max(30, maxY - minY + pad * 2);
          const normalized = freehandPoints.map(p => ({ x: p.x - elX, y: p.y - elY }));
          const newId = `el-freehand-${Date.now()}`;
          const newEl: SlideElement = {
            id: newId,
            type: 'freehand',
            x: elX,
            y: elY,
            width: elW,
            height: elH,
            points: normalized,
            stroke: '#2563eb',
            strokeWidth: 3,
            fill: 'none',
            zIndex: (currentSlide?.elements.length || 0) + 1
          };
          updateCurrentSlideElements(elements => [...elements, newEl]);
          setSelectedElementIds([newId]);
        }
        setIsDrawingFreehand(false);
        setFreehandPoints([]);
        setActiveDrawTool('select');
      }

      // Finish Two-Point Curve drawing
      if (activeDrawTool === 'curve' && drawStartPos) {
        const endPos = currentDrawPos || drawStartPos;
        const dist = Math.hypot(endPos.x - drawStartPos.x, endPos.y - drawStartPos.y);
        if (dist > 15) {
          const minX = Math.min(drawStartPos.x, endPos.x);
          const maxX = Math.max(drawStartPos.x, endPos.x);
          const minY = Math.min(drawStartPos.y, endPos.y);
          const maxY = Math.max(drawStartPos.y, endPos.y);
          const pad = 20;
          const elX = Math.max(0, minX - pad);
          const elY = Math.max(0, minY - pad);
          const elW = Math.max(60, maxX - minX + pad * 2);
          const elH = Math.max(60, maxY - minY + pad * 2);
          const p1: Point = { x: drawStartPos.x - elX, y: drawStartPos.y - elY };
          const p2: Point = { x: endPos.x - elX, y: endPos.y - elY };
          const newId = `el-curve-${Date.now()}`;
          const newCurve: SlideElement = {
            id: newId,
            type: 'curve',
            x: elX,
            y: elY,
            width: elW,
            height: elH,
            startPoint: p1,
            endPoint: p2,
            stroke: '#2563eb',
            strokeWidth: 3,
            fill: 'none',
            curveStyle: 'arc',
            curvature: 40,
            zIndex: (currentSlide?.elements.length || 0) + 1
          };
          updateCurrentSlideElements(elements => [...elements, newCurve]);
          setSelectedElementIds([newId]);
        }
        setDrawStartPos(null);
        setCurrentDrawPos(null);
        setActiveDrawTool('select');
      }

      // Finish Membrane drawing
      if (activeDrawTool === 'membrane' && drawStartPos) {
        const endPos = currentDrawPos || drawStartPos;
        const startX = drawStartPos.x;
        const startY = drawStartPos.y;
        const endX = endPos.x;
        const endY = endPos.y;
        const width = Math.max(membraneDrawStyle === 'vesicle' ? 120 : 80, Math.abs(endX - startX));
        const height = membraneDrawStyle === 'vesicle' ? width : (membraneDrawStyle === 'straight' ? 80 : 110);
        const posX = Math.min(startX, endX);
        const posY = Math.min(startY, endY) - height / 2;
        const newId = `el-bilayer-${Date.now()}`;
        const newBilayer: SlideElement = {
          id: newId,
          type: 'bio_lipid_bilayer',
          membraneStyle: membraneDrawStyle,
          curvature: 35,
          x: Math.max(0, posX),
          y: Math.max(0, posY),
          width,
          height,
          fill: '#ef4444',
          stroke: '#f59e0b',
          zIndex: (currentSlide?.elements.length || 0) + 1
        };
        updateCurrentSlideElements(elements => [...elements, newBilayer]);
        setSelectedElementIds([newId]);
        setDrawStartPos(null);
        setCurrentDrawPos(null);
        setActiveDrawTool('select');
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    resizeHandle,
    dragStart,
    initialElementPositions,
    canvasScale,
    selectedElementIds,
    primarySelectedId,
    isDrawingFreehand,
    freehandPoints,
    activeDrawTool,
    drawStartPos,
    currentDrawPos,
    membraneDrawStyle,
    slides,
    pushHistory
  ]);

  // Canvas background click (Deselects ONLY if clicking strictly the empty background or viewport)
  const handleCanvasBackgroundMouseDown = (e: React.MouseEvent) => {
    // If clicking directly on canvas background (not an element or handle)
    if (e.target === canvasRef.current || (e.target as HTMLElement).getAttribute('data-canvas-bg') === 'true') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.round((e.clientX - rect.left) / canvasScale);
      const y = Math.round((e.clientY - rect.top) / canvasScale);

      if (activeDrawTool === 'freehand') {
        setIsDrawingFreehand(true);
        setFreehandPoints([{ x, y }]);
      } else if (activeDrawTool === 'curve' || activeDrawTool === 'membrane') {
        setDrawStartPos({ x, y });
        setCurrentDrawPos({ x, y });
      } else {
        setSelectedElementIds([]);
        setIsEditingText(false);
      }
    } else if (e.target === viewportRef.current) {
      setSelectedElementIds([]);
      setIsEditingText(false);
    }
  };

  const handleCanvasBackgroundMouseUp = () => {
    // Handled in global mouseUp
  };

  // Keyboard navigation, undo/redo, & deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (isEditingText || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      // Undo: Ctrl+Z (or Cmd+Z) without Shift
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Y (or Cmd+Y) OR Ctrl+Shift+Z (or Cmd+Shift+Z)
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if (selectedElementIds.length === 0) return;

      // Group: Ctrl+G / Ungroup: Ctrl+Shift+G
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          ungroupSelectedElements();
        } else {
          groupSelectedElements();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedElements();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedElements();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 2;
        updateCurrentSlideElements(elements =>
          elements.map(el =>
            selectedElementIds.includes(el.id) ? { ...el, y: Math.max(0, el.y - delta) } : el
          )
        );
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 2;
        updateCurrentSlideElements(elements =>
          elements.map(el =>
            selectedElementIds.includes(el.id) ? { ...el, y: Math.min(CANVAS_HEIGHT, el.y + delta) } : el
          )
        );
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 2;
        updateCurrentSlideElements(elements =>
          elements.map(el =>
            selectedElementIds.includes(el.id) ? { ...el, x: Math.max(0, el.x - delta) } : el
          )
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 2;
        updateCurrentSlideElements(elements =>
          elements.map(el =>
            selectedElementIds.includes(el.id) ? { ...el, x: Math.min(CANVAS_WIDTH, el.x + delta) } : el
          )
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, isEditingText, undo, redo]);

  // Export to PowerPoint (.pptx)
  const exportToPptx = async () => {
    setIsExporting(true);
    try {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';

      const scaleX = 10.0 / CANVAS_WIDTH;
      const scaleY = 5.625 / CANVAS_HEIGHT;

      for (const slideData of slides) {
        const pptxSlide = pres.addSlide();
        if (slideData.background && slideData.background.startsWith('#')) {
          pptxSlide.background = { color: slideData.background.replace('#', '') };
        }

        const sorted = [...slideData.elements].sort((a, b) => a.zIndex - b.zIndex);

        for (const el of sorted) {
          const x = el.x * scaleX;
          const y = el.y * scaleY;
          const w = el.width * scaleX;
          const h = el.height * scaleY;

          if (el.type === 'text') {
            const fontDef = FONT_OPTIONS.find(
              f => f.cssFamily === el.fontFamily || f.id === el.fontFamily || f.label === el.fontFamily
            );
            const pptxFontFace = fontDef ? fontDef.pptxName : 'Arial';
            const baseOpts = {
              fontSize: Math.round((el.fontSize || 18) * 0.75),
              color: (el.color || '#000000').replace('#', ''),
              fontFace: pptxFontFace,
              bold: !!el.bold,
              italic: !!el.italic,
              underline: !!el.underline ? ({ style: 'sng' } as const) : undefined
            };

            const chunks = parsePptxTextChunks(el.text || '', baseOpts);
            pptxSlide.addText(chunks, {
              x,
              y,
              w,
              h,
              align: el.align || 'left',
              valign: 'middle'
            });
          } else if (el.type === 'rect') {
            pptxSlide.addShape(pres.ShapeType.rect, {
              x,
              y,
              w,
              h,
              fill: el.fill ? { color: el.fill.replace('#', '') } : undefined,
              line: el.stroke
                ? { color: el.stroke.replace('#', ''), width: el.strokeWidth || 1 }
                : undefined
            });
          } else if (el.type === 'rounded_rect') {
            pptxSlide.addShape(pres.ShapeType.roundRect, {
              x,
              y,
              w,
              h,
              fill: el.fill ? { color: el.fill.replace('#', '') } : undefined,
              line: el.stroke
                ? { color: el.stroke.replace('#', ''), width: el.strokeWidth || 1 }
                : undefined
            });
          } else if (el.type === 'circle') {
            pptxSlide.addShape(pres.ShapeType.oval, {
              x,
              y,
              w,
              h,
              fill: el.fill ? { color: el.fill.replace('#', '') } : undefined,
              line: el.stroke
                ? { color: el.stroke.replace('#', ''), width: el.strokeWidth || 1 }
                : undefined
            });
          } else if (el.type === 'triangle') {
            pptxSlide.addShape(pres.ShapeType.triangle, {
              x,
              y,
              w,
              h,
              fill: el.fill ? { color: el.fill.replace('#', '') } : undefined,
              line: el.stroke
                ? { color: el.stroke.replace('#', ''), width: el.strokeWidth || 1 }
                : undefined
            });
          } else if (el.type === 'arrow_right') {
            pptxSlide.addShape(pres.ShapeType.rightArrow, {
              x,
              y,
              w,
              h,
              fill: el.fill ? { color: el.fill.replace('#', '') } : undefined,
              line: el.stroke
                ? { color: el.stroke.replace('#', ''), width: el.strokeWidth || 1 }
                : undefined
            });
          } else if (el.type === 'line') {
            pptxSlide.addShape(pres.ShapeType.line, {
              x,
              y: y + h / 2,
              w,
              h: 0,
              line: { color: (el.stroke || '#000000').replace('#', ''), width: el.strokeWidth || 2 }
            });
          } else if (el.type === 'curve') {
            const svgString = generateCurveSvg(
              el.width,
              el.height,
              el.stroke || '#2563eb',
              el.strokeWidth || 3,
              el.curveStyle || 'arc',
              el.curvature ?? 40,
              el.id,
              el.startPoint,
              el.endPoint
            );
            const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
            pptxSlide.addImage({
              data: dataUrl,
              x,
              y,
              w,
              h
            });
          } else if (el.type === 'freehand') {
            const svgString = generateFreehandSvg(
              el.points || [],
              el.stroke || '#2563eb',
              el.strokeWidth || 3,
              el.id
            );
            if (svgString) {
              const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
              pptxSlide.addImage({
                data: dataUrl,
                x,
                y,
                w,
                h
              });
            }
          } else if (el.type === 'image' && el.src) {
            if (el.src.startsWith('data:')) {
              pptxSlide.addImage({
                data: el.src,
                x,
                y,
                w,
                h
              });
            } else {
              pptxSlide.addImage({
                path: el.src,
                x,
                y,
                w,
                h
              });
            }
          } else if (el.type.startsWith('bio_') || el.type.startsWith('custom_bio_')) {
            // 生命科学向け ベクターパーツの clean SVG data URI 出力
            let svgString = '';
            if (el.type.startsWith('bio_lipid_bilayer')) {
              const style = el.membraneStyle || (el.type.includes('curve') ? 'wave' : el.type.includes('arc') ? 'arc' : el.type.includes('vesicle') ? 'vesicle' : 'straight');
              svgString = generateLipidBilayerSvg(el.width, el.height, el.fill || '#ef4444', el.stroke || '#f59e0b', style, el.curvature ?? 35);
            } else if (el.type === 'bio_receptor_monomer' || el.type.startsWith('bio_receptor_m')) {
              svgString = getMonomerReceptorSvg(el.fill || '#6366f1', el.stroke || '#4338ca', el.receptorHeadA || 1, el.width, el.height);
            } else if (el.type === 'bio_receptor_dimer' || el.type === 'bio_receptor_homo' || el.type === 'bio_receptor_hetero') {
              svgString = getDimerReceptorSvg(el.fill || '#6366f1', el.stroke || '#4338ca', el.receptorHeadA || 1, el.receptorHeadB || (el.type === 'bio_receptor_hetero' ? 3 : 1), el.width, el.height);
            } else {
              const bioDef = [...BIO_ASSETS, ...customAssets].find(a => a.type === el.type);
              if (bioDef) {
                svgString = bioDef.getSvgString(el.fill || bioDef.defaultFill, el.stroke || bioDef.defaultStroke, el.width, el.height);
              }
            }
            if (svgString) {
              const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
              pptxSlide.addImage({
                data: dataUrl,
                x,
                y,
                w,
                h
              });
            }
          } else if (el.type === 'group') {
            const svgString = getElementSvgString(el, true, customAssets);
            if (svgString) {
              const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
              pptxSlide.addImage({
                data: dataUrl,
                x,
                y,
                w,
                h
              });
            }
          }
        }
      }

      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await pres.writeFile({ fileName: `LabFlow_Presentation_${timestamp}.pptx` });
    } catch (err) {
      console.error('Failed to export PPTX:', err);
      alert(t('analysis.slideStudio.exportError', 'PowerPointのエクスポート中にエラーが発生しました'));
    } finally {
      setIsExporting(false);
    }
  };

  // Child renderer for group elements
  const renderChildElement = (child: SlideElement): React.ReactNode => {
    return (
      <div
        key={child.id}
        style={{
          position: 'absolute',
          left: `${child.x}px`,
          top: `${child.y}px`,
          width: `${child.width}px`,
          height: `${child.height}px`,
          zIndex: child.zIndex,
          boxSizing: 'border-box',
          pointerEvents: 'none'
        }}
      >
        {renderElementBody(child)}
      </div>
    );
  };

  // Visual body renderer for elements (including children within a group)
  const renderElementBody = (el: SlideElement, isPrimarySelected = false): React.ReactNode => {
    let content: React.ReactNode = null;

    // Check bio asset (built-in or custom)
    const bioDef = [...BIO_ASSETS, ...customAssets].find(a => a.type === el.type);

    if (el.type.startsWith('bio_lipid_bilayer')) {
      const style = el.membraneStyle || (el.type.includes('curve') ? 'wave' : el.type.includes('arc') ? 'arc' : el.type.includes('vesicle') ? 'vesicle' : 'straight');
      content = (
        <div
          style={{ width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{
            __html: generateLipidBilayerSvg(
              el.width,
              el.height,
              el.fill || '#ef4444',
              el.stroke || '#f59e0b',
              style,
              el.curvature ?? 35
            )
          }}
        />
      );
    } else if (el.type === 'bio_receptor_monomer' || el.type.startsWith('bio_receptor_m')) {
      content = (
        <div
          style={{ width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{
            __html: getMonomerReceptorSvg(
              el.fill || '#6366f1',
              el.stroke || '#4338ca',
              el.receptorHeadA || 1,
              el.width,
              el.height
            )
          }}
        />
      );
    } else if (el.type === 'bio_receptor_dimer' || el.type === 'bio_receptor_homo' || el.type === 'bio_receptor_hetero') {
      content = (
        <div
          style={{ width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{
            __html: getDimerReceptorSvg(
              el.fill || '#6366f1',
              el.stroke || '#4338ca',
              el.receptorHeadA || 1,
              el.receptorHeadB || (el.type === 'bio_receptor_hetero' ? 3 : 1),
              el.width,
              el.height
            )
          }}
        />
      );
    } else if (bioDef) {
      content = bioDef.renderSvg(el.fill || bioDef.defaultFill, el.stroke || bioDef.defaultStroke, el.width, el.height);
    } else {
      switch (el.type) {
        case 'text':
          content = (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
                textAlign: el.align || 'left',
                fontSize: `${el.fontSize || 18}px`,
                fontFamily: el.fontFamily || 'Arial, sans-serif',
                fontWeight: el.bold ? 'bold' : 'normal',
                fontStyle: el.italic ? 'italic' : 'normal',
                textDecoration: el.underline ? 'underline' : 'none',
                color: el.color || '#000000',
                userSelect: 'none',
                wordBreak: 'break-word',
                padding: '4px'
              }}
            >
              {isEditingText && isPrimarySelected ? (
                <textarea
                  autoFocus
                  defaultValue={el.text || ''}
                  onBlur={e => {
                    setIsEditingText(false);
                    updateSelectedElements({ text: e.target.value });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      setIsEditingText(false);
                      updateSelectedElements({ text: (e.target as HTMLTextAreaElement).value });
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'rgba(255,255,255,0.95)',
                    color: el.color || '#000000',
                    border: '2px solid #3b82f6',
                    borderRadius: '4px',
                    fontSize: 'inherit',
                    fontFamily: el.fontFamily || 'inherit',
                    fontWeight: 'inherit',
                    textAlign: el.align || 'left',
                    resize: 'none',
                    outline: 'none',
                    padding: '2px'
                  }}
                />
              ) : (
                <span>{renderFormattedText(el.text || t('analysis.slideStudio.defaultNewText', 'テキストを入力'))}</span>
              )}
            </div>
          );
          break;

        case 'rect':
          content = (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: el.fill || '#3b82f6',
                border: `${el.strokeWidth || 1}px solid ${el.stroke || '#1d4ed8'}`,
                opacity: el.opacity ?? 1
              }}
            />
          );
          break;

        case 'rounded_rect':
          content = (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: el.fill || '#6366f1',
                border: `${el.strokeWidth || 1}px solid ${el.stroke || '#4338ca'}`,
                borderRadius: '16px',
                opacity: el.opacity ?? 1
              }}
            />
          );
          break;

        case 'circle':
          content = (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: el.fill || '#ec4899',
                border: `${el.strokeWidth || 1}px solid ${el.stroke || '#be185d'}`,
                borderRadius: '50%',
                opacity: el.opacity ?? 1
              }}
            />
          );
          break;

        case 'triangle':
          content = (
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon
                points="50,5 95,95 5,95"
                fill={el.fill || '#10b981'}
                stroke={el.stroke || '#047857'}
                strokeWidth={el.strokeWidth || 2}
              />
            </svg>
          );
          break;

        case 'arrow_right':
          content = (
            <svg width="100%" height="100%" viewBox="0 0 100 50" preserveAspectRatio="none">
              <polygon
                points="5,18 65,18 65,5 95,25 65,45 65,32 5,32"
                fill={el.fill || '#3b82f6'}
                stroke={el.stroke || '#1d4ed8'}
                strokeWidth={el.strokeWidth || 1}
              />
            </svg>
          );
          break;

        case 'line':
          content = (
            <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
              <line
                x1="0"
                y1="10"
                x2="100"
                y2="10"
                stroke={el.stroke || '#475569'}
                strokeWidth={el.strokeWidth || 3}
              />
            </svg>
          );
          break;

        case 'curve':
          content = (
            <div
              style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
              dangerouslySetInnerHTML={{
                __html: generateCurveSvg(
                  el.width,
                  el.height,
                  el.stroke || '#2563eb',
                  el.strokeWidth || 3,
                  el.curveStyle || 'arc',
                  el.curvature ?? 40,
                  el.id,
                  el.startPoint,
                  el.endPoint
                )
              }}
            />
          );
          break;

        case 'freehand':
          content = (
            <div
              style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
              dangerouslySetInnerHTML={{
                __html: generateFreehandSvg(
                  el.points || [],
                  el.stroke || '#2563eb',
                  el.strokeWidth || 3,
                  el.id
                )
              }}
            />
          );
          break;

        case 'image':
          content = (
            <img
              src={el.src}
              alt="Slide visual"
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
            />
          );
          break;

        case 'group': {
          const origW = el.origWidth || el.width || 1;
          const origH = el.origHeight || el.height || 1;
          const scaleX = el.width / origW;
          const scaleY = el.height / origH;
          content = (
            <div
              style={{
                position: 'relative',
                width: `${origW}px`,
                height: `${origH}px`,
                transform: `scale(${scaleX}, ${scaleY})`,
                transformOrigin: 'top left',
                pointerEvents: 'none'
              }}
            >
              {(el.elements || []).map(child => renderChildElement(child))}
            </div>
          );
          break;
        }
      }
    }

    return content;
  };

  // Render element on canvas
  const renderElement = (el: SlideElement) => {
    const isSelected = selectedElementIds.includes(el.id);
    const isPrimarySelected = el.id === primarySelectedId;

    return (
      <div
        key={el.id}
        onMouseDown={e => handleElementMouseDown(e, el.id)}
        onClick={e => e.stopPropagation()} // CRITICAL: prevent deselect on mouse up!
        onDoubleClick={e => {
          e.stopPropagation();
          if (el.type === 'text') setIsEditingText(true);
          else if (el.type === 'group') ungroupSelectedElements();
        }}
        style={{
          position: 'absolute',
          left: `${el.x}px`,
          top: `${el.y}px`,
          width: `${el.width}px`,
          height: `${el.height}px`,
          zIndex: el.zIndex,
          cursor: isDragging && isSelected ? 'grabbing' : 'grab',
          outline: isSelected ? '2px solid #3b82f6' : 'none',
          boxShadow: isSelected ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none',
          boxSizing: 'border-box'
        }}
      >
        {renderElementBody(el, isSelected && isPrimarySelected)}

        {/* Resize Handles (only shown on primary selected item) */}
        {isSelected && isPrimarySelected && (
          <>
            {/* Dedicated Start / End Point handles for Curve elements */}
            {el.type === 'curve' && (
              <>
                <div
                  title="開始点 (P1)"
                  onMouseDown={e => handleElementMouseDown(e, el.id, 'curve_p1')}
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left: `${(el.startPoint?.x ?? 10) - 7}px`,
                    top: `${(el.startPoint?.y ?? el.height / 2) - 7}px`,
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    border: '2px solid #ffffff',
                    boxShadow: '0 0 4px rgba(0,0,0,0.6)',
                    cursor: 'crosshair',
                    zIndex: 1000
                  }}
                />
                <div
                  title="終了点 (P2)"
                  onMouseDown={e => handleElementMouseDown(e, el.id, 'curve_p2')}
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left: `${(el.endPoint?.x ?? el.width - 10) - 7}px`,
                    top: `${(el.endPoint?.y ?? el.height / 2) - 7}px`,
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: '#f59e0b',
                    border: '2px solid #ffffff',
                    boxShadow: '0 0 4px rgba(0,0,0,0.6)',
                    cursor: 'crosshair',
                    zIndex: 1000
                  }}
                />
              </>
            )}

            {['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'].map(handle => {
              const handleStyle: React.CSSProperties = {
                position: 'absolute',
                width: '8px',
                height: '8px',
                backgroundColor: '#ffffff',
                border: '2px solid #3b82f6',
                borderRadius: '2px',
                zIndex: 999
              };

              if (handle === 'nw') {
                handleStyle.top = '-5px';
                handleStyle.left = '-5px';
                handleStyle.cursor = 'nwse-resize';
              } else if (handle === 'ne') {
                handleStyle.top = '-5px';
                handleStyle.right = '-5px';
                handleStyle.cursor = 'nesw-resize';
              } else if (handle === 'se') {
                handleStyle.bottom = '-5px';
                handleStyle.right = '-5px';
                handleStyle.cursor = 'nwse-resize';
              } else if (handle === 'sw') {
                handleStyle.bottom = '-5px';
                handleStyle.left = '-5px';
                handleStyle.cursor = 'nesw-resize';
              } else if (handle === 'n') {
                handleStyle.top = '-5px';
                handleStyle.left = 'calc(50% - 4px)';
                handleStyle.cursor = 'ns-resize';
              } else if (handle === 's') {
                handleStyle.bottom = '-5px';
                handleStyle.left = 'calc(50% - 4px)';
                handleStyle.cursor = 'ns-resize';
              } else if (handle === 'w') {
                handleStyle.top = 'calc(50% - 4px)';
                handleStyle.left = '-5px';
                handleStyle.cursor = 'ew-resize';
              } else if (handle === 'e') {
                handleStyle.top = 'calc(50% - 4px)';
                handleStyle.right = '-5px';
                handleStyle.cursor = 'ew-resize';
              }

              return (
                <div
                  key={handle}
                  style={handleStyle}
                  onMouseDown={e => handleElementMouseDown(e, el.id, handle)}
                  onClick={e => e.stopPropagation()}
                />
              );
            })}
          </>
        )}
      </div>
    );
  };

  // Filter bio assets by category and search (built-in + custom user assets)
  const allAvailableBioAssets = useMemo(() => [...BIO_ASSETS, ...customAssets], [customAssets]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      molecules: 0,
      cells: 0,
      organisms: 0,
      equipment: 0,
      custom: customAssets.length
    };
    for (const a of BIO_ASSETS) {
      if (counts[a.category] !== undefined) {
        counts[a.category]++;
      }
    }
    return counts;
  }, [customAssets.length]);

  const isSearching = !!assetSearchQuery.trim();
  const filteredBioAssets = useMemo(() => {
    const query = assetSearchQuery.trim().toLowerCase();
    return allAvailableBioAssets.filter(a => {
      const matchesCategory = isSearching ? true : a.category === activeBioCategory;
      if (!matchesCategory) return false;
      if (!isSearching) return true;
      const localizedName = getBioAssetName(a, isEn);
      return (
        a.name.toLowerCase().includes(query) ||
        (a.nameEn && a.nameEn.toLowerCase().includes(query)) ||
        localizedName.toLowerCase().includes(query) ||
        (a.badge && a.badge.toLowerCase().includes(query)) ||
        (a.category && a.category.toLowerCase().includes(query))
      );
    });
  }, [allAvailableBioAssets, isSearching, assetSearchQuery, activeBioCategory, isEn]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 170px)', minHeight: '560px', background: 'var(--bg-base)', position: 'relative' }}>
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        {/* Insert Elements Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Undo / Redo buttons */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-base)', padding: '2px', borderRadius: '6px' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={undo}
              disabled={historyIndex <= 0}
              title={t('analysis.slideStudio.undo', '元に戻す (Ctrl+Z)')}
              style={{ opacity: historyIndex <= 0 ? 0.35 : 1, padding: '4px 8px' }}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title={t('analysis.slideStudio.redo', 'やり直し (Ctrl+Y)')}
              style={{ opacity: historyIndex >= history.length - 1 ? 0.35 : 1, padding: '4px 8px' }}
            >
              <Redo2 size={16} />
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-default)', margin: '0 2px' }} />

          <button
            className="btn btn-sm btn-secondary"
            onClick={() => addElement('text')}
            title={t('analysis.slideStudio.addTextTooltip', 'テキストボックスを追加')}
          >
            <Type size={16} />
            <span>{t('analysis.slideStudio.text', 'テキスト')}</span>
          </button>

          {/* Basic Shapes */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-base)', padding: '2px', borderRadius: '6px' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('rect')} title={t('analysis.slideStudio.shapeRect', '四角形')}>
              <Square size={16} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('rounded_rect')} title={t('analysis.slideStudio.shapeRoundedRect', '角丸四角形')}>
              <Square size={16} style={{ borderRadius: '4px' }} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('circle')} title={t('analysis.slideStudio.shapeCircle', '円・楕円')}>
              <Circle size={16} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('triangle')} title={t('analysis.slideStudio.shapeTriangle', '三角形')}>
              <Triangle size={16} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('arrow_right')} title={t('analysis.slideStudio.shapeArrow', '矢印')}>
              <ArrowRight size={16} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('line')} title={t('analysis.slideStudio.shapeLine', '直線')}>
              <Minus size={16} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => addElement('curve')} title={t('analysis.slideStudio.shapeCurve', '曲線')}>
              <Spline size={16} />
            </button>
          </div>

          {/* Interactive Draw Curve Mode */}
          <button
            className={`btn btn-sm ${activeDrawTool === 'curve' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ gap: 6, fontWeight: 500 }}
            onClick={() => setActiveDrawTool(prev => (prev === 'curve' ? 'select' : 'curve'))}
            title={t('analysis.slideStudio.drawCurveTooltip', 'キャンバス上をドラッグして始点と終点を指定し、滑らかな曲線を描画')}
          >
            <Spline size={15} />
            <span>
              {activeDrawTool === 'curve'
                ? t('analysis.slideStudio.drawingCurve', '曲線描画中...')
                : t('analysis.slideStudio.drawCurve', '曲線を描画')}
            </span>
          </button>

          {/* Interactive Freehand Draw Mode */}
          <button
            className={`btn btn-sm ${activeDrawTool === 'freehand' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ gap: 6, fontWeight: 500 }}
            onClick={() => setActiveDrawTool(prev => (prev === 'freehand' ? 'select' : 'freehand'))}
            title={t('analysis.slideStudio.drawFreehandTooltip', 'キャンバス上をドラッグして手書き曲線をリアルタイム描画')}
          >
            <Pencil size={15} />
            <span>
              {activeDrawTool === 'freehand'
                ? t('analysis.slideStudio.drawingFreehand', 'フリーハンド中...')
                : t('analysis.slideStudio.drawFreehand', 'フリーハンド')}
            </span>
          </button>

          {/* 生命科学向け イラスト素材パレット起動ボタン */}
          <button
            className={`btn btn-sm ${isAssetPaletteOpen ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 600, gap: 6 }}
            onClick={() => setIsAssetPaletteOpen(!isAssetPaletteOpen)}
            title={t('analysis.slideStudio.bioPartsTooltip', '生命科学者向けの理化学・バイオイラスト素材パレットを開く')}
          >
            <Sparkles size={16} style={{ color: '#8b5cf6' }} />
            <span>{t('analysis.slideStudio.bioParts', 'バイオ・実験パーツ')}</span>
          </button>

          {/* Membrane Draw Mode with Style Selector */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', borderRadius: '6px', padding: '2px', border: isMembraneDrawMode ? '1px solid #ef4444' : '1px solid var(--border-default)' }}>
            <button
              className={`btn btn-sm ${isMembraneDrawMode ? 'btn-primary' : 'btn-ghost'}`}
              style={{ gap: 6, background: isMembraneDrawMode ? '#ef4444' : undefined, borderColor: isMembraneDrawMode ? '#b91c1c' : undefined }}
              onClick={() => setIsMembraneDrawMode(!isMembraneDrawMode)}
              title={t('analysis.slideStudio.drawMembraneTooltip', 'キャンバス上をドラッグしてリン脂質二重膜を描画')}
            >
              <PenTool size={15} />
              <span>{isMembraneDrawMode ? t('analysis.slideStudio.drawingMembrane', '膜を描画中...') : t('analysis.slideStudio.drawMembrane', '膜を描画')}</span>
            </button>
            <select
              className="form-select"
              style={{ padding: '2px 22px 2px 6px', fontSize: '11px', height: '26px', width: 'auto', background: 'transparent', border: 'none' }}
              value={membraneDrawStyle}
              onChange={e => {
                setMembraneDrawStyle(e.target.value as any);
                setIsMembraneDrawMode(true);
              }}
              title={t('analysis.slideStudio.membraneStyleTooltip', '描画する膜の形状（直線・S字曲線・湾曲アーチ・円形小胞）')}
            >
              <option value="straight">{t('analysis.slideStudio.membraneStraight', '直線')}</option>
              <option value="wave">{t('analysis.slideStudio.membraneWave', 'S字曲線')}</option>
              <option value="arc">{t('analysis.slideStudio.membraneArc', '湾曲アーチ')}</option>
              <option value="vesicle">{t('analysis.slideStudio.membraneVesicle', '円形小胞')}</option>
            </select>
          </div>

          {/* Image Insert */}
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            title={t('analysis.slideStudio.imageTooltip', '画像を挿入')}
          >
            <ImageIcon size={16} />
            <span>{t('analysis.slideStudio.image', '画像')}</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleImageUpload}
          />
        </div>

        {/* Presentation, Draft & PPTX Export Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Temporary Save Button */}
          <button
            className={`btn btn-sm ${saveStatus ? 'btn-success' : 'btn-secondary'}`}
            onClick={handleSaveDraft}
            title={t('analysis.slideStudio.saveDraftTooltip', '現在の全スライド・要素の編集内容をブラウザに一時保存')}
            style={{ fontWeight: 500, gap: 5 }}
          >
            <Save size={15} />
            <span>{saveStatus || t('analysis.slideStudio.saveDraft', '一時保存')}</span>
          </button>

          {/* Delete Current Slide */}
          <button
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--color-danger)', gap: 5 }}
            onClick={deleteCurrentSlide}
            title={t('analysis.slideStudio.deleteSlideTooltip', '現在選択されているスライドを削除')}
          >
            <Trash2 size={15} />
            <span>{t('analysis.slideStudio.deleteSlide', 'スライド削除')}</span>
          </button>

          {/* Reset / New presentation */}
          <button
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--text-secondary)', gap: 5 }}
            onClick={handleResetSlides}
            title={t('analysis.slideStudio.resetSlidesTooltip', 'スライドを初期化して白紙から新規作成')}
          >
            <RotateCcw size={15} />
            <span>{t('analysis.slideStudio.resetSlides', '新規初期化')}</span>
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border-default)', margin: '0 4px' }} />

          <button
            className="btn btn-sm btn-primary"
            onClick={exportToPptx}
            disabled={isExporting}
            style={{ fontWeight: 600, background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
            title={t('analysis.slideStudio.exportPptxTooltip', 'PowerPoint形式（.pptx）でダウンロード')}
          >
            <Download size={15} />
            <span>{isExporting ? t('analysis.slideStudio.exporting', 'エクスポート中...') : t('analysis.slideStudio.exportPptx', '.pptx 出力')}</span>
          </button>
        </div>
      </div>

      {/* Property Bar (active when elements are selected) */}
      {selectedElementIds.length > 0 && primarySelectedElement && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '6px 16px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-default)',
            fontSize: '12px',
            flexWrap: 'wrap'
          }}
        >
          {selectedElementIds.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {t('analysis.slideStudio.selectedObjectsCount', { count: selectedElementIds.length, defaultValue: `${selectedElementIds.length} 個のオブジェクトを選択中 (Ctrl併用)` })}
              </span>
              <button
                className="btn btn-sm btn-primary"
                style={{ padding: '3px 10px', fontSize: '11px', gap: 5 }}
                onClick={groupSelectedElements}
                title={t('analysis.slideStudio.groupObjectsTooltip', '選択した複数のオブジェクトを1つのグループにまとめます (Ctrl+G)')}
              >
                <Boxes size={14} />
                <span>{t('analysis.slideStudio.groupObjects', '1つにまとめる')}</span>
              </button>
            </div>
          )}

          {selectedElementIds.length === 1 && primarySelectedElement?.type === 'group' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {primarySelectedElement.groupName || t('analysis.slideStudio.groupObjects', 'グループ')} ({primarySelectedElement.elements?.length || 0}個の要素)
              </span>
              <button
                className="btn btn-sm btn-secondary"
                style={{ padding: '3px 10px', fontSize: '11px', gap: 5 }}
                onClick={ungroupSelectedElements}
                title={t('analysis.slideStudio.ungroupObjectsTooltip', 'グループを元の個別オブジェクトに分解します (Ctrl+Shift+G)')}
              >
                <Box size={14} />
                <span>{t('analysis.slideStudio.ungroupObjects', 'グループ解除')}</span>
              </button>
            </div>
          )}

          {primarySelectedElement.type === 'text' && (
            <>
              {/* Font Family selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.fontFamily', 'フォント:')}</span>
                <select
                  className="form-select"
                  style={{ padding: '2px 20px 2px 6px', fontSize: '11px', height: '26px', width: 'auto' }}
                  value={primarySelectedElement.fontFamily || 'Arial, sans-serif'}
                  onChange={e => updateSelectedElements({ fontFamily: e.target.value })}
                >
                  {FONT_OPTIONS.map(f => (
                    <option key={f.id} value={f.cssFamily}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.fontSize', 'サイズ:')}</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    updateSelectedElements({
                      fontSize: Math.max(10, (primarySelectedElement.fontSize || 18) - 2)
                    })
                  }
                >
                  -
                </button>
                <span style={{ fontWeight: 'bold' }}>{primarySelectedElement.fontSize || 18}</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    updateSelectedElements({
                      fontSize: Math.min(72, (primarySelectedElement.fontSize || 18) + 2)
                    })
                  }
                >
                  +
                </button>
              </div>

              {/* Bold, Italic, Underline */}
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  className={`btn btn-sm ${primarySelectedElement.bold ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => updateSelectedElements({ bold: !primarySelectedElement.bold })}
                >
                  <strong>B</strong>
                </button>
                <button
                  className={`btn btn-sm ${primarySelectedElement.italic ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => updateSelectedElements({ italic: !primarySelectedElement.italic })}
                >
                  <em>I</em>
                </button>
                <button
                  className={`btn btn-sm ${primarySelectedElement.underline ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => updateSelectedElements({ underline: !primarySelectedElement.underline })}
                >
                  <u>U</u>
                </button>
              </div>

              {/* Alignment */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-base)', padding: '2px', borderRadius: '4px' }}>
                <button
                  className={`btn btn-sm ${(primarySelectedElement.align || 'left') === 'left' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '3px 6px' }}
                  onClick={() => updateSelectedElements({ align: 'left' })}
                  title={t('analysis.slideStudio.alignLeft', '左揃え')}
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  className={`btn btn-sm ${primarySelectedElement.align === 'center' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '3px 6px' }}
                  onClick={() => updateSelectedElements({ align: 'center' })}
                  title={t('analysis.slideStudio.alignCenter', '中央揃え')}
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  className={`btn btn-sm ${primarySelectedElement.align === 'right' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '3px 6px' }}
                  onClick={() => updateSelectedElements({ align: 'right' })}
                  title={t('analysis.slideStudio.alignRight', '右揃え')}
                >
                  <AlignRight size={14} />
                </button>
              </div>

              {/* Superscript & Subscript */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-base)', padding: '2px', borderRadius: '4px' }}>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '3px 6px', fontWeight: 600, fontSize: '11px', gap: 2 }}
                  onClick={() => {
                    const sup = window.prompt(t('analysis.slideStudio.promptSuperscript', '上付き文字を入力してください (例: 2+, -1, 10):'));
                    if (sup !== null && sup !== '') {
                      updateSelectedElements({
                        text: (primarySelectedElement.text || '') + `<sup>${sup}</sup>`
                      });
                    }
                  }}
                  title={t('analysis.slideStudio.superscript', '上付き文字 (x²)')}
                >
                  <Superscript size={14} />
                  <span>x²</span>
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '3px 6px', fontWeight: 600, fontSize: '11px', gap: 2 }}
                  onClick={() => {
                    const sub = window.prompt(t('analysis.slideStudio.promptSubscript', '下付き文字を入力してください (例: 2, max, i):'));
                    if (sub !== null && sub !== '') {
                      updateSelectedElements({
                        text: (primarySelectedElement.text || '') + `<sub>${sub}</sub>`
                      });
                    }
                  }}
                  title={t('analysis.slideStudio.subscript', '下付き文字 (x₂)')}
                >
                  <Subscript size={14} />
                  <span>x₂</span>
                </button>
              </div>

              {/* Font Color */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.fontColor', '文字色:')}</span>
                <input
                  type="color"
                  value={primarySelectedElement.color || '#1e293b'}
                  onChange={e => updateSelectedElements({ color: e.target.value })}
                  style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                />
              </div>
            </>
          )}

          {primarySelectedElement.type !== 'text' && primarySelectedElement.type !== 'image' && (
            <>
              {primarySelectedElement.type !== 'line' && primarySelectedElement.type !== 'curve' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.fillColor', '塗り:')}</span>
                  <input
                    type="color"
                    value={primarySelectedElement.fill || '#3b82f6'}
                    onChange={e => updateSelectedElements({ fill: e.target.value })}
                    style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.strokeColor', '枠線 / 輪郭:')}</span>
                <input
                  type="color"
                  value={primarySelectedElement.stroke || '#1d4ed8'}
                  onChange={e => updateSelectedElements({ stroke: e.target.value })}
                  style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                />
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    updateSelectedElements({
                      strokeWidth: Math.max(1, (primarySelectedElement.strokeWidth || 2) - 1)
                    })
                  }
                >
                  -
                </button>
                <span>{primarySelectedElement.strokeWidth || 2}px</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    updateSelectedElements({
                      strokeWidth: Math.min(10, (primarySelectedElement.strokeWidth || 2) + 1)
                    })
                  }
                >
                  +
                </button>
              </div>

              {/* Curve Properties */}
              {primarySelectedElement.type === 'curve' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border-default)', paddingLeft: 10 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.curveStyle', '曲線の種類:')}</span>
                    <select
                      className="form-select"
                      style={{ padding: '2px 20px 2px 6px', fontSize: '11px', height: '26px', width: 'auto' }}
                      value={primarySelectedElement.curveStyle || 'arc'}
                      onChange={e => updateSelectedElements({ curveStyle: e.target.value as any })}
                    >
                      <option value="arc">{t('analysis.slideStudio.curveArc', '湾曲アーチ')}</option>
                      <option value="s_curve">{t('analysis.slideStudio.curveSCurve', 'S字曲線')}</option>
                      <option value="arrow_arc">{t('analysis.slideStudio.curveArrowArc', '曲線矢印')}</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.curvature', '湾曲度:')}</span>
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      step="5"
                      value={primarySelectedElement.curvature ?? 40}
                      onChange={e => updateSelectedElements({ curvature: Number(e.target.value) })}
                      style={{ width: '70px' }}
                    />
                    <span>{primarySelectedElement.curvature ?? 40}px</span>
                  </div>
                </>
              )}

              {/* Lipid Bilayer Properties */}
              {primarySelectedElement.type.startsWith('bio_lipid_bilayer') && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border-default)', paddingLeft: 10 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.membraneShape', '膜の形状:')}</span>
                    <select
                      className="form-select"
                      style={{ padding: '2px 20px 2px 6px', fontSize: '11px', height: '26px', width: 'auto' }}
                      value={primarySelectedElement.membraneStyle || (primarySelectedElement.type.includes('curve') ? 'wave' : primarySelectedElement.type.includes('arc') ? 'arc' : primarySelectedElement.type.includes('vesicle') ? 'vesicle' : 'straight')}
                      onChange={e => updateSelectedElements({ membraneStyle: e.target.value as any })}
                    >
                      <option value="straight">{t('analysis.slideStudio.membraneStraight', '直線')}</option>
                      <option value="wave">{t('analysis.slideStudio.membraneWave', 'S字曲線')}</option>
                      <option value="arc">{t('analysis.slideStudio.membraneArc', '湾曲アーチ')}</option>
                      <option value="vesicle">{t('analysis.slideStudio.membraneVesicle', '円形小胞')}</option>
                    </select>
                  </div>

                  {(primarySelectedElement.membraneStyle === 'wave' || primarySelectedElement.membraneStyle === 'arc' || primarySelectedElement.type.includes('curve') || primarySelectedElement.type.includes('arc')) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.curvature', '湾曲度:')}</span>
                      <input
                        type="range"
                        min="10"
                        max="80"
                        value={primarySelectedElement.curvature ?? 35}
                        onChange={e => updateSelectedElements({ curvature: Number(e.target.value) })}
                        style={{ width: '70px' }}
                      />
                      <span>{primarySelectedElement.curvature ?? 35}%</span>
                    </div>
                  )}
                </>
              )}

              {/* Monomer Receptor Head Selection */}
              {(primarySelectedElement.type === 'bio_receptor_monomer' || primarySelectedElement.type.startsWith('bio_receptor_m')) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border-default)', paddingLeft: 10 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.headShape', '頭部形状:')}</span>
                  <select
                    className="form-select"
                    style={{ padding: '2px 20px 2px 6px', fontSize: '11px', height: '26px', width: 'auto' }}
                    value={primarySelectedElement.receptorHeadA || 1}
                    onChange={e => updateSelectedElements({ receptorHeadA: Number(e.target.value) as any })}
                  >
                    {RECEPTOR_HEAD_TYPES.map(h => (
                      <option key={h.id} value={h.id}>
                        {isEn ? h.nameEn : h.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Dimer Receptor Subunits Head Selection */}
              {(primarySelectedElement.type === 'bio_receptor_dimer' || primarySelectedElement.type === 'bio_receptor_homo' || primarySelectedElement.type === 'bio_receptor_hetero') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border-default)', paddingLeft: 10 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.headA', '頭部A:')}</span>
                  <select
                    className="form-select"
                    style={{ padding: '2px 20px 2px 6px', fontSize: '11px', height: '26px', width: 'auto' }}
                    value={primarySelectedElement.receptorHeadA || 1}
                    onChange={e => updateSelectedElements({ receptorHeadA: Number(e.target.value) as any })}
                  >
                    {RECEPTOR_HEAD_TYPES.map(h => (
                      <option key={h.id} value={h.id}>
                        {isEn ? h.shortNameEn : h.shortName}
                      </option>
                    ))}
                  </select>

                  <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.headB', '頭部B:')}</span>
                  <select
                    className="form-select"
                    style={{ padding: '2px 20px 2px 6px', fontSize: '11px', height: '26px', width: 'auto' }}
                    value={primarySelectedElement.receptorHeadB || (primarySelectedElement.type === 'bio_receptor_hetero' ? 3 : 1)}
                    onChange={e => updateSelectedElements({ receptorHeadB: Number(e.target.value) as any })}
                  >
                    {RECEPTOR_HEAD_TYPES.map(h => (
                      <option key={h.id} value={h.id}>
                        {isEn ? h.shortNameEn : h.shortName}
                      </option>
                    ))}
                  </select>

                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      background:
                        (primarySelectedElement.receptorHeadA || 1) === (primarySelectedElement.receptorHeadB || (primarySelectedElement.type === 'bio_receptor_hetero' ? 3 : 1))
                          ? 'rgba(59, 130, 246, 0.2)'
                          : 'rgba(236, 72, 153, 0.2)',
                      color:
                        (primarySelectedElement.receptorHeadA || 1) === (primarySelectedElement.receptorHeadB || (primarySelectedElement.type === 'bio_receptor_hetero' ? 3 : 1))
                          ? '#3b82f6'
                          : '#ec4899'
                    }}
                  >
                    {(primarySelectedElement.receptorHeadA || 1) === (primarySelectedElement.receptorHeadB || (primarySelectedElement.type === 'bio_receptor_hetero' ? 3 : 1))
                      ? t('analysis.slideStudio.homodimer', 'ホモダイマー')
                      : t('analysis.slideStudio.heterodimer', 'ヘテロダイマー')}
                  </span>
                </div>
              )}
            </>
          )}

          {/* My Material & Local Save Actions + Layer ordering */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '11px', padding: '3px 10px', gap: 5 }}
              onClick={handleOpenRegisterModal}
              title={t('analysis.slideStudio.saveToMyMaterialsTooltip', 'オブジェクトをマイ素材パレットに登録していつでも再利用')}
            >
              <BookmarkPlus size={14} />
              <span>{t('analysis.slideStudio.saveToMyMaterials', 'マイ素材に登録')}</span>
            </button>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '11px', padding: '3px 10px', gap: 5 }}
              onClick={handleOpenSaveLocalModal}
              title={t('analysis.slideStudio.saveToLocalFileTooltip', 'SVG / PNG / JSONファイルとしてPCに保存')}
            >
              <FileDown size={14} />
              <span>{t('analysis.slideStudio.saveToLocalFile', 'PCに保存')}</span>
            </button>

            <div style={{ width: 1, height: 18, background: 'var(--border-default)', margin: '0 4px' }} />

            <button className="btn btn-sm btn-ghost" onClick={bringToFront} title={t('analysis.slideStudio.bringForwardTooltip', '最前面へ移動')}>
              <ChevronUp size={14} /> {t('analysis.slideStudio.bringForward', '前面')}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={sendToBack} title={t('analysis.slideStudio.sendBackwardTooltip', '最背面へ移動')}>
              <ChevronDown size={14} /> {t('analysis.slideStudio.sendBackward', '背面')}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={duplicateSelectedElements} title={t('analysis.slideStudio.duplicateTooltip', '複製 (Ctrl+D)')}>
              <Copy size={14} /> {t('analysis.slideStudio.duplicate', '複製')}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--color-danger)' }}
              onClick={deleteSelectedElements}
              title={t('analysis.slideStudio.deleteTooltip', '削除 (Delete)')}
            >
              <Trash2 size={14} /> {t('analysis.slideStudio.delete', '削除')}
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace (Thumbnails + Canvas + Optional Bio Drawer) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* Left Slide Thumbnails Strip */}
        <div
          style={{
            width: '160px',
            flexShrink: 0,
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 8px',
            gap: '8px',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('analysis.slideStudio.slideList', 'スライド一覧')}</span>
            <button className="btn btn-icon btn-sm btn-ghost" onClick={addSlide} title={t('analysis.slideStudio.addSlideTooltip', 'スライドを追加')}>
              <Plus size={16} />
            </button>
          </div>

          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              onClick={() => {
                setCurrentSlideIndex(idx);
                setSelectedElementIds([]);
              }}
              style={{
                width: '100%',
                aspectRatio: '16/9',
                background: slide.background || '#ffffff',
                border: idx === currentSlideIndex ? '2px solid var(--color-primary)' : '1px solid var(--border-default)',
                borderRadius: '6px',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: idx === currentSlideIndex ? '0 0 8px rgba(99, 102, 241, 0.4)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 4,
                  fontSize: '9px',
                  fontWeight: 'bold',
                  background: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  padding: '1px 4px',
                  borderRadius: 3
                }}
              >
                {idx + 1}
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                {t('analysis.slideStudio.elementsCount', { count: slide.elements.length, defaultValue: `${slide.elements.length} 要素` })}
              </span>
              <button
                className="btn btn-icon btn-sm"
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: '18px',
                  height: '18px',
                  padding: 0,
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: 'white',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={e => deleteSlideAtIndex(idx, e)}
                title={t('analysis.slideStudio.deleteSlideNumTooltip', { number: idx + 1, defaultValue: `スライド ${idx + 1} を削除` })}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--color-danger)', fontSize: '11px', justifyContent: 'flex-start', padding: '4px 6px', gap: 4 }}
              onClick={() => deleteSlideAtIndex(currentSlideIndex)}
              title={t('analysis.slideStudio.deleteSlideTooltip', '現在選択されているスライドを削除')}
            >
              <Trash2 size={12} />
              <span>{t('analysis.slideStudio.deleteThisSlide', 'このスライドを削除')}</span>
            </button>
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--text-secondary)', fontSize: '11px', justifyContent: 'flex-start', padding: '4px 6px', gap: 4 }}
              onClick={handleResetSlides}
              title={t('analysis.slideStudio.resetSlidesTooltip', 'スライドを初期化して白紙から新規作成')}
            >
              <RotateCcw size={12} />
              <span>{t('analysis.slideStudio.resetAllSlides', 'スライド全初期化')}</span>
            </button>
          </div>
        </div>

        {/* Center Canvas Viewport Container */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {/* Scrollable Viewport */}
          <div
            ref={viewportRef}
            style={{
              flex: 1,
              display: 'flex',
              overflow: 'auto',
              background: 'var(--bg-base)',
              padding: '24px',
              minWidth: 0,
              minHeight: 0,
              cursor: activeDrawTool !== 'select' ? 'crosshair' : 'default'
            }}
            onMouseDown={handleCanvasBackgroundMouseDown}
            onMouseUp={handleCanvasBackgroundMouseUp}
            onWheel={handleWheelZoom}
          >
            {/* Scaled Canvas Wrapper - Sized to visual dimensions so scrollbars fit perfectly */}
            <div
              style={{
                width: `${Math.round(CANVAS_WIDTH * canvasScale)}px`,
                height: `${Math.round(CANVAS_HEIGHT * canvasScale)}px`,
                margin: 'auto',
                position: 'relative',
                flexShrink: 0,
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
                borderRadius: '8px',
                transition: 'width 0.12s ease, height 0.12s ease'
              }}
            >
              <div
                ref={canvasRef}
                data-canvas-bg="true"
                style={{
                  width: `${CANVAS_WIDTH}px`,
                  height: `${CANVAS_HEIGHT}px`,
                  transform: `scale(${canvasScale})`,
                  transformOrigin: 'top left',
                  backgroundColor: currentSlide?.background || '#ffffff',
                  borderRadius: '8px',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  overflow: 'hidden'
                }}
              >
                {currentSlide?.elements.map(renderElement)}

                {/* Drawing guideline when drawing membrane */}
                {activeDrawTool === 'membrane' && drawStartPos && currentDrawPos && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.min(drawStartPos.x, currentDrawPos.x)}px`,
                      top: `${Math.min(drawStartPos.y, currentDrawPos.y) - (membraneDrawStyle === 'straight' ? 40 : 55)}px`,
                      width: `${Math.max(20, Math.abs(currentDrawPos.x - drawStartPos.x))}px`,
                      height: `${membraneDrawStyle === 'vesicle' ? Math.max(20, Math.abs(currentDrawPos.x - drawStartPos.x)) : (membraneDrawStyle === 'straight' ? 80 : 110)}px`,
                      border: '2px dashed #ef4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: membraneDrawStyle === 'vesicle' ? '50%' : '4px',
                      pointerEvents: 'none',
                      zIndex: 9999
                    }}
                  />
                )}

                {/* Live preview when drawing two-point curve */}
                {activeDrawTool === 'curve' && drawStartPos && currentDrawPos && (
                  <svg
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 9999
                    }}
                  >
                    <line
                      x1={drawStartPos.x}
                      y1={drawStartPos.y}
                      x2={currentDrawPos.x}
                      y2={currentDrawPos.y}
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="6,4"
                    />
                    <circle cx={drawStartPos.x} cy={drawStartPos.y} r={6} fill="#3b82f6" stroke="#ffffff" strokeWidth={2} />
                    <circle cx={currentDrawPos.x} cy={currentDrawPos.y} r={6} fill="#f59e0b" stroke="#ffffff" strokeWidth={2} />
                  </svg>
                )}

                {/* Live preview when drawing freehand curves */}
                {isDrawingFreehand && freehandPoints.length > 0 && (
                  <svg
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 9999
                    }}
                  >
                    <path
                      d={pointsToSmoothSvgPath(freehandPoints)}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Floating Zoom & Scale Controls (Pinned to Bottom-Right of Canvas Area) */}
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              background: 'rgba(30, 41, 59, 0.92)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--border-default)',
              borderRadius: '24px',
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              zIndex: 50,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
              userSelect: 'none'
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <button
              className="btn btn-icon btn-sm btn-ghost"
              style={{ width: 26, height: 26, padding: 0 }}
              onClick={handleZoomOut}
              title={t('analysis.slideStudio.zoomOut', '縮小 (-10%)')}
            >
              <ZoomOut size={14} />
            </button>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                minWidth: '40px',
                textAlign: 'center',
                cursor: 'pointer'
              }}
              onClick={() => {
                setZoomMode('custom');
                setCanvasScale(1.0);
              }}
              title={t('analysis.slideStudio.resetZoom', 'クリックして等倍 (100%) に設定')}
            >
              {Math.round(canvasScale * 100)}%
            </span>
            <button
              className="btn btn-icon btn-sm btn-ghost"
              style={{ width: 26, height: 26, padding: 0 }}
              onClick={handleZoomIn}
              title={t('analysis.slideStudio.zoomIn', '拡大 (+10%)')}
            >
              <ZoomIn size={14} />
            </button>
            <div style={{ width: 1, height: 14, background: 'var(--border-default)', margin: '0 4px' }} />
            <button
              className={`btn btn-sm ${zoomMode === 'fit' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                height: 24,
                gap: 4,
                lineHeight: 1
              }}
              onClick={() => {
                setZoomMode('fit');
                autoFitCanvas();
              }}
              title={t('analysis.slideStudio.fitToScreen', 'ウィンドウに合わせて全体表示 (Fit)')}
            >
              <Maximize size={12} />
              <span>{t('analysis.slideStudio.fit', '全体表示')}</span>
            </button>
          </div>
        </div>

        {/* 生命科学向け イラスト素材パレット Drawer (Categorized) */}
        {isAssetPaletteOpen && (
          <div
            style={{
              width: isPaletteExpanded ? '580px' : '400px',
              flexShrink: 0,
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100,
              boxShadow: 'var(--shadow-xl)',
              animation: 'slideInRight 0.2s ease',
              transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-default)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}>
                <Sparkles size={18} style={{ color: '#8b5cf6' }} />
                <span>{t('analysis.slideStudio.paletteTitle', '生命科学向け イラスト素材パレット')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={() => setIsPaletteExpanded(!isPaletteExpanded)}
                  title={isPaletteExpanded ? t('analysis.slideStudio.collapsePalette', 'パレットを縮小 (2列)') : t('analysis.slideStudio.expandPalette', 'パレットを広げる (3列)')}
                >
                  {isPaletteExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={() => setIsAssetPaletteOpen(false)}
                  title={t('common.close', '閉じる')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Custom Asset Upload Action */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-base)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ flex: 1, fontSize: '11px', gap: 6, justifyContent: 'center' }}
                  onClick={() => customAssetInputRef.current?.click()}
                  title={t('analysis.slideStudio.addCustomImageTooltip', '自前の画像（PNG, JPG, SVG等）をマイ素材としてパレットに追加')}
                >
                  <Upload size={13} style={{ color: 'var(--color-primary)' }} />
                  <span>{t('analysis.slideStudio.addCustomImage', '画像追加')}</span>
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ flex: 1, fontSize: '11px', gap: 6, justifyContent: 'center' }}
                  onClick={() => importMaterialInputRef.current?.click()}
                  title={t('analysis.slideStudio.importFileTooltip', 'PCのSVG、JSON、または画像ファイルをマイ素材にインポート')}
                >
                  <FolderInput size={13} style={{ color: 'var(--color-secondary)' }} />
                  <span>{t('analysis.slideStudio.importFile', 'インポート')}</span>
                </button>
              </div>
              <input
                type="file"
                ref={customAssetInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleCustomAssetUpload}
              />
              <input
                type="file"
                ref={importMaterialInputRef}
                style={{ display: 'none' }}
                accept=".svg,.json,image/*"
                onChange={handleImportMaterialFile}
              />
            </div>

            {/* Search & Filter Header */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('analysis.slideStudio.searchPlaceholder', 'パーツを検索 (例: DNA, マウス, 細胞)...')}
                  value={assetSearchQuery}
                  onChange={e => setAssetSearchQuery(e.target.value)}
                  style={{ paddingLeft: 30, paddingRight: assetSearchQuery ? 28 : 12, fontSize: '12px', width: '100%' }}
                />
                {assetSearchQuery && (
                  <button
                    onClick={() => setAssetSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 8,
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title={t('analysis.slideStudio.clearSearch', '検索をクリア')}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {isSearching && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>
                    {t('analysis.slideStudio.searchResults', '「{{query}}」の検索結果: {{count}}件', { query: assetSearchQuery, count: filteredBioAssets.length })}
                  </span>
                  <button
                    onClick={() => setAssetSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                  >
                    {t('analysis.slideStudio.showAll', '全表示に戻す')}
                  </button>
                </div>
              )}
            </div>

            {/* 5 Category Tabs with Counts */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--bg-base)'
              }}
            >
              {BIO_CATEGORIES.map(cat => {
                const count = categoryCounts[cat.id] ?? 0;
                const isActive = !isSearching && activeBioCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveBioCategory(cat.id as BioCategory);
                      if (assetSearchQuery) setAssetSearchQuery('');
                    }}
                    style={{
                      padding: '8px 2px',
                      fontSize: '10px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                      background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      transition: 'all 0.15s ease'
                    }}
                    title={isEn ? cat.labelEn : cat.label}
                  >
                    <span style={{ fontSize: '14px' }}>{cat.icon}</span>
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                        fontSize: '10px'
                      }}
                    >
                      {isEn ? cat.labelEn : cat.label}
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '9999px',
                        background: isActive ? 'var(--color-primary)' : 'var(--bg-surface-hover)',
                        color: isActive ? '#ffffff' : 'var(--text-tertiary)',
                        lineHeight: 1.2
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Assets Grid */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: isPaletteExpanded ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                gap: '12px'
              }}
            >
              {filteredBioAssets.length === 0 && (
                <div style={{ gridColumn: isPaletteExpanded ? 'span 3' : 'span 2', padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {activeBioCategory === 'custom' && !isSearching ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <p>{t('analysis.slideStudio.noCustomAssets', '登録された自前画像がありません')}</p>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: '11px', gap: 6 }}
                        onClick={() => customAssetInputRef.current?.click()}
                      >
                        <Upload size={13} />
                        <span>{t('analysis.slideStudio.uploadImage', '画像を登録する')}</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {t('analysis.slideStudio.noMatchingParts', '該当するパーツが見つかりません')}
                      </p>
                      {isSearching && (
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ marginTop: 8, fontSize: '11px' }}
                          onClick={() => setAssetSearchQuery('')}
                        >
                          {t('analysis.slideStudio.clearSearch', '検索条件をクリア')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {filteredBioAssets.map(asset => (
                <div
                  key={asset.type}
                  onClick={() => addElement(asset.type)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    padding: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.35)';
                    const previewEl = e.currentTarget.querySelector('.asset-preview-inner') as HTMLElement;
                    if (previewEl) previewEl.style.transform = 'scale(1.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                    const previewEl = e.currentTarget.querySelector('.asset-preview-inner') as HTMLElement;
                    if (previewEl) previewEl.style.transform = 'none';
                  }}
                  title={t('analysis.slideStudio.clickToInsert', 'クリックしてスライドに挿入: ') + getBioAssetName(asset, isEn)}
                >
                  {/* High-Contrast Light Viewport Container */}
                  <div
                    style={{
                      width: '100%',
                      height: '110px',
                      background: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.04)'
                    }}
                  >
                    {/* Badge (e.g. TIFF/PNG, 自前画像, SVG) */}
                    {asset.badge && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          fontSize: '9px',
                          padding: '2px 5px',
                          borderRadius: '4px',
                          background: asset.badge.includes('TIFF')
                            ? 'rgba(5, 150, 105, 0.9)'
                            : asset.category === 'custom'
                            ? 'rgba(99, 102, 241, 0.9)'
                            : 'rgba(30, 41, 59, 0.85)',
                          color: '#ffffff',
                          fontWeight: 700,
                          lineHeight: 1.2,
                          letterSpacing: '0.02em',
                          zIndex: 3,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}
                      >
                        {asset.badge}
                      </span>
                    )}

                    {/* Action buttons for custom assets (Download & Delete) */}
                    {asset.category === 'custom' && (
                      <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 3, zIndex: 4 }}>
                        <button
                          onClick={e => handleDownloadSingleAsset(asset, e)}
                          style={{
                            width: '22px',
                            height: '22px',
                            padding: 0,
                            background: 'rgba(59, 130, 246, 0.9)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }}
                          title={t('analysis.slideStudio.downloadAssetTooltip', 'PCに保存 (SVG)')}
                        >
                          <FileDown size={11} />
                        </button>
                        <button
                          onClick={e => deleteCustomAsset(asset.type, e)}
                          style={{
                            width: '22px',
                            height: '22px',
                            padding: 0,
                            background: 'rgba(239, 68, 68, 0.9)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }}
                          title={t('analysis.slideStudio.deleteCustomAsset', 'このマイ素材を削除')}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}

                    {/* The SVG / Image rendering container */}
                    <div
                      className="asset-preview-inner"
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        filter: asset.isImage ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' : undefined
                      }}
                    >
                      {asset.renderSvg(asset.defaultFill, asset.defaultStroke, asset.defaultWidth, asset.defaultHeight)}
                    </div>
                  </div>

                  {/* Asset Name and Details */}
                  <div style={{ marginTop: '8px', padding: '0 2px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: '1.35',
                        wordBreak: 'break-word'
                      }}
                    >
                      {getBioAssetName(asset, isEn)}
                    </span>
                    {isSearching && (
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {BIO_CATEGORIES.find(c => c.id === asset.category)?.label || asset.category}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Membrane Quick Action in Cells category */}
            {activeBioCategory === 'cells' && (
              <div style={{ padding: '12px', borderTop: '1px solid var(--border-default)', background: 'rgba(239, 68, 68, 0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  {t('analysis.slideStudio.dragDrawMembrane', 'ドラッグで細胞膜を描画:')}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 4px' }}
                    onClick={() => {
                      setMembraneDrawStyle('straight');
                      setIsMembraneDrawMode(true);
                      setIsAssetPaletteOpen(false);
                    }}
                  >
                    {t('analysis.slideStudio.drawStraight', '直線膜')}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 4px' }}
                    onClick={() => {
                      setMembraneDrawStyle('wave');
                      setIsMembraneDrawMode(true);
                      setIsAssetPaletteOpen(false);
                    }}
                  >
                    {t('analysis.slideStudio.drawWave', 'S字曲線膜')}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 4px' }}
                    onClick={() => {
                      setMembraneDrawStyle('arc');
                      setIsMembraneDrawMode(true);
                      setIsAssetPaletteOpen(false);
                    }}
                  >
                    {t('analysis.slideStudio.drawArc', '湾曲アーチ膜')}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 4px' }}
                    onClick={() => {
                      setMembraneDrawStyle('vesicle');
                      setIsMembraneDrawMode(true);
                      setIsAssetPaletteOpen(false);
                    }}
                  >
                    {t('analysis.slideStudio.drawVesicle', '小胞/ベシクル')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right Settings Panel (Slide Background & Guide) */}
        {!isAssetPaletteOpen && (
          <div
            style={{
              width: '180px',
              flexShrink: 0,
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-default)',
              padding: '16px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontSize: '12px'
            }}
          >
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                {t('analysis.slideStudio.slideBgColor', 'スライド背景色')}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {['#ffffff', '#f8fafc', '#f1f5f9', '#0f172a', '#1e293b', '#1e1b4b', '#064e3b', '#000000'].map(bg => (
                  <button
                    key={bg}
                    onClick={() => {
                      setSlides(prev =>
                        prev.map((s, idx) => (idx === currentSlideIndex ? { ...s, background: bg } : s))
                      );
                    }}
                    style={{
                      width: '28px',
                      height: '28px',
                      backgroundColor: bg,
                      border: currentSlide?.background === bg ? '2px solid var(--color-primary)' : '1px solid #cbd5e1',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                    title={bg}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', background: 'var(--bg-base)', padding: '10px', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>{t('analysis.slideStudio.tipsTitle', '💡 操作ヒント')}</strong>
              {t('analysis.slideStudio.tipClick', '• クリック: 選択維持')}<br />
              {t('analysis.slideStudio.tipCtrlClick', '• Ctrl+クリック: 複数同時選択')}<br />
              {t('analysis.slideStudio.tipDrag', '• ドラッグ: 移動 (複数同時可)')}<br />
              {t('analysis.slideStudio.tipResize', '• 枠の四隅: リサイズ')}<br />
              {t('analysis.slideStudio.tipDblClick', '• Wクリック: テキスト編集 / グループ解除')}<br />
              {t('analysis.slideStudio.tipDelete', '• Delete: 要素一括削除')}<br />
              {t('analysis.slideStudio.tipDuplicate', '• Ctrl+D: 要素一括複製')}<br />
              • Ctrl+G: まとめる / Ctrl+Shift+G: 解除<br />
              {t('analysis.slideStudio.tipArrowKeys', '• 矢印キー: 微調整')}
            </div>
          </div>
        )}
      </div>

      {/* Modal: マイ素材に登録 (Register to My Materials) */}
      {isRegisterModalOpen && registerModalTarget && (
        <div className="modal-overlay" onClick={() => setIsRegisterModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookmarkPlus size={18} style={{ color: 'var(--color-primary)' }} />
                <span>{t('analysis.slideStudio.registerModalTitle', 'マイ素材に登録')}</span>
              </h3>
              <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setIsRegisterModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: '16px' }}>
              {/* Preview Box */}
              <div
                style={{
                  width: '100%',
                  height: '160px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: getElementSvgString(registerModalTarget, true, customAssets)
                  }}
                />
              </div>

              {/* Material Name */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  {t('analysis.slideStudio.materialName', '素材名')}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={registerMaterialName}
                  onChange={e => setRegisterMaterialName(e.target.value)}
                  placeholder={t('analysis.slideStudio.materialNamePlaceholder', '例: 受容体複合体, カスタム分子...')}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmRegisterToMyMaterials();
                    }
                  }}
                />
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-base)',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  lineHeight: 1.5
                }}
              >
                {t(
                  'analysis.slideStudio.registerModalDesc',
                  '登録した素材は「素材パレット」の「マイ素材」タブに保存され、いつでもスライドへ挿入できます。'
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsRegisterModalOpen(false)}>
                {t('common.cancel', 'キャンセル')}
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmRegisterToMyMaterials}
                disabled={!registerMaterialName.trim()}
              >
                <BookmarkPlus size={15} />
                <span>{t('common.save', '登録する')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: PCに保存 (ローカルファイル書き出し) */}
      {isSaveLocalModalOpen && saveLocalModalTarget && (
        <div className="modal-overlay" onClick={() => setIsSaveLocalModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileDown size={18} style={{ color: 'var(--color-primary)' }} />
                <span>{t('analysis.slideStudio.saveLocalModalTitle', 'PCに保存 (ローカルファイル書き出し)')}</span>
              </h3>
              <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setIsSaveLocalModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: '16px' }}>
              {/* Preview Box */}
              <div
                style={{
                  width: '100%',
                  height: '160px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: getElementSvgString(saveLocalModalTarget, true, customAssets)
                  }}
                />
              </div>

              {/* File Name */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  {t('analysis.slideStudio.fileName', 'ファイル名')}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={saveLocalFilename}
                  onChange={e => setSaveLocalFilename(e.target.value)}
                  placeholder="slide-object"
                  autoFocus
                />
              </div>

              {/* Format selection */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  {t('analysis.slideStudio.fileFormat', '保存形式')}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 12px',
                      background: saveLocalFormat === 'svg' ? 'var(--color-primary-dim)' : 'var(--bg-base)',
                      border: `1px solid ${saveLocalFormat === 'svg' ? 'var(--color-primary)' : 'var(--border-default)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="saveFormat"
                      value="svg"
                      checked={saveLocalFormat === 'svg'}
                      onChange={() => setSaveLocalFormat('svg')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ fontSize: '13px' }}>SVG (.svg)</strong>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                        {t('analysis.slideStudio.formatSvg', 'ベクター画像 (拡大しても鮮明、Illustrator等と互換)')}
                      </p>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 12px',
                      background: saveLocalFormat === 'png' ? 'var(--color-primary-dim)' : 'var(--bg-base)',
                      border: `1px solid ${saveLocalFormat === 'png' ? 'var(--color-primary)' : 'var(--border-default)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="saveFormat"
                      value="png"
                      checked={saveLocalFormat === 'png'}
                      onChange={() => setSaveLocalFormat('png')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ fontSize: '13px' }}>PNG (.png)</strong>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                        {t('analysis.slideStudio.formatPng', '透過ラスター画像 (論文・スライド貼り付け用 2倍高解像度)')}
                      </p>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 12px',
                      background: saveLocalFormat === 'json' ? 'var(--color-primary-dim)' : 'var(--bg-base)',
                      border: `1px solid ${saveLocalFormat === 'json' ? 'var(--color-primary)' : 'var(--border-default)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="saveFormat"
                      value="json"
                      checked={saveLocalFormat === 'json'}
                      onChange={() => setSaveLocalFormat('json')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ fontSize: '13px' }}>LabFlow JSON (.json)</strong>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                        {t('analysis.slideStudio.formatJson', '再インポート可能な素材データ (グループ構造を完全保持)')}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsSaveLocalModalOpen(false)}>
                {t('common.cancel', 'キャンセル')}
              </button>
              <button className="btn btn-primary" onClick={executeExportToLocalFile}>
                <FileDown size={15} />
                <span>{t('analysis.slideStudio.downloadFile', '保存 (ダウンロード)')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
