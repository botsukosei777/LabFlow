import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import UTIF from 'utif';
import {
  Circle, MousePointer, Crosshair, Trash2, Download, Plus, X, Save,
  FolderOpen, RefreshCw, Image as ImageIcon, Settings, Eye, EyeOff,
  ChevronDown, FileText, Upload, Palette, Layers, Bookmark, ZoomIn, ZoomOut, Maximize2, Undo2, Sparkles, CheckSquare, Square,
  Map as MapIcon, Grid, Move, Check, Sliders, PlusCircle, ArrowRightLeft
} from 'lucide-react';
import {
  ImagePlacement, BlendMode, ImageGroup, DetectionParams, DEFAULT_DETECTION_PARAMS,
  calculateGridPlacements, analyzeObjectsAndGroupImages, calculatePlacementsFromGroups,
  renderStitchedCanvas, normalizePlacements, GROUP_COLORS, ObjectFeature,
  detectObjectsWithMask, DetailedDetectionResult, createDownscaledGrayscale, estimateImageBackgroundPolarity
} from '../../utils/imageStitching';

// ─── Types ───
interface LabelDef {
  id: string;
  name: string;
  color: string;
}

interface PointType {
  id: string;
  name: string;
  color: string;
  shortcut: string;
}

interface AnnotationPresetSet {
  id: string;
  name: string;
  labels: LabelDef[];
  pointTypes: PointType[];
  isCustom?: boolean;
}

interface PointMarker {
  x: number;
  y: number;
  typeId: string;
}

interface Region {
  id: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  labelId: string;
  points: PointMarker[];
  imageKey: string;
  isFullImage?: boolean;
}

interface ImageData {
  blob: Blob;
  url: string;
  brightness: number;
  name: string;
}

interface SessionData {
  sessionName: string;
  savedAt: string;
  labels: LabelDef[];
  pointTypes: PointType[];
  regions: Region[];
  nextRoiId: number;
  imageNames: string[];
  imageBrightness: Record<string, number>;
}

type ToolMode = 'select' | 'circle' | 'point';

const getDefaultPresetSets = (): AnnotationPresetSet[] => [
  {
    id: 'ps_colony',
    name: i18n.t('analysis.imageProcessor.presets.colony', 'コロニーカウント・判定'),
    labels: [
      { id: 'l1', name: i18n.t('analysis.imageProcessor.labels.positive', '陽性'), color: '#22C55E' },
      { id: 'l2', name: i18n.t('analysis.imageProcessor.labels.negative', '陰性'), color: '#EF4444' },
      { id: 'l3', name: i18n.t('analysis.imageProcessor.labels.unknown', '不明'), color: '#9CA3AF' },
    ],
    pointTypes: [
      { id: 'pt1', name: i18n.t('analysis.imageProcessor.pointTypes.typeA', 'タイプ A (赤)'), color: '#EF4444', shortcut: '1' },
      { id: 'pt2', name: i18n.t('analysis.imageProcessor.pointTypes.typeB', 'タイプ B (緑)'), color: '#22C55E', shortcut: '2' },
      { id: 'pt3', name: i18n.t('analysis.imageProcessor.pointTypes.typeC', 'タイプ C (青)'), color: '#3B82F6', shortcut: '3' },
      { id: 'pt4', name: i18n.t('analysis.imageProcessor.pointTypes.typeD', 'タイプ D (黄)'), color: '#F59E0B', shortcut: '4' },
    ]
  },
  {
    id: 'ps_fluorescence',
    name: i18n.t('analysis.imageProcessor.presets.fluorescence', '蛍光免疫染色 (DAPI/GFP/RFP)'),
    labels: [
      { id: 'l1', name: i18n.t('analysis.imageProcessor.labels.expressed', '発現あり'), color: '#22C55E' },
      { id: 'l2', name: i18n.t('analysis.imageProcessor.labels.notExpressed', '発現なし'), color: '#EF4444' },
      { id: 'l3', name: i18n.t('analysis.imageProcessor.labels.control', 'コントロール'), color: '#9CA3AF' },
    ],
    pointTypes: [
      { id: 'pt1', name: i18n.t('analysis.imageProcessor.pointTypes.dapi', 'DAPI 核 (青)'), color: '#3B82F6', shortcut: '1' },
      { id: 'pt2', name: i18n.t('analysis.imageProcessor.pointTypes.gfp', 'GFP シグナル (緑)'), color: '#22C55E', shortcut: '2' },
      { id: 'pt3', name: i18n.t('analysis.imageProcessor.pointTypes.rfp', 'RFP シグナル (赤)'), color: '#EF4444', shortcut: '3' },
      { id: 'pt4', name: i18n.t('analysis.imageProcessor.pointTypes.coloc', '共局在/マージ (黄)'), color: '#F59E0B', shortcut: '4' },
    ]
  },
  {
    id: 'ps_cell_cycle',
    name: i18n.t('analysis.imageProcessor.presets.cellCycle', '細胞形態・細胞周期分類'),
    labels: [
      { id: 'l1', name: i18n.t('analysis.imageProcessor.labels.healthy', '健常細胞'), color: '#22C55E' },
      { id: 'l2', name: i18n.t('analysis.imageProcessor.labels.apoptosis', 'アポトーシス'), color: '#EF4444' },
      { id: 'l3', name: i18n.t('analysis.imageProcessor.labels.abnormal', '異常形態'), color: '#F59E0B' },
    ],
    pointTypes: [
      { id: 'pt1', name: i18n.t('analysis.imageProcessor.pointTypes.interphase', '間期 (赤)'), color: '#EF4444', shortcut: '1' },
      { id: 'pt2', name: i18n.t('analysis.imageProcessor.pointTypes.proMetaphase', '分裂期 前・中期 (緑)'), color: '#22C55E', shortcut: '2' },
      { id: 'pt3', name: i18n.t('analysis.imageProcessor.pointTypes.anaTelophase', '分裂期 後・終期 (青)'), color: '#3B82F6', shortcut: '3' },
      { id: 'pt4', name: i18n.t('analysis.imageProcessor.pointTypes.deadCell', '死細胞 (黄)'), color: '#F59E0B', shortcut: '4' },
    ]
  }
];

const DEFAULT_PRESET_SETS: AnnotationPresetSet[] = getDefaultPresetSets();

const LABELS_STORAGE_KEY = 'labflow_image_labels_preset';
const POINT_TYPES_STORAGE_KEY = 'labflow_image_point_types_preset';
const PRESET_SETS_STORAGE_KEY = 'labflow_image_preset_sets';
const STORAGE_KEY = 'labflow_image_sessions';

function getInitialSessionName(tFn: (key: string, def?: string) => string) {
  const now = new Date();
  const prefix = tFn('analysis.imageProcessor.defaultSessionPrefix', '計測');
  return `${prefix} ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// ─── IndexedDB Helper for Storing Loaded Images ───
const IDB_NAME = 'LabFlowImageDB';
const IDB_VERSION = 1;
const IDB_STORE = 'cached_images';

function openImageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveImagesToDB(items: { name: string; blob: Blob; brightness: number }[]): Promise<void> {
  try {
    const db = await openImageDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to save images to IndexedDB:', e);
  }
}

async function loadImagesFromDB(): Promise<{ name: string; blob: Blob; brightness: number }[]> {
  try {
    const db = await openImageDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to load images from IndexedDB:', e);
    return [];
  }
}

async function clearImagesFromDB(): Promise<void> {
  try {
    const db = await openImageDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
  } catch (e) {}
}

function reindexPointTypes(types: PointType[]): PointType[] {
  return types.map((pt, idx) => ({
    ...pt,
    shortcut: String(idx + 1 <= 9 ? idx + 1 : '')
  }));
}

// ─── Helper: Convert Canvas to TIFF Blob using UTIF ───
function canvasToTiffBlob(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context not available');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgba = new Uint8Array(imgData.data.buffer);
  const tiffBuffer = UTIF.encodeImage(rgba, canvas.width, canvas.height);
  return new Blob([tiffBuffer], { type: 'image/tiff' });
}

// ─── Helper: Convert TIFF or regular Blob/File to displayable URL & TIFF Blob ───
async function processImageBlob(blob: Blob, name: string): Promise<{ url: string; blob: Blob }> {
  const isTiff = /\.(tiff?|tif)$/i.test(name) || blob.type === 'image/tiff';
  if (isTiff) {
    const buffer = await blob.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) throw new Error(i18n.t('analysis.imageProcessor.invalidTiff', '無効なTIFFファイルです'));
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const width = ifds[0].width;
    const height = ifds[0].height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context could not be created');
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);

    const displayBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(i18n.t('analysis.imageProcessor.tiffConvertFailed', 'TIFF変換に失敗しました')));
      }, 'image/png');
    });

    return { url: URL.createObjectURL(displayBlob), blob };
  }
  return { url: URL.createObjectURL(blob), blob };
}

async function processImageFile(file: File): Promise<{ url: string; blob: Blob }> {
  return processImageBlob(file, file.name);
}

interface DragState {
  type: 'move' | 'resize-e' | 'resize-w' | 'resize-n' | 'resize-s' | 'resize-corner';
  regionId: number;
  startX: number;
  startY: number;
  origCx: number;
  origCy: number;
  origRx: number;
  origRy: number;
  origPoints: PointMarker[];
}

interface HandleHit {
  regionId: number;
  handle: 'e' | 'w' | 'n' | 's' | 'corner';
}

export default function ImageProcessor() {
  const { t } = useTranslation();

  // ─── Preset Sets State ───
  const [presetSets, setPresetSets] = useState<AnnotationPresetSet[]>(() => {
    try {
      const saved = localStorage.getItem(PRESET_SETS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [...DEFAULT_PRESET_SETS];
  });
  const [selectedPresetSetId, setSelectedPresetSetId] = useState<string>('ps_colony');

  const getPresetSetName = (ps: AnnotationPresetSet) => {
    if (ps.isCustom) return ps.name;
    if (ps.id === 'ps_colony' || ps.name === 'コロニーカウント・判定' || ps.name === 'Colony Count & Classification') {
      return t('analysis.imageProcessor.presets.colony', 'コロニーカウント・判定');
    }
    if (ps.id === 'ps_fluorescence' || ps.name.includes('蛍光免疫染色') || ps.name.includes('Immunofluorescence')) {
      return t('analysis.imageProcessor.presets.fluorescence', '蛍光免疫染色 (DAPI/GFP/RFP)');
    }
    if (ps.id === 'ps_cell_cycle' || ps.name.includes('細胞形態') || ps.name.includes('Cell Morphology')) {
      return t('analysis.imageProcessor.presets.cellCycle', '細胞形態・細胞周期分類');
    }
    return ps.name;
  };

  const getLabelDisplayName = (labelName?: string) => {
    if (!labelName) return t('analysis.imageProcessor.unassigned', '未設定');
    switch (labelName) {
      case '陽性':
      case 'Positive':
        return t('analysis.imageProcessor.labels.positive', labelName);
      case '陰性':
      case 'Negative':
        return t('analysis.imageProcessor.labels.negative', labelName);
      case '不明':
      case 'Unknown':
        return t('analysis.imageProcessor.labels.unknown', labelName);
      case '発現あり':
      case 'Expressed':
        return t('analysis.imageProcessor.labels.expressed', labelName);
      case '発現なし':
      case 'Not Expressed':
        return t('analysis.imageProcessor.labels.notExpressed', labelName);
      case 'コントロール':
      case 'Control':
        return t('analysis.imageProcessor.labels.control', labelName);
      case '健常細胞':
      case 'Healthy Cells':
        return t('analysis.imageProcessor.labels.healthy', labelName);
      case 'アポトーシス':
      case 'Apoptosis':
        return t('analysis.imageProcessor.labels.apoptosis', labelName);
      case '異常形態':
      case 'Abnormal Morphology':
        return t('analysis.imageProcessor.labels.abnormal', labelName);
      case '未設定':
      case 'Unassigned':
        return t('analysis.imageProcessor.unassigned', labelName);
      default:
        return labelName;
    }
  };

  const getPointTypeDisplayName = (ptName?: string) => {
    if (!ptName) return '';
    switch (ptName) {
      case 'タイプ A (赤)':
      case 'Type A (Red)':
        return t('analysis.imageProcessor.pointTypes.typeA', ptName);
      case 'タイプ B (緑)':
      case 'Type B (Green)':
        return t('analysis.imageProcessor.pointTypes.typeB', ptName);
      case 'タイプ C (青)':
      case 'Type C (Blue)':
        return t('analysis.imageProcessor.pointTypes.typeC', ptName);
      case 'タイプ D (黄)':
      case 'Type D (Yellow)':
        return t('analysis.imageProcessor.pointTypes.typeD', ptName);
      case 'DAPI 核 (青)':
      case 'DAPI Nucleus (Blue)':
        return t('analysis.imageProcessor.pointTypes.dapi', ptName);
      case 'GFP シグナル (緑)':
      case 'GFP Signal (Green)':
        return t('analysis.imageProcessor.pointTypes.gfp', ptName);
      case 'RFP シグナル (赤)':
      case 'RFP Signal (Red)':
        return t('analysis.imageProcessor.pointTypes.rfp', ptName);
      case '共局在/マージ (黄)':
      case 'Colocalization/Merge (Yellow)':
        return t('analysis.imageProcessor.pointTypes.coloc', ptName);
      case '間期 (赤)':
      case 'Interphase (Red)':
        return t('analysis.imageProcessor.pointTypes.interphase', ptName);
      case '分裂期 前・中期 (緑)':
      case 'Pro/Metaphase (Green)':
        return t('analysis.imageProcessor.pointTypes.proMetaphase', ptName);
      case '分裂期 後・終期 (青)':
      case 'Ana/Telophase (Blue)':
        return t('analysis.imageProcessor.pointTypes.anaTelophase', ptName);
      case '死細胞 (黄)':
      case 'Dead Cells (Yellow)':
        return t('analysis.imageProcessor.pointTypes.deadCell', ptName);
      default:
        return ptName;
    }
  };
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [newPresetSetName, setNewPresetSetName] = useState('');

  // ─── Preset Persistent State (Labels & Point Types) ───
  const [labels, setLabels] = useState<LabelDef[]>(() => {
    try {
      const saved = localStorage.getItem(LABELS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [...DEFAULT_PRESET_SETS[0].labels];
  });

  const [pointTypes, setPointTypes] = useState<PointType[]>(() => {
    try {
      const saved = localStorage.getItem(POINT_TYPES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return reindexPointTypes(parsed);
      }
    } catch {}
    return [...DEFAULT_PRESET_SETS[0].pointTypes];
  });

  const [activePointTypeId, setActivePointTypeId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(POINT_TYPES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch {}
    return 'pt1';
  });

  // Auto-save labels, pointTypes, presetSets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(labels));
    } catch (e) {
      console.error('Failed to save labels to localStorage:', e);
    }
  }, [labels]);

  useEffect(() => {
    try {
      localStorage.setItem(POINT_TYPES_STORAGE_KEY, JSON.stringify(pointTypes));
    } catch (e) {
      console.error('Failed to save pointTypes to localStorage:', e);
    }
  }, [pointTypes]);

  useEffect(() => {
    try {
      localStorage.setItem(PRESET_SETS_STORAGE_KEY, JSON.stringify(presetSets));
    } catch (e) {
      console.error('Failed to save presetSets to localStorage:', e);
    }
  }, [presetSets]);

  // Synchronize preset set names and labels/pointTypes when language changes
  useEffect(() => {
    setPresetSets(prev => prev.map(ps => {
      if (ps.isCustom) return ps;
      return { ...ps, name: getPresetSetName(ps) };
    }));

    const currentSet = presetSets.find(ps => ps.id === selectedPresetSetId);
    if (!currentSet || !currentSet.isCustom) {
      const defaults = getDefaultPresetSets();
      const defFound = defaults.find(d => d.id === selectedPresetSetId);
      if (defFound) {
        setLabels([...defFound.labels]);
        const reindexed = reindexPointTypes(defFound.pointTypes);
        setPointTypes(reindexed);
      }
    }
  }, [i18n.language]);

  // ─── Session State ───
  const [sessionName, setSessionName] = useState(() => getInitialSessionName(t));
  const [regions, setRegions] = useState<Region[]>([]);
  const [history, setHistory] = useState<Region[][]>([]);

  const saveHistorySnapshot = useCallback(() => {
    setRegions(current => {
      setHistory(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(current))]);
      return current;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const lastSnapshot = prev[prev.length - 1];
      setRegions(lastSnapshot);
      setSelectedRegionId(null);
      return prev.slice(0, -1);
    });
  }, []);

  // ─── Image State ───
  const [images, setImages] = useState<ImageData[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState<number>(-1);
  const [refImageIndices, setRefImageIndices] = useState<number[]>([]);
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);

  // ─── Tool State ───
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string>('default');
  const [showLabelSettings, setShowLabelSettings] = useState(false);
  const [showPointSettings, setShowPointSettings] = useState(false);
  const [showSavedSessions, setShowSavedSessions] = useState(false);

  // New item inputs
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366F1');
  const [newPointTypeName, setNewPointTypeName] = useState('');
  const [newPointTypeColor, setNewPointTypeColor] = useState('#8B5CF6');

  // ─── Canvas Drawing State ───
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // ─── Refs ───
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const refImgRefs = useRef<(HTMLImageElement | null)[]>([null, null, null]);

  // ─── Restore Cached Images on Mount ───
  useEffect(() => {
    let isMounted = true;
    loadImagesFromDB().then(async saved => {
      if (!isMounted || !saved || saved.length === 0) return;
      const loaded: ImageData[] = [];
      for (const s of saved) {
        try {
          const res = await processImageBlob(s.blob, s.name);
          loaded.push({
            blob: res.blob,
            url: res.url,
            brightness: s.brightness || 0,
            name: s.name
          });
        } catch (e) {
          console.error(`Failed to process cached image ${s.name}:`, e);
          loaded.push({
            blob: s.blob,
            url: URL.createObjectURL(s.blob),
            brightness: s.brightness || 0,
            name: s.name
          });
        }
      }
      if (isMounted) {
        setImages(loaded);
        if (loaded.length > 0) setActiveImageIdx(0);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // ─── Derived ───
  const activeImage = activeImageIdx >= 0 ? images[activeImageIdx] : null;
  const currentRegions = useMemo(() => {
    if (!activeImage) return [];
    return regions.filter(r => r.imageKey === activeImage.name);
  }, [regions, activeImage]);

  // ─── Keyboard Shortcuts for Point Types ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= pointTypes.length) {
        setActivePointTypeId(pointTypes[num - 1].id);
        setToolMode('point');
        return;
      }

      const matched = pointTypes.find(pt => pt.shortcut === e.key);
      if (matched) {
        setActivePointTypeId(matched.id);
        setToolMode('point');
      } else if (e.key.toLowerCase() === 's') {
        setToolMode('select');
      } else if (e.key.toLowerCase() === 'c') {
        setToolMode('circle');
      } else if (e.key.toLowerCase() === 'p') {
        setToolMode('point');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pointTypes, handleUndo]);

  // ─── Apply Preset Set ───
  const handleSelectPresetSet = (setId: string) => {
    setSelectedPresetSetId(setId);
    const found = presetSets.find(ps => ps.id === setId);
    if (!found) return;

    if (!found.isCustom) {
      const defaults = getDefaultPresetSets();
      const defFound = defaults.find(d => d.id === setId);
      if (defFound) {
        setLabels([...defFound.labels]);
        const reindexed = reindexPointTypes(defFound.pointTypes);
        setPointTypes(reindexed);
        if (reindexed.length > 0) setActivePointTypeId(reindexed[0].id);
        return;
      }
    }

    setLabels([...found.labels]);
    const reindexed = reindexPointTypes(found.pointTypes);
    setPointTypes(reindexed);
    if (reindexed.length > 0) {
      setActivePointTypeId(reindexed[0].id);
    }
  };

  const handleSaveCurrentAsPresetSet = () => {
    if (!newPresetSetName.trim()) return;
    const newSet: AnnotationPresetSet = {
      id: `ps_${Date.now()}`,
      name: newPresetSetName.trim(),
      labels: [...labels],
      pointTypes: [...pointTypes],
      isCustom: true
    };
    setPresetSets(prev => [...prev, newSet]);
    setSelectedPresetSetId(newSet.id);
    setNewPresetSetName('');
    setShowSavePresetModal(false);
  };

  const handleDeletePresetSet = (setId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('analysis.imageProcessor.confirmDeletePreset', 'このプリセットセットを削除しますか？'))) return;
    setPresetSets(prev => prev.filter(ps => ps.id !== setId));
    if (selectedPresetSetId === setId && presetSets.length > 0) {
      setSelectedPresetSetId(presetSets[0].id);
    }
  };

  // ─── Image Loading (with TIFF Support & IndexedDB Cache) ───
  const handleDirectorySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoadingImages(true);
    try {
      const imgFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (/\.(png|jpe?g|tiff?|webp|bmp|gif)$/i.test(f.name)) {
          imgFiles.push(f);
        }
      }
      imgFiles.sort((a, b) => a.name.localeCompare(b.name));

      const newImages: ImageData[] = [];
      for (const f of imgFiles) {
        try {
          const res = await processImageFile(f);
          newImages.push({
            blob: res.blob,
            url: res.url,
            brightness: 0,
            name: f.name
          });
        } catch (err) {
          console.error(`Error loading image ${f.name}:`, err);
        }
      }

      setImages(prev => {
        prev.forEach(img => URL.revokeObjectURL(img.url));
        return newImages;
      });
      if (newImages.length > 0) setActiveImageIdx(0);
      else setActiveImageIdx(-1);
      setRefImageIdx(-1);

      // Save to IndexedDB
      await saveImagesToDB(newImages.map(img => ({ name: img.name, blob: img.blob, brightness: 0 })));
    } finally {
      setLoadingImages(false);
    }
  };

  const handleFilesDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    setLoadingImages(true);
    try {
      const newImages: ImageData[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (/\.(png|jpe?g|tiff?|webp|bmp|gif)$/i.test(f.name)) {
          try {
            const res = await processImageFile(f);
            newImages.push({
              blob: res.blob,
              url: res.url,
              brightness: 0,
              name: f.name
            });
          } catch (err) {
            console.error(`Error loading image ${f.name}:`, err);
          }
        }
      }
      if (newImages.length === 0) return;
      const combined = [...images, ...newImages];
      setImages(combined);
      if (activeImageIdx < 0) setActiveImageIdx(0);

      // Update IndexedDB
      await saveImagesToDB(combined.map(img => ({ name: img.name, blob: img.blob, brightness: img.brightness })));
    } finally {
      setLoadingImages(false);
    }
  }, [images, activeImageIdx]);

  const handleClearImages = async () => {
    if (images.length > 0 && !confirm(t('analysis.imageProcessor.confirmClearImages', '読み込んだ画像リストをクリアしますか？'))) return;
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
    setActiveImageIdx(-1);
    setRefImageIndices([]);
    await clearImagesFromDB();
  };

  const handleAddRefImage = () => {
    if (refImageIndices.length >= 3) {
      alert(t('analysis.imageProcessor.alertMaxRefImages', '参照画像は最大3枚まで配置できます。'));
      return;
    }
    // Pick the first image that isn't already active or in reference list
    const candidateIdx = images.findIndex((_, idx) => idx !== activeImageIdx && !refImageIndices.includes(idx));
    const nextIdx = candidateIdx >= 0 ? candidateIdx : (images.length > 0 ? 0 : -1);
    if (nextIdx >= 0) {
      setRefImageIndices(prev => [...prev, nextIdx]);
    } else {
      setRefImageIndices(prev => [...prev, 0]);
    }
  };

  const handleRemoveRefImage = (slotIdx: number) => {
    setRefImageIndices(prev => prev.filter((_, i) => i !== slotIdx));
  };

  const handleSetRefImageIndex = (slotIdx: number, newImgIdx: number) => {
    setRefImageIndices(prev => {
      const updated = [...prev];
      updated[slotIdx] = newImgIdx;
      return updated;
    });
  };

  // ─── Region ID Display Helper ───
  const getRegionIdDisplay = useCallback((r: Region) => {
    if (r.isFullImage) {
      const imgIdx = images.findIndex(img => img.name === r.imageKey);
      if (imgIdx >= 0) {
        return `FullImage${imgIdx + 1}`;
      }
      const fullRegions = regions.filter(reg => reg.isFullImage);
      const fullIdx = fullRegions.findIndex(reg => reg.id === r.id);
      const num = fullIdx >= 0 ? fullIdx + 1 : (Math.abs(r.id) || 1);
      return `FullImage${num}`;
    }
    return `#${r.id}`;
  }, [images, regions]);

  // ─── Canvas Drawing ───
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imgRef.current;
    if (!img || !img.complete) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${1 + activeImage.brightness / 100})`;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';

    // Calculate dynamic visual scale so that UI elements (points, text captions, handles, borders)
    // stay at a fixed, comfortable physical size on the user's screen regardless of zoom level or natural image resolution.
    const rect = canvas.getBoundingClientRect();
    const scale = (rect && rect.width > 0) ? canvas.width / rect.width : (1 / Math.max(0.01, zoomLevel));

    // Screen-constant physical sizes in canvas coordinates:
    const ptRadius = Math.max(1.5, 5 * scale); // ~5px on screen
    const ptStrokeWidth = Math.max(0.5, 1.5 * scale); // ~1.5px on screen
    const roiLineWidth = Math.max(1, 2 * scale); // ~2px on screen
    const roiSelectedLineWidth = Math.max(1.5, 3 * scale); // ~3px on screen
    const handleRadius = Math.max(2, 6 * scale); // ~6px on screen
    const handleStrokeWidth = Math.max(1, 2 * scale); // ~2px on screen

    // Font and badge metrics
    const baseFontSizeScreen = 13; // 13px on screen
    const fontSize = Math.max(3, baseFontSizeScreen * scale);
    const padX = 6 * scale;
    const padY = 3 * scale;
    const offsetTop = 6 * scale;

    // Draw regions
    currentRegions.forEach(region => {
      const label = labels.find(l => l.id === region.labelId);
      const color = label?.color || '#6366F1';
      const isSelected = selectedRegionId === region.id;

      if (region.isFullImage) {
        // Draw points directly across the full image
        region.points.forEach(pt => {
          const ptType = pointTypes.find(t => t.id === pt.typeId) || pointTypes[0];
          const ptColor = ptType?.color || '#EF4444';

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, ptRadius, 0, Math.PI * 2);
          ctx.fillStyle = ptColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = ptStrokeWidth;
          ctx.stroke();
        });

        // Top-left summary badge for full image points if any
        if (region.points.length > 0) {
          ctx.font = `bold ${fontSize}px sans-serif`;
          const idText = getRegionIdDisplay(region);
          const labelText = label ? ` [${getLabelDisplayName(label.name)}]` : '';
          const totalCountText = ` (${region.points.length} pts)`;
          const fullText = idText + labelText + totalCountText;
          const textWidth = ctx.measureText(fullText).width;

          const badgeX = 8 * scale;
          const badgeY = 8 * scale;
          const badgeH = fontSize + padY * 2;
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(badgeX, badgeY, textWidth + padX * 2, badgeH);
          ctx.fillStyle = label ? color : '#34D399';
          ctx.fillText(fullText, badgeX + padX, badgeY + fontSize);
        }
        return;
      }

      // Circle
      ctx.beginPath();
      ctx.ellipse(region.cx, region.cy, region.rx, region.ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? roiSelectedLineWidth : roiLineWidth;
      ctx.stroke();
      ctx.fillStyle = `${color}15`;
      ctx.fill();

      // Header Text (Fixed screen-size caption)
      ctx.font = `bold ${fontSize}px sans-serif`;
      const idText = `#${region.id}`;
      const labelText = label ? ` ${getLabelDisplayName(label.name)}` : '';
      const totalCountText = t('analysis.imageProcessor.totalCountText', { count: region.points.length, defaultValue: ` (計${region.points.length}点)` });
      const fullText = idText + labelText + totalCountText;
      const textWidth = ctx.measureText(fullText).width;

      const tx = region.cx - region.rx;
      const ty = region.cy - region.ry - offsetTop;

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(tx - padX / 2, ty - fontSize, textWidth + padX, fontSize + padY * 2);
      ctx.fillStyle = color;
      ctx.fillText(fullText, tx, ty);

      // Points
      region.points.forEach(pt => {
        const ptType = pointTypes.find(t => t.id === pt.typeId) || pointTypes[0];
        const ptColor = ptType?.color || '#EF4444';

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, ptRadius, 0, Math.PI * 2);
        ctx.fillStyle = ptColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = ptStrokeWidth;
        ctx.stroke();
      });

      // Resize handles if selected
      if (isSelected) {
        const diagFactor = 0.7071;
        const handles = [
          { x: region.cx + region.rx, y: region.cy },
          { x: region.cx - region.rx, y: region.cy },
          { x: region.cx, y: region.cy + region.ry },
          { x: region.cx, y: region.cy - region.ry },
          { x: region.cx + region.rx * diagFactor, y: region.cy - region.ry * diagFactor },
          { x: region.cx - region.rx * diagFactor, y: region.cy - region.ry * diagFactor },
          { x: region.cx + region.rx * diagFactor, y: region.cy + region.ry * diagFactor },
          { x: region.cx - region.rx * diagFactor, y: region.cy + region.ry * diagFactor },
        ];
        handles.forEach(h => {
          ctx.beginPath();
          ctx.arc(h.x, h.y, handleRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = handleStrokeWidth;
          ctx.stroke();
        });
      }
    });

    // Draw preview circle while drawing
    if (isDrawing && drawStart && drawCurrent) {
      const cx = (drawStart.x + drawCurrent.x) / 2;
      const cy = (drawStart.y + drawCurrent.y) / 2;
      const rx = Math.abs(drawCurrent.x - drawStart.x) / 2;
      const ry = Math.abs(drawCurrent.y - drawStart.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#6366F1';
      ctx.lineWidth = roiLineWidth;
      ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [activeImage, currentRegions, labels, pointTypes, selectedRegionId, isDrawing, drawStart, drawCurrent, getRegionIdDisplay, zoomLevel]);

  // ─── Fit to Screen Helper ───
  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || img.naturalWidth === 0 || img.naturalHeight === 0) return;

    const usableW = Math.max(100, container.clientWidth - 40);
    const usableH = Math.max(100, container.clientHeight - 40);

    const scaleX = usableW / img.naturalWidth;
    const scaleY = usableH / img.naturalHeight;
    const optimalScale = Math.min(scaleX, scaleY);

    // Allow downscaling down to 0.01 (1%) for giant stitched maps so they always fit perfectly
    const clamped = Math.max(0.01, Math.min(10.0, Number(optimalScale.toFixed(3))));
    setZoomLevel(clamped);
  }, []);

  // Load image when active changes
  useEffect(() => {
    if (!activeImage) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Auto-fit smaller or oversized images for comfortable viewing
      const container = containerRef.current;
      if (container && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const usableW = Math.max(100, container.clientWidth - 40);
        const usableH = Math.max(100, container.clientHeight - 40);
        const scaleX = usableW / img.naturalWidth;
        const scaleY = usableH / img.naturalHeight;
        const fitScale = Math.min(scaleX, scaleY);

        // Always auto-fit images so huge stitched maps fit into normal window without requiring fullscreen
        if (fitScale < 0.95 || fitScale > 1.25) {
          const autoZoom = Math.max(0.01, Math.min(10.0, Number(fitScale.toFixed(3))));
          setZoomLevel(autoZoom);
        } else {
          setZoomLevel(1);
        }
      }
      drawCanvas();
    };
    img.src = activeImage.url;
  }, [activeImage?.url]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Reference image drawing (up to 3 images)
  const drawSingleRefCanvas = useCallback((slotIdx: number, imgIdx: number) => {
    const canvas = refCanvasRefs.current[slotIdx];
    const targetImage = images[imgIdx];
    if (!canvas || !targetImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = refImgRefs.current[slotIdx];
    if (!img || !img.complete) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${1 + targetImage.brightness / 100})`;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
  }, [images]);

  // Load and draw reference images
  useEffect(() => {
    refImageIndices.forEach((imgIdx, slotIdx) => {
      const targetImage = images[imgIdx];
      if (!targetImage) {
        refImgRefs.current[slotIdx] = null;
        return;
      }
      const img = new Image();
      img.onload = () => {
        refImgRefs.current[slotIdx] = img;
        drawSingleRefCanvas(slotIdx, imgIdx);
      };
      img.src = targetImage.url;
    });
  }, [refImageIndices, images, drawSingleRefCanvas]);

  // Re-draw all active reference canvases when brightness or layout changes
  useEffect(() => {
    refImageIndices.forEach((imgIdx, slotIdx) => {
      drawSingleRefCanvas(slotIdx, imgIdx);
    });
  }, [refImageIndices, images, drawSingleRefCanvas]);

  // ─── Canvas Mouse Handlers ───
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const findHandleAt = (x: number, y: number): HandleHit | null => {
    if (!selectedRegionId) return null;
    const region = currentRegions.find(r => r.id === selectedRegionId && !r.isFullImage);
    if (!region) return null;

    const diagFactor = 0.7071;
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    const scale = rect && rect.width > 0 ? canvas!.width / rect.width : 1;
    const hitRadius = Math.max(16, 16 * scale);

    const handles: { handle: HandleHit['handle']; x: number; y: number }[] = [
      { handle: 'e', x: region.cx + region.rx, y: region.cy },
      { handle: 'w', x: region.cx - region.rx, y: region.cy },
      { handle: 's', x: region.cx, y: region.cy + region.ry },
      { handle: 'n', x: region.cx, y: region.cy - region.ry },
      { handle: 'corner', x: region.cx + region.rx * diagFactor, y: region.cy - region.ry * diagFactor },
      { handle: 'corner', x: region.cx - region.rx * diagFactor, y: region.cy - region.ry * diagFactor },
      { handle: 'corner', x: region.cx + region.rx * diagFactor, y: region.cy + region.ry * diagFactor },
      { handle: 'corner', x: region.cx - region.rx * diagFactor, y: region.cy + region.ry * diagFactor },
    ];

    for (const h of handles) {
      const dist = Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2);
      if (dist <= hitRadius) {
        return { regionId: region.id, handle: h.handle };
      }
    }
    return null;
  };

  const findRegionAt = (x: number, y: number, tolerance = 1.0): Region | null => {
    // If a circular region is currently selected, check if click is inside it first
    if (selectedRegionId) {
      const sel = currentRegions.find(r => r.id === selectedRegionId && !r.isFullImage);
      if (sel && sel.rx > 0 && sel.ry > 0) {
        const dx = (x - sel.cx) / sel.rx;
        const dy = (y - sel.cy) / sel.ry;
        if (dx * dx + dy * dy <= tolerance * tolerance) return sel;
      }
    }
    // Otherwise check from topmost circular region downwards
    for (let i = currentRegions.length - 1; i >= 0; i--) {
      const r = currentRegions[i];
      if (r.isFullImage || r.rx <= 0 || r.ry <= 0) continue;
      const dx = (x - r.cx) / r.rx;
      const dy = (y - r.cy) / r.ry;
      if (dx * dx + dy * dy <= tolerance * tolerance) return r;
    }
    return null;
  };

  const findPointAt = (x: number, y: number): { regionId: number; pointIdx: number } | null => {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    const scale = rect && rect.width > 0 ? canvas!.width / rect.width : 1;
    const hitRadius = Math.max(6, 12 * scale);

    for (const r of currentRegions) {
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i];
        const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
        if (dist <= hitRadius) return { regionId: r.id, pointIdx: i };
      }
    }
    return null;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    // POINT MODE: Click inside a circle ROI adds to that ROI; click outside/without ROI adds to full-image count
    if (toolMode === 'point') {
      if (!activeImage) return;
      const targetRegion = findRegionAt(x, y, 1.05); // 1.05 tolerance to reliably capture near-perimeter clicks
      if (targetRegion) {
        saveHistorySnapshot();
        setRegions(prev => prev.map(r =>
          r.id === targetRegion.id
            ? { ...r, points: [...r.points, { x, y, typeId: activePointTypeId }] }
            : r
        ));
        setSelectedRegionId(targetRegion.id);
      } else {
        saveHistorySnapshot();
        const fullId = -1 * (images.findIndex(img => img.name === activeImage.name) + 1 || 1);
        setRegions(prev => {
          const existingFull = prev.find(r => r.imageKey === activeImage.name && r.isFullImage);
          if (existingFull) {
            return prev.map(r =>
              r.id === existingFull.id
                ? { ...r, points: [...r.points, { x, y, typeId: activePointTypeId }] }
                : r
            );
          } else {
            const newFullRegion: Region = {
              id: fullId,
              cx: 0,
              cy: 0,
              rx: 0,
              ry: 0,
              labelId: '',
              points: [{ x, y, typeId: activePointTypeId }],
              imageKey: activeImage.name,
              isFullImage: true
            };
            return [...prev, newFullRegion];
          }
        });
        setSelectedRegionId(fullId);
      }
      return;
    }

    // CIRCLE MODE: Start drawing new circle
    if (toolMode === 'circle') {
      setIsDrawing(true);
      setDrawStart({ x, y });
      setDrawCurrent({ x, y });
      return;
    }

    // SELECT MODE:
    // 1. Check handles for active region (priority for resize)
    const handleHit = findHandleAt(x, y);
    if (handleHit) {
      const region = currentRegions.find(r => r.id === handleHit.regionId && !r.isFullImage);
      if (region) {
        saveHistorySnapshot();
        setDragState({
          type: `resize-${handleHit.handle}` as any,
          regionId: region.id,
          startX: x,
          startY: y,
          origCx: region.cx,
          origCy: region.cy,
          origRx: region.rx,
          origRy: region.ry,
          origPoints: [...region.points]
        });
        return;
      }
    }

    // 2. Check points
    const pointHit = findPointAt(x, y);
    if (pointHit) {
      setSelectedRegionId(pointHit.regionId);
      return;
    }

    // 3. Check region body
    const region = findRegionAt(x, y);
    if (region) {
      saveHistorySnapshot();
      setSelectedRegionId(region.id);
      setDragState({
        type: 'move',
        regionId: region.id,
        startX: x,
        startY: y,
        origCx: region.cx,
        origCy: region.cy,
        origRx: region.rx,
        origRy: region.ry,
        origPoints: [...region.points]
      });
    } else {
      setSelectedRegionId(null);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (isDrawing) {
      setDrawCurrent({ x, y });
      return;
    }

    if (dragState) {
      const dx = x - dragState.startX;
      const dy = y - dragState.startY;

      setRegions(prev => prev.map(r => {
        if (r.id !== dragState.regionId) return r;

        if (dragState.type === 'move') {
          const newCx = dragState.origCx + dx;
          const newCy = dragState.origCy + dy;
          const newPoints = dragState.origPoints.map(p => ({
            ...p,
            x: p.x + dx,
            y: p.y + dy
          }));
          return { ...r, cx: newCx, cy: newCy, points: newPoints };
        }

        if (dragState.type === 'resize-e' || dragState.type === 'resize-w') {
          const newRx = Math.max(5, Math.abs(x - dragState.origCx));
          return { ...r, rx: newRx };
        }
        if (dragState.type === 'resize-s' || dragState.type === 'resize-n') {
          const newRy = Math.max(5, Math.abs(y - dragState.origCy));
          return { ...r, ry: newRy };
        }
        if (dragState.type === 'resize-corner') {
          const newRx = Math.max(5, Math.abs(x - dragState.origCx) / 0.7071);
          const newRy = Math.max(5, Math.abs(y - dragState.origCy) / 0.7071);
          return { ...r, rx: newRx, ry: newRy };
        }

        return r;
      }));
      return;
    }

    // Cursor hover update in select mode
    if (toolMode === 'select') {
      const handleHit = findHandleAt(x, y);
      if (handleHit) {
        if (handleHit.handle === 'e' || handleHit.handle === 'w') setHoverCursor('ew-resize');
        else if (handleHit.handle === 'n' || handleHit.handle === 's') setHoverCursor('ns-resize');
        else setHoverCursor('nwse-resize');
      } else if (selectedRegionId && findRegionAt(x, y)?.id === selectedRegionId) {
        setHoverCursor('move');
      } else if (findRegionAt(x, y)) {
        setHoverCursor('pointer');
      } else {
        setHoverCursor('default');
      }
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragState) {
      setDragState(null);
    }

    if (isDrawing && drawStart && drawCurrent) {
      const cx = (drawStart.x + drawCurrent.x) / 2;
      const cy = (drawStart.y + drawCurrent.y) / 2;
      const rx = Math.abs(drawCurrent.x - drawStart.x) / 2;
      const ry = Math.abs(drawCurrent.y - drawStart.y) / 2;

      if (rx > 5 && ry > 5 && activeImage) {
        saveHistorySnapshot();
        const nonFullRegions = regions.filter(r => !r.isFullImage);
        const newId = nonFullRegions.length + 1;
        const newRegion: Region = {
          id: newId,
          cx, cy, rx, ry,
          labelId: '',
          points: [],
          imageKey: activeImage.name,
          isFullImage: false
        };
        setRegions(prev => [...prev, newRegion]);
        setSelectedRegionId(newId);
      }

      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const pointHit = findPointAt(x, y);
    if (pointHit) {
      saveHistorySnapshot();
      setRegions(prev => prev.map(r =>
        r.id === pointHit.regionId
          ? { ...r, points: r.points.filter((_, i) => i !== pointHit.pointIdx) }
          : r
      ));
    }
  };

  // ─── Region Actions ───
  const handleDeleteRegion = (id: number) => {
    saveHistorySnapshot();
    setRegions(prev => {
      const remaining = prev.filter(r => r.id !== id);
      // Strictly re-index remaining circular regions 1..N
      let circleIdx = 1;
      return remaining.map((r) => {
        if (r.isFullImage) return r;
        return {
          ...r,
          id: circleIdx++
        };
      });
    });
    setSelectedRegionId(null);
  };

  const handleSetLabel = (regionId: number, labelId: string) => {
    setRegions(prev => prev.map(r => r.id === regionId ? { ...r, labelId } : r));
  };

  // ─── Label Management ───
  const addLabel = () => {
    if (!newLabelName.trim()) return;
    const id = `l${Date.now()}`;
    setLabels(prev => [...prev, { id, name: newLabelName.trim(), color: newLabelColor }]);
    setNewLabelName('');
  };

  const removeLabel = (id: string) => {
    setLabels(prev => prev.filter(l => l.id !== id));
    setRegions(prev => prev.map(r => r.labelId === id ? { ...r, labelId: '' } : r));
  };

  // ─── Point Type Management ───
  const addPointType = () => {
    if (!newPointTypeName.trim()) return;
    const id = `pt${Date.now()}`;
    const newTypes = reindexPointTypes([
      ...pointTypes,
      {
        id,
        name: newPointTypeName.trim(),
        color: newPointTypeColor,
        shortcut: ''
      }
    ]);
    setPointTypes(newTypes);
    setNewPointTypeName('');
  };

  const removePointType = (id: string) => {
    if (pointTypes.length <= 1) {
      alert(t('analysis.imageProcessor.alertMinOnePointType', '最低1つの点タイプが必要です。'));
      return;
    }
    const remaining = reindexPointTypes(pointTypes.filter(p => p.id !== id));
    setPointTypes(remaining);
    if (activePointTypeId === id && remaining.length > 0) {
      setActivePointTypeId(remaining[0].id);
    }
  };

  // ─── Brightness ───
  const handleBrightnessChange = (val: number) => {
    if (activeImageIdx < 0) return;
    setImages(prev => prev.map((img, i) => i === activeImageIdx ? { ...img, brightness: val } : img));
  };

  const handleRefBrightnessChange = (targetImgIdx: number, val: number) => {
    if (targetImgIdx < 0) return;
    setImages(prev => prev.map((img, i) => i === targetImgIdx ? { ...img, brightness: val } : img));
  };

  // ─── Session Save / Load ───
  const saveSession = () => {
    const data: SessionData = {
      sessionName,
      savedAt: new Date().toISOString(),
      labels,
      pointTypes,
      regions,
      nextRoiId: regions.length + 1,
      imageNames: images.map(i => i.name),
      imageBrightness: Object.fromEntries(images.map(i => [i.name, i.brightness]))
    };
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as SessionData[];
    const existingIdx = stored.findIndex(s => s.sessionName === sessionName);
    if (existingIdx >= 0) stored[existingIdx] = data;
    else stored.push(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    alert(t('analysis.imageProcessor.alertSessionSaved', { name: sessionName, defaultValue: `「${sessionName}」を一時保存しました。` }));
  };

  const getSavedSessions = (): SessionData[] => {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  };

  const loadSession = (session: SessionData) => {
    setSessionName(session.sessionName);
    if (session.labels) setLabels(session.labels);
    if (session.pointTypes) setPointTypes(reindexPointTypes(session.pointTypes));
    setRegions(session.regions);
    setImages(prev => prev.map(img => ({
      ...img,
      brightness: session.imageBrightness[img.name] ?? img.brightness
    })));
    setShowSavedSessions(false);
    setSelectedRegionId(null);
  };

  const deleteSavedSession = (name: string) => {
    const stored = getSavedSessions().filter(s => s.sessionName !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setShowSavedSessions(false);
    setTimeout(() => setShowSavedSessions(true), 10);
  };

  // ─── New Session ───
  const handleNewSession = () => {
    if (regions.length > 0 && !confirm(t('analysis.imageProcessor.confirmNewSession', '現在のセッションを破棄して新規セッションを開始しますか？'))) return;
    setSessionName(getInitialSessionName(t));
    setRegions([]);
    setSelectedRegionId(null);
  };

  // ─── Export CSV ───
  const exportCSV = () => {
    const headerCols = [
      t('analysis.imageProcessor.csvHeaderId', 'ID'),
      t('analysis.imageProcessor.csvHeaderImageFile', '画像ファイル'),
      t('analysis.imageProcessor.csvHeaderLabel', 'ラベル'),
      t('analysis.imageProcessor.csvHeaderTotalCount', '合計点数'),
      ...pointTypes.map(pt => `${t('analysis.imageProcessor.csvHeaderPointPrefix', '点数_')}${getPointTypeDisplayName(pt.name)}`)
    ];
    const rows = [headerCols.join(',')];

    regions.forEach(r => {
      const label = labels.find(l => l.id === r.labelId);
      const countsByType: Record<string, number> = {};
      r.points.forEach(p => {
        countsByType[p.typeId] = (countsByType[p.typeId] || 0) + 1;
      });

      const ptCols = pointTypes.map(pt => String(countsByType[pt.id] || 0));
      const idLabel = getRegionIdDisplay(r);

      rows.push([
        `"${idLabel}"`,
        `"${r.imageKey}"`,
        `"${label ? getLabelDisplayName(label.name) : t('analysis.imageProcessor.unassigned', '未設定')}"`,
        String(r.points.length),
        ...ptCols
      ].join(','));
    });

    const bom = '\uFEFF';
    const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName.replace(/[/\\?%*:|"<>]/g, '_')}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Export Annotated Image (TIFF) ───
  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage) return;
    try {
      const tiffBlob = canvasToTiffBlob(canvas);
      const url = URL.createObjectURL(tiffBlob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = activeImage.name.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}_annotated.tif`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export TIFF image:', err);
      // Fallback to PNG if TIFF conversion fails
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeImage.name}_annotated.png`;
      a.click();
    }
  };

  // ─── End Session ───
  const handleEndSession = () => {
    if (regions.length === 0) {
      alert(t('analysis.imageProcessor.alertNoRecords', '記録がありません。'));
      return;
    }
    exportCSV();
    if (confirm(t('analysis.imageProcessor.confirmEndSession', 'セッションを終了して新規セッションを開始しますか？'))) {
      handleNewSession();
    }
  };

  // ─── Max Intensity Projection (MIP) ───
  const [showMipModal, setShowMipModal] = useState(false);
  const [selectedMipIndices, setSelectedMipIndices] = useState<number[]>([]);
  const [mipProcessing, setMipProcessing] = useState(false);

  const openMipModal = () => {
    if (images.length < 2) {
      alert(t('analysis.imageProcessor.alertMinTwoImagesForMip', 'Max Intensity画像の作製には2枚以上の画像が必要です。'));
      return;
    }
    // Select all images by default
    setSelectedMipIndices(images.map((_, i) => i));
    setShowMipModal(true);
  };

  const toggleMipIndex = (idx: number) => {
    setSelectedMipIndices(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleSelectAllMip = () => {
    setSelectedMipIndices(images.map((_, i) => i));
  };

  const handleDeselectAllMip = () => {
    setSelectedMipIndices([]);
  };

  const generateMaxIntensityImage = async () => {
    if (selectedMipIndices.length < 2) {
      alert(t('analysis.imageProcessor.alertSelectMinTwoImages', '合成する画像を2枚以上選択してください。'));
      return;
    }
    setMipProcessing(true);
    try {
      // 1. Load HTMLImageElements for all selected images
      const loadedImgs: HTMLImageElement[] = [];
      for (const idx of selectedMipIndices) {
        const imgData = images[idx];
        const htmlImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = (e) => reject(e);
          el.src = imgData.url;
        });
        loadedImgs.push(htmlImg);
      }

      // Determine canvas dimension (max width & max height)
      const width = Math.max(...loadedImgs.map(i => i.naturalWidth));
      const height = Math.max(...loadedImgs.map(i => i.naturalHeight));

      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      if (!offCtx) throw new Error('Canvas context not available');

      // Create accumulator for Max Intensity (RGBA)
      const maxData = offCtx.createImageData(width, height);
      const maxPixels = maxData.data; // Uint8ClampedArray initialized to 0

      // For each image, draw to temporary canvas and update maximum per pixel channel
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tempCtx) throw new Error('Temporary canvas context not available');

      for (let i = 0; i < loadedImgs.length; i++) {
        const img = loadedImgs[i];
        tempCtx.clearRect(0, 0, width, height);
        tempCtx.drawImage(img, 0, 0, width, height);
        const imgData = tempCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        for (let p = 0; p < pixels.length; p += 4) {
          // Max Intensity for R, G, B channels
          if (pixels[p] > maxPixels[p]) maxPixels[p] = pixels[p];         // R
          if (pixels[p + 1] > maxPixels[p + 1]) maxPixels[p + 1] = pixels[p + 1]; // G
          if (pixels[p + 2] > maxPixels[p + 2]) maxPixels[p + 2] = pixels[p + 2]; // B
          maxPixels[p + 3] = 255; // Alpha
        }
      }

      // Put merged max intensity data onto offCanvas
      offCtx.putImageData(maxData, 0, 0);

      // Create TIFF Blob for high-fidelity file storage/export
      const tiffBlob = canvasToTiffBlob(offCanvas);

      // Create browser-compatible display PNG Blob
      const displayBlob = await new Promise<Blob>((resolve, reject) => {
        offCanvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('Failed to create display blob from canvas'));
        }, 'image/png');
      });

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const mipName = `Max_Intensity_${selectedMipIndices.length}images_${timeStr}.tif`;

      const newImageData: ImageData = {
        blob: tiffBlob,
        url: URL.createObjectURL(displayBlob),
        brightness: 0,
        name: mipName
      };

      const updated = [...images, newImageData];
      setImages(updated);
      setActiveImageIdx(updated.length - 1);
      await saveImagesToDB(updated.map(img => ({ name: img.name, blob: img.blob, brightness: img.brightness })));

      setShowMipModal(false);
      alert(t('analysis.imageProcessor.alertMipSuccess', { name: mipName, defaultValue: `「${mipName}」を作製し、解析画像リストに追加しました！` }));
    } catch (err) {
      console.error('Failed to generate Max Intensity image:', err);
      alert(t('analysis.imageProcessor.alertMipError', 'Max Intensity画像の作製中にエラーが発生しました。'));
    } finally {
      setMipProcessing(false);
    }
  };

  // ─── Map Stitching & Panorama / Tiling ───
  const [showStitchModal, setShowStitchModal] = useState(false);
  const [selectedStitchIndices, setSelectedStitchIndices] = useState<number[]>([]);
  const [stitchMode, setStitchMode] = useState<'object' | 'grid'>('object');
  const [stitchGridCols, setStitchGridCols] = useState<number>(2);
  const [stitchGridRows, setStitchGridRows] = useState<number>(2);
  const [stitchOverlapRatio, setStitchOverlapRatio] = useState<number>(0.15);
  const [stitchBlendMode, setStitchBlendMode] = useState<BlendMode>('feather');
  const [stitchPlacements, setStitchPlacements] = useState<ImagePlacement[]>([]);
  const [stitchGroups, setStitchGroups] = useState<ImageGroup[]>([]);
  const [detectionParams, setDetectionParams] = useState<DetectionParams>(DEFAULT_DETECTION_PARAMS);
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [stitchProcessing, setStitchProcessing] = useState(false);
  const [stitchAligning, setStitchAligning] = useState(false);
  const [stitchProgress, setStitchProgress] = useState(0);
  const [stitchProgressMsg, setStitchProgressMsg] = useState('');
  const stitchPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stitchLoadedImagesRef = useRef<{ img: HTMLImageElement; name: string; idx: number }[]>([]);
  const stitchOffsetsMapRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());

  // Interactive Preview Controls & Zoom / Pan / Dragging
  const [stitchPreviewZoom, setStitchPreviewZoom] = useState<number | 'fit'>('fit');
  const [stitchPreviewPan, setStitchPreviewPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningPreview, setIsPanningPreview] = useState(false);
  const [panStartPos, setPanStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggedTileIdx, setDraggedTileIdx] = useState<number | null>(null);
  const [dragTileOffset, setDragTileOffset] = useState<{ startMouseX: number; startMouseY: number; origTileX: number; origTileY: number } | null>(null);
  const [previewCalculatedScale, setPreviewCalculatedScale] = useState<number>(1);
  const [stitchRightTab, setStitchRightTab] = useState<'threshold' | 'groups' | 'tile'>('threshold');
  const previewCanvasBoundsRef = useRef<{ left: number; top: number; width: number; height: number }>({ left: 0, top: 0, width: 960, height: 540 });
  const previewScreenTilesRef = useRef<{ imageIndex: number; x: number; y: number; w: number; h: number }[]>([]);

  // Object Detection Inspection & Real-time Threshold Preview
  const [stitchViewMode, setStitchViewMode] = useState<'map' | 'detect_preview'>('map');
  const [inspectImageIdx, setInspectImageIdx] = useState<number>(0);
  const [inspectDetectionResult, setInspectDetectionResult] = useState<DetailedDetectionResult | null>(null);
  const [inspectMaskOverlay, setInspectMaskOverlay] = useState<'boxes' | 'binary' | 'both'>('both');
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [detectedFeaturesMap, setDetectedFeaturesMap] = useState<Map<number, ObjectFeature[]>>(new Map());

  // Run object detection preview for the inspected image whenever detectionParams or inspectImageIdx changes
  useEffect(() => {
    if (!showStitchModal) return;
    let cancelled = false;

    const runInspect = async () => {
      const targetImgData = images[inspectImageIdx];
      if (!targetImgData) return;
      setInspectLoading(true);

      try {
        const htmlImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = targetImgData.url;
        });

        const res = await detectObjectsWithMask(htmlImg, inspectImageIdx, detectionParams);
        if (!cancelled) {
          setInspectDetectionResult(res);
        }
      } catch (err) {
        console.error('Inspection detection error:', err);
      } finally {
        if (!cancelled) setInspectLoading(false);
      }
    };

    const timer = setTimeout(runInspect, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showStitchModal, inspectImageIdx, detectionParams]);

  // Load HTMLImageElements for selected stitch images helper
  const loadStitchImages = async (indices: number[]): Promise<{ img: HTMLImageElement; name: string; idx: number }[]> => {
    const loaded: { img: HTMLImageElement; name: string; idx: number }[] = [];
    for (const idx of indices) {
      const imgData = images[idx];
      if (!imgData) continue;
      const el = await new Promise<HTMLImageElement>((resolve, reject) => {
        const htmlImg = new Image();
        htmlImg.onload = () => resolve(htmlImg);
        htmlImg.onerror = (e) => reject(e);
        htmlImg.src = imgData.url;
      });
      loaded.push({ img: el, name: imgData.name, idx });
    }
    return loaded;
  };

  const openStitchModal = async () => {
    if (images.length < 2) {
      alert(t('analysis.imageProcessor.alertMinTwoImagesForMap', 'マップ生成には2枚以上の画像が必要です。'));
      return;
    }
    const allIndices = images.map((_, i) => i);
    setSelectedStitchIndices(allIndices);
    setShowStitchModal(true);
    setSelectedTileIndex(null);

    // Initial default grid size if even count
    const count = allIndices.length;
    let cols = 2;
    let rows = 2;
    if (count === 4) {
      cols = 2;
      rows = 2;
    } else if (count === 6) {
      cols = 3;
      rows = 2;
    } else if (count === 9) {
      cols = 3;
      rows = 3;
    } else {
      cols = Math.ceil(Math.sqrt(count));
      rows = Math.ceil(count / cols);
    }
    setStitchGridCols(cols);
    setStitchGridRows(rows);

    // Auto-detect polarity from first image to avoid 0-object failure
    let initialParams = { ...detectionParams };
    try {
      const firstImgData = images[allIndices[0] ?? 0];
      if (firstImgData) {
        const testImg = new Image();
        testImg.src = firstImgData.url;
        await new Promise(r => { testImg.onload = r; testImg.onerror = r; });
        const ds = createDownscaledGrayscale(testImg, 256);
        const isBrightfield = estimateImageBackgroundPolarity(ds.data, ds.width, ds.height);
        initialParams = { ...initialParams, invert: isBrightfield };
        setDetectionParams(initialParams);
      }
    } catch (e) {
      console.warn('Auto-polarity estimation skipped:', e);
    }

    // Run initial alignment with estimated parameters
    setTimeout(() => {
      computeAlignment(allIndices, stitchMode, cols, rows, 0.15, initialParams);
    }, 50);
  };

  const computeAlignment = async (
    indices: number[] = selectedStitchIndices,
    mode: 'object' | 'grid' = stitchMode,
    cols: number = stitchGridCols,
    rows: number = stitchGridRows,
    overlap: number = stitchOverlapRatio,
    params: DetectionParams = detectionParams
  ) => {
    if (indices.length < 2) return;
    setStitchAligning(true);
    setStitchProgress(0);
    setStitchProgressMsg(t('analysis.imageProcessor.loadingImages', '画像を読み込み中...'));
    try {
      const loaded = await loadStitchImages(indices);
      stitchLoadedImagesRef.current = loaded;

      const onProgress = (pct: number, msg: string) => {
        setStitchProgress(pct);
        setStitchProgressMsg(msg);
      };

      if (mode === 'grid') {
        const placements = await calculateGridPlacements(
          loaded.map(l => ({ img: l.img, name: l.name })),
          cols,
          rows,
          overlap,
          true,
          onProgress
        );
        setStitchPlacements(placements);
        setStitchGroups([{
          id: 'grid_group',
          name: t('analysis.imageProcessor.gridAlignmentName', 'グリッド配置'),
          color: GROUP_COLORS[0],
          imageIndices: indices
        }]);
        if (placements.length > 0) {
          setSelectedTileIndex(placements[0].imageIndex);
        }
      } else {
        // Object-based detection and grouping
        const res = await analyzeObjectsAndGroupImages(
          loaded.map(l => ({ img: l.img, name: l.name })),
          params,
          onProgress
        );
        setStitchGroups(res.groups);
        setStitchPlacements(res.placements);
        setDetectedFeaturesMap(res.detectedFeatures);
        if (res.placements.length > 0) {
          setSelectedTileIndex(res.placements[0].imageIndex);
        }
      }
    } catch (err) {
      console.error('Failed to align images:', err);
      alert(t('analysis.imageProcessor.alertAlignError', '位置合わせ中にエラーが発生しました。'));
    } finally {
      setStitchAligning(false);
      setStitchProgress(0);
      setStitchProgressMsg('');
    }
  };

  // Move an image from its current group to another group
  const handleMoveImageToGroup = (imgIdx: number, targetGroupId: string) => {
    const updatedGroups = stitchGroups.map(g => {
      if (g.id === targetGroupId) {
        if (!g.imageIndices.includes(imgIdx)) {
          return { ...g, imageIndices: [...g.imageIndices, imgIdx] };
        }
        return g;
      } else {
        return { ...g, imageIndices: g.imageIndices.filter(i => i !== imgIdx) };
      }
    }).filter(g => g.imageIndices.length > 0); // remove empty groups

    setStitchGroups(updatedGroups);

    // Re-layout placements according to updated groups
    if (stitchLoadedImagesRef.current.length > 0) {
      const updatedPlacements = calculatePlacementsFromGroups(
        stitchLoadedImagesRef.current.map(l => ({ img: l.img, name: l.name })),
        updatedGroups,
        stitchOffsetsMapRef.current
      );
      setStitchPlacements(updatedPlacements);
    }
  };

  // Create a new separate group and move an image to it
  const handleCreateNewGroup = (moveImgIdx?: number) => {
    const nextNum = stitchGroups.length + 1;
    const newGroupId = `group_${Date.now()}`;
    const newGroup: ImageGroup = {
      id: newGroupId,
      name: `${t('analysis.imageProcessor.imageGroupPrefix', '画像群 ')}${nextNum}`,
      color: GROUP_COLORS[(nextNum - 1) % GROUP_COLORS.length],
      imageIndices: moveImgIdx !== undefined ? [moveImgIdx] : []
    };

    let updatedGroups: ImageGroup[];
    if (moveImgIdx !== undefined) {
      updatedGroups = stitchGroups.map(g => ({
        ...g,
        imageIndices: g.imageIndices.filter(i => i !== moveImgIdx)
      })).filter(g => g.imageIndices.length > 0);
      updatedGroups.push(newGroup);
    } else {
      updatedGroups = [...stitchGroups, newGroup];
    }

    setStitchGroups(updatedGroups);

    if (stitchLoadedImagesRef.current.length > 0) {
      const updatedPlacements = calculatePlacementsFromGroups(
        stitchLoadedImagesRef.current.map(l => ({ img: l.img, name: l.name })),
        updatedGroups,
        stitchOffsetsMapRef.current
      );
      setStitchPlacements(updatedPlacements);
    }
  };

  const toggleStitchIndex = (idx: number) => {
    const updated = selectedStitchIndices.includes(idx)
      ? selectedStitchIndices.filter(i => i !== idx)
      : [...selectedStitchIndices, idx];
    setSelectedStitchIndices(updated);
    if (updated.length >= 2) {
      computeAlignment(updated);
    } else {
      setStitchPlacements([]);
      setStitchGroups([]);
      setSelectedTileIndex(null);
    }
  };

  const handleSelectAllStitch = () => {
    const all = images.map((_, i) => i);
    setSelectedStitchIndices(all);
    computeAlignment(all);
  };

  const handleDeselectAllStitch = () => {
    setSelectedStitchIndices([]);
    setStitchPlacements([]);
    setSelectedTileIndex(null);
  };

  // Adjust tile position helper
  const handleAdjustTile = (deltaX: number, deltaY: number) => {
    if (selectedTileIndex === null) return;
    setStitchPlacements(prev =>
      prev.map(p =>
        p.imageIndex === selectedTileIndex
          ? { ...p, x: p.x + deltaX, y: p.y + deltaY }
          : p
      )
    );
  };

  // Reset preview zoom to fit all tiles
  const handleResetPreviewFit = () => {
    setStitchPreviewZoom('fit');
    setStitchPreviewPan({ x: 0, y: 0 });
  };

  // Change preview zoom factor
  const handleStepPreviewZoom = (delta: number) => {
    const current = typeof stitchPreviewZoom === 'number' ? stitchPreviewZoom : previewCalculatedScale;
    const next = Math.max(0.05, Math.min(5.0, Number((current * (delta > 0 ? 1.25 : 0.8)).toFixed(3))));
    setStitchPreviewZoom(next);
  };

  // Preview Mouse Event Handlers for Dragging Tiles & Panning
  const handlePreviewMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = stitchPreviewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check hit on tiles (top-most first)
    const tiles = [...previewScreenTilesRef.current].reverse();
    const hit = tiles.find(t =>
      clickX >= t.x && clickX <= t.x + t.w &&
      clickY >= t.y && clickY <= t.y + t.h
    );

    if (hit) {
      setSelectedTileIndex(hit.imageIndex);
      const selPlacement = stitchPlacements.find(p => p.imageIndex === hit.imageIndex);
      if (selPlacement) {
        setDraggedTileIdx(hit.imageIndex);
        setDragTileOffset({
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          origTileX: selPlacement.x,
          origTileY: selPlacement.y
        });
      }
    } else {
      // Clicked background: start canvas panning
      setIsPanningPreview(true);
      setPanStartPos({ x: e.clientX - stitchPreviewPan.x, y: e.clientY - stitchPreviewPan.y });
    }
  };

  const handlePreviewMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedTileIdx !== null && dragTileOffset) {
      const scale = previewCalculatedScale > 0 ? previewCalculatedScale : 1;
      const dx = (e.clientX - dragTileOffset.startMouseX) / scale;
      const dy = (e.clientY - dragTileOffset.startMouseY) / scale;
      setStitchPlacements(prev =>
        prev.map(p =>
          p.imageIndex === draggedTileIdx
            ? { ...p, x: Math.round(dragTileOffset.origTileX + dx), y: Math.round(dragTileOffset.origTileY + dy) }
            : p
        )
      );
    } else if (isPanningPreview) {
      setStitchPreviewPan({
        x: e.clientX - panStartPos.x,
        y: e.clientY - panStartPos.y
      });
    }
  };

  const handlePreviewMouseUp = () => {
    setDraggedTileIdx(null);
    setDragTileOffset(null);
    setIsPanningPreview(false);
  };

  const handlePreviewWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const current = typeof stitchPreviewZoom === 'number' ? stitchPreviewZoom : previewCalculatedScale;
    const next = Math.max(0.05, Math.min(5.0, Number((current * zoomFactor).toFixed(3))));
    setStitchPreviewZoom(next);
  };

  // Render Preview Canvas whenever stitchPlacements, selection, zoom, pan, or view mode changes
  useEffect(() => {
    if (!showStitchModal || !stitchPreviewCanvasRef.current) return;
    const canvas = stitchPreviewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewW = canvas.width;
    const previewH = canvas.height;

    // ─── Individual Image Object Detection Inspection Mode ───
    if (stitchViewMode === 'detect_preview') {
      const targetImgData = images[inspectImageIdx];
      if (!targetImgData) return;

      const img = stitchLoadedImagesRef.current.find(l => l.idx === inspectImageIdx)?.img || new Image();
      if (!img.src) img.src = targetImgData.url;

      const drawInspect = () => {
        const imgW = img.naturalWidth || img.width || 800;
        const imgH = img.naturalHeight || img.height || 600;
        // Adequate padding to ensure the entire image, borders and labels are fully visible
        const pad = 36;
        const scale = Math.min((previewW - pad * 2) / imgW, (previewH - pad * 2) / imgH);
        const dw = Math.round(imgW * scale);
        const dh = Math.round(imgH * scale);
        const offX = Math.round((previewW - dw) / 2);
        const offY = Math.round((previewH - dh) / 2);

        ctx.clearRect(0, 0, previewW, previewH);
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, previewW, previewH);

        // Grid background pattern
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < previewW; x += 25) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, previewH); ctx.stroke();
        }
        for (let y = 0; y < previewH; y += 25) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(previewW, y); ctx.stroke();
        }

        // Draw outer frame of the image
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(offX - 1, offY - 1, dw + 2, dh + 2);

        // 1. Base image (with invert filter if invertImageColors is enabled)
        ctx.save();
        if (detectionParams.invertImageColors) {
          ctx.filter = 'invert(100%)';
        }
        ctx.drawImage(img, offX, offY, dw, dh);
        ctx.restore();

        // 2. Binary mask overlay
        if (inspectDetectionResult && (inspectMaskOverlay === 'binary' || inspectMaskOverlay === 'both')) {
          const { maskWidth, maskHeight, binaryMask } = inspectDetectionResult;
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = maskWidth;
          maskCanvas.height = maskHeight;
          const mCtx = maskCanvas.getContext('2d');
          if (mCtx) {
            const mImgData = mCtx.createImageData(maskWidth, maskHeight);
            const mPix = mImgData.data;
            for (let mi = 0; mi < binaryMask.length; mi++) {
              if (binaryMask[mi] === 1) {
                const pi = mi * 4;
                mPix[pi] = 16;
                mPix[pi + 1] = 185;
                mPix[pi + 2] = 129;
                mPix[pi + 3] = inspectMaskOverlay === 'binary' ? 220 : 110;
              }
            }
            mCtx.putImageData(mImgData, 0, 0);
            ctx.drawImage(maskCanvas, offX, offY, dw, dh);
          }
        }

        // 3. Object bounding boxes & centers
        const objects = inspectDetectionResult?.objects || [];
        if (inspectMaskOverlay === 'boxes' || inspectMaskOverlay === 'both') {
          objects.forEach((obj, idx) => {
            const bx = offX + obj.minX * scale;
            const by = offY + obj.minY * scale;
            const bw = obj.width * scale;
            const bh = obj.height * scale;
            const cx = offX + obj.cx * scale;
            const cy = offY + obj.cy * scale;

            ctx.strokeStyle = '#06B6D4';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);

            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            ctx.fill();

            const badge = `#${idx + 1} (${obj.area}px²)`;
            ctx.font = 'bold 10px sans-serif';
            const tw = ctx.measureText(badge).width;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.92)';
            ctx.fillRect(bx, Math.max(0, by - 16), tw + 6, 14);
            ctx.fillStyle = '#000000';
            ctx.fillText(badge, bx + 3, Math.max(11, by - 5));
          });
        }

        // Status badge at top of preview
        const appliedThresh = inspectDetectionResult?.threshold ?? detectionParams.manualThreshold;
        const threshModeLabel = detectionParams.thresholdMode === 'otsu'
          ? t('analysis.imageProcessor.statusOtsuAuto', { val: appliedThresh, defaultValue: `大津自動 (${appliedThresh})` })
          : t('analysis.imageProcessor.statusManual', { val: appliedThresh, defaultValue: `手動 (${appliedThresh})` });
        const invColorLabel = detectionParams.invertImageColors ? t('analysis.imageProcessor.statusInvertOn', ' | 🔄反転画像') : '';
        const polarityText = detectionParams.invert ? t('analysis.imageProcessor.statusBrightBg', '明背景') : t('analysis.imageProcessor.statusDarkBg', '暗背景');
        const statusText = t('analysis.imageProcessor.statusDetectedObjects', {
          count: objects.length,
          threshold: threshModeLabel,
          polarity: polarityText,
          invert: invColorLabel,
          defaultValue: `🎯 検出物体: ${objects.length} 個 | 閾値: ${threshModeLabel} | 極性: ${polarityText}${invColorLabel}`
        });
        ctx.font = 'bold 12px sans-serif';
        const stw = ctx.measureText(statusText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(10, 10, stw + 16, 26);
        ctx.strokeStyle = '#6366F1';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, stw + 16, 26);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(statusText, 18, 27);
      };

      if (img.complete && img.naturalWidth > 0) {
        drawInspect();
      } else {
        img.onload = () => drawInspect();
      }
      return;
    }

    // ─── Map Stitching Tiling Layout Mode ───
    if (stitchPlacements.length === 0) return;

    const norm = normalizePlacements(stitchPlacements);
    let maxW = 0;
    let maxH = 0;
    norm.forEach(p => {
      maxW = Math.max(maxW, p.x + p.width);
      maxH = Math.max(maxH, p.y + p.height);
    });

    if (maxW === 0 || maxH === 0) return;

    // Calculate base fit scale
    const fitScale = Math.min((previewW - 60) / maxW, (previewH - 60) / maxH);
    const activeScale = typeof stitchPreviewZoom === 'number' ? stitchPreviewZoom : fitScale;
    setPreviewCalculatedScale(activeScale);

    // Centered origin + user pan offset
    const offX = (previewW - maxW * activeScale) / 2 + stitchPreviewPan.x;
    const offY = (previewH - maxH * activeScale) / 2 + stitchPreviewPan.y;

    ctx.clearRect(0, 0, previewW, previewH);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, previewW, previewH);

    // Draw grid background pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < previewW; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, previewH);
      ctx.stroke();
    }
    for (let y = 0; y < previewH; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(previewW, y);
      ctx.stroke();
    }

    const loadedMap = new Map(stitchLoadedImagesRef.current.map(l => [l.idx, l.img]));
    const screenTiles: { imageIndex: number; x: number; y: number; w: number; h: number }[] = [];

    // Draw image tiles
    norm.forEach((p, orderIdx) => {
      const img = loadedMap.get(p.originalIndex ?? p.imageIndex) || stitchLoadedImagesRef.current[p.imageIndex]?.img;
      const px = offX + p.x * activeScale;
      const py = offY + p.y * activeScale;
      const pw = p.width * activeScale;
      const ph = p.height * activeScale;

      screenTiles.push({ imageIndex: p.imageIndex, x: px, y: py, w: pw, h: ph });

      if (img && img.complete) {
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, px, py, pw, ph);
        ctx.globalAlpha = 1.0;
      }

      const isSelected = selectedTileIndex === p.imageIndex;
      const group = stitchGroups.find(g => g.id === p.groupId);
      const groupColor = group?.color || 'rgba(99, 102, 241, 0.8)';

      ctx.strokeStyle = isSelected ? '#10B981' : groupColor;
      ctx.lineWidth = isSelected ? 3.5 : 2;
      ctx.strokeRect(px, py, pw, ph);

      // Label badge with group name
      const groupLabel = group ? `[${group.name}] ` : '';
      const badgeText = `${groupLabel}#${orderIdx + 1} ${p.name}`;
      ctx.font = 'bold 11px sans-serif';
      const textW = ctx.measureText(badgeText).width;
      ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.95)' : (groupColor + 'dd');
      ctx.fillRect(px + 4, py + 4, textW + 8, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, px + 8, py + 17);
    });

    previewScreenTilesRef.current = screenTiles;
  }, [showStitchModal, stitchPlacements, selectedTileIndex, stitchGroups, stitchPreviewZoom, stitchPreviewPan, stitchViewMode, inspectImageIdx, inspectDetectionResult, inspectMaskOverlay, detectionParams]);

  // Execute Map Stitching & Save
  const generateStitchedMap = async () => {
    if (stitchPlacements.length < 2) {
      alert(t('analysis.imageProcessor.alertMinTwoImagesForMap', 'マップを生成するには2枚以上の画像を配置してください。'));
      return;
    }
    setStitchProcessing(true);
    setStitchProgress(0);
    setStitchProgressMsg(t('analysis.imageProcessor.loadingImages', '画像を読み込み中...'));
    try {
      const loaded = await loadStitchImages(selectedStitchIndices);

      const onProgress = (pct: number, msg: string) => {
        setStitchProgress(pct);
        setStitchProgressMsg(msg);
      };

      const stitchedCanvas = await renderStitchedCanvas(
        loaded.map(l => ({ img: l.img, name: l.name })),
        stitchPlacements,
        stitchBlendMode,
        onProgress
      );

      setStitchProgressMsg(t('analysis.imageProcessor.convertingTiff', 'TIFF変換中...'));
      const tiffBlob = canvasToTiffBlob(stitchedCanvas);
      const displayBlob = await new Promise<Blob>((resolve, reject) => {
        stitchedCanvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('Failed to create display blob from stitched canvas'));
        }, 'image/png');
      });

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const mapName = `Stitched_Map_${stitchPlacements.length}tiles_${timeStr}.tif`;

      const newImageData: ImageData = {
        blob: tiffBlob,
        url: URL.createObjectURL(displayBlob),
        brightness: 0,
        name: mapName
      };

      const updated = [...images, newImageData];
      setImages(updated);
      setActiveImageIdx(updated.length - 1);
      setShowStitchModal(false);

      setTimeout(() => {
        handleFitToScreen();
      }, 100);
      setTimeout(() => {
        handleFitToScreen();
      }, 350);

      await saveImagesToDB(updated.map(img => ({ name: img.name, blob: img.blob, brightness: img.brightness })));
    } catch (err) {
      console.error('Failed to generate stitched map:', err);
      alert(t('analysis.imageProcessor.alertMapGenError', 'マップ生成処理中にエラーが発生しました。'));
    } finally {
      setStitchProcessing(false);
      setStitchProgress(0);
      setStitchProgressMsg('');
    }
  };

  // ─── Download Active Image / MIP (as TIFF) ───
  const downloadActiveRawImage = () => {
    if (!activeImage) return;
    try {
      let tiffBlob: Blob;
      if (activeImage.blob.type === 'image/tiff' || /\.(tiff?|tif)$/i.test(activeImage.name)) {
        tiffBlob = activeImage.blob;
      } else {
        // Convert active image to TIFF via temporary canvas
        const img = imgRef.current;
        if (img && img.complete) {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            tiffBlob = canvasToTiffBlob(c);
          } else {
            tiffBlob = activeImage.blob;
          }
        } else {
          tiffBlob = activeImage.blob;
        }
      }

      const url = URL.createObjectURL(tiffBlob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = activeImage.name.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}.tif`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download image as TIFF:', err);
      // Fallback
      const a = document.createElement('a');
      a.href = activeImage.url;
      a.download = activeImage.name;
      a.click();
    }
  };

  // ─── Image switch with table row click ───
  const handleTableRowClick = (region: Region) => {
    const imgIdx = images.findIndex(img => img.name === region.imageKey);
    if (imgIdx >= 0 && imgIdx !== activeImageIdx) {
      setActiveImageIdx(imgIdx);
    }
    setSelectedRegionId(region.id);
  };

  // Count ROIs per image for thumbnails
  const roiCountByImage = useMemo(() => {
    const counts: Record<string, number> = {};
    regions.forEach(r => {
      counts[r.imageKey] = (counts[r.imageKey] || 0) + 1;
    });
    return counts;
  }, [regions]);

  // ─── Render ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {/* Session & Preset Header */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', alignItems: 'center' }}>
          {/* Session Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flex: 1, minWidth: 240 }}>
            <FileText size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>{t('analysis.imageProcessor.sessionName', 'セッション名:')}</span>
            <input
              type="text"
              className="form-input"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>

          {/* Preset Set Quick Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', background: 'var(--bg-base)', padding: '4px 10px', borderRadius: 'var(--border-radius-md)' }}>
            <Bookmark size={15} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>{t('analysis.imageProcessor.presetLabel', '設定プリセット:')}</span>
            <select
              className="form-select"
              style={{ fontSize: 'var(--font-size-xs)', padding: '3px 8px', maxWidth: 200 }}
              value={selectedPresetSetId}
              onChange={(e) => handleSelectPresetSet(e.target.value)}
            >
              {presetSets.map(ps => (
                <option key={ps.id} value={ps.id}>
                  {getPresetSetName(ps)} {ps.isCustom ? '★' : ''}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '3px 6px', fontSize: '11px' }}
              onClick={() => setShowSavePresetModal(true)}
              title={t('analysis.imageProcessor.savePresetTitle', '現在のラベル＆点タイプを新規プリセットとして保存')}
            >
              <Save size={12} /> <span>{t('analysis.imageProcessor.savePreset', 'セット保存')}</span>
            </button>
            {presetSets.find(ps => ps.id === selectedPresetSetId)?.isCustom && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: 3, color: 'var(--color-danger)' }}
                onClick={(e) => handleDeletePresetSet(selectedPresetSetId, e)}
                title={t('analysis.imageProcessor.deleteCustomPresetTitle', 'このカスタムプリセットを削除')}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Session Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={saveSession} title={t('analysis.imageProcessor.tempSave', '一時保存')}>
              <Save size={14} /> <span>{t('analysis.imageProcessor.tempSave', '一時保存')}</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSavedSessions(!showSavedSessions)} title={t('analysis.imageProcessor.restore', '復元')}>
              <FolderOpen size={14} /> <span>{t('analysis.imageProcessor.restore', '復元')}</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleEndSession} title={t('analysis.imageProcessor.endAndExportTitle', '計測終了 & CSV出力')}>
              <Download size={14} /> <span>{t('analysis.imageProcessor.endAndExport', '計測終了&出力')}</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleNewSession} title={t('analysis.imageProcessor.newSessionTitle', '新規セッション')}>
              <RefreshCw size={14} /> <span>{t('analysis.imageProcessor.newSession', '新規')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Preset Set Modal */}
      {showSavePresetModal && (
        <div className="modal-overlay" onClick={() => setShowSavePresetModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Bookmark size={18} style={{ color: 'var(--color-primary)' }} />
                <h2 className="modal-title">{t('analysis.imageProcessor.savePresetModalTitle', '設定プリセットセットの保存')}</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowSavePresetModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                {t('analysis.imageProcessor.savePresetModalDesc', { labelsCount: labels.length, pointTypesCount: pointTypes.length, defaultValue: `現在設定されている対象ラベル（${labels.length}種）と点タイプ（${pointTypes.length}色）をセットとして名前をつけて保存します。` })}
              </p>
              <div className="form-group">
                <label className="form-label">{t('analysis.imageProcessor.presetName', 'プリセット名')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('analysis.imageProcessor.presetNamePlaceholder', '例: 形質転換コロニー分析、蛍光染色GFP/RFP...')}
                  value={newPresetSetName}
                  onChange={(e) => setNewPresetSetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentAsPresetSet(); }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSavePresetModal(false)}>{t('common.cancel', 'キャンセル')}</button>
              <button className="btn btn-primary" onClick={handleSaveCurrentAsPresetSet} disabled={!newPresetSetName.trim()}>
                {t('analysis.imageProcessor.saveBtn', '保存する')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Sessions Dropdown */}
      {showSavedSessions && (
        <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
          <div className="card-header">
            <h3 className="card-title">{t('analysis.imageProcessor.savedSessionsTitle', '保存済みセッション')}</h3>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSavedSessions(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="card-body">
            {getSavedSessions().length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{t('analysis.imageProcessor.noSavedSessions', '一時保存されたセッションはありません。')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {getSavedSessions().map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm)', background: 'var(--bg-base)', borderRadius: 'var(--border-radius-md)' }}>
                    <div>
                      <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{s.sessionName}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {new Date(s.savedAt).toLocaleString(i18n.language === 'en' ? 'en-US' : 'ja-JP')} — {t('analysis.imageProcessor.roiCount', { count: s.regions.length, defaultValue: `ROI: ${s.regions.length}個` })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => loadSession(s)}>{t('analysis.imageProcessor.restore', '復元')}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteSavedSession(s.sessionName)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map Stitching & Panorama / Tiling Modal (UIから一時削除) */}
      {false && showStitchModal && (
        <div className="modal-overlay" onClick={() => !stitchProcessing && !stitchAligning && setShowStitchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '96vw', maxWidth: 1440, height: '94vh', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <MapIcon size={20} style={{ color: 'var(--color-secondary)' }} />
                <h2 className="modal-title" style={{ fontSize: '16px' }}>{t('analysis.imageProcessor.stitchingModalTitle', 'マップ生成（オブジェクト認識・パノラマスティッチング）')}</h2>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {t('analysis.imageProcessor.stitchingModalSubtitle', '— 共通物体を認識して結合、独立した画像群は分離配置')}
                </span>
              </div>
              {!stitchProcessing && !stitchAligning && (
                <button className="btn btn-ghost btn-icon" onClick={() => setShowStitchModal(false)}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="modal-body" style={{ flex: 1, minHeight: 0, padding: '10px 14px', display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden' }}>
              {/* Left Column: Large Interactive Preview Canvas */}
              <div style={{ flex: '1 1 64%', minWidth: 420, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Preview Toolbar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-base)',
                  padding: '4px 8px',
                  borderRadius: 'var(--border-radius-sm)',
                  border: '1px solid var(--border-default)',
                  flexWrap: 'wrap',
                  gap: 6
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {/* View Mode Toggle */}
                    <div style={{ display: 'flex', gap: 2, background: 'var(--bg-surface)', padding: 2, borderRadius: 4 }}>
                      <button
                        className={`btn btn-sm ${stitchViewMode === 'map' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '10px', padding: '3px 8px', gap: 4 }}
                        onClick={() => setStitchViewMode('map')}
                        title={t('analysis.imageProcessor.fullMapTitle', '全体パノラマ・タイリング結合プレビュー')}
                      >
                        <MapIcon size={12} /> <span>{t('analysis.imageProcessor.fullMap', '全体マップ')}</span>
                      </button>
                      <button
                        className={`btn btn-sm ${stitchViewMode === 'detect_preview' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '10px', padding: '3px 8px', gap: 4 }}
                        onClick={() => {
                          setStitchViewMode('detect_preview');
                          setStitchRightTab('threshold');
                        }}
                        title={t('analysis.imageProcessor.inspectDetectTitle', '各画像の物体検出・二値化結果を目視確認しながら閾値を調整')}
                      >
                        <Sliders size={12} /> <span>{t('analysis.imageProcessor.inspectDetect', '物体検出結果・閾値確認')}</span>
                      </button>
                    </div>

                    {stitchViewMode === 'map' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => handleStepPreviewZoom(-1)} title={t('analysis.imageProcessor.zoomOut', '縮小')}>
                          <ZoomOut size={13} />
                        </button>
                        <span style={{ fontSize: '11px', minWidth: 65, textAlign: 'center', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                          {stitchPreviewZoom === 'fit' ? `Fit (${Math.round(previewCalculatedScale * 100)}%)` : `${Math.round(previewCalculatedScale * 100)}%`}
                        </span>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => handleStepPreviewZoom(1)} title={t('analysis.imageProcessor.zoomIn', '拡大')}>
                          <ZoomIn size={13} />
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={handleResetPreviewFit} title={t('analysis.imageProcessor.fitViewTitle', '全体を中央にフィット表示')}>
                          <Maximize2 size={12} /> {t('analysis.imageProcessor.fitView', '全体表示 (Fit)')}
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => { setStitchPreviewZoom(1.0); setStitchPreviewPan({ x: 0, y: 0 }); }} title={t('analysis.imageProcessor.actualSizeTitle', '等倍 (100%)')}>
                          {t('analysis.imageProcessor.actualSize', '100%')}
                        </button>
                      </div>
                    ) : (
                      /* Object Inspection Controls with Direct In-Toolbar Threshold Slider */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{t('analysis.imageProcessor.imageLabel', '画像:')}</span>
                        <select
                          className="form-select"
                          style={{ fontSize: '10px', padding: '2px 6px', height: 24, maxWidth: 130 }}
                          value={inspectImageIdx}
                          onChange={(e) => setInspectImageIdx(Number(e.target.value))}
                        >
                          {images.map((img, idx) => (
                            <option key={idx} value={idx}>
                              #{idx + 1} {img.name}
                            </option>
                          ))}
                        </select>

                        {/* Direct Threshold Slider on Toolbar */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          background: 'var(--bg-surface)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid var(--color-primary)'
                        }}>
                          <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                            {t('analysis.imageProcessor.thresholdLabel', '🎚️ 閾値:')}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', minWidth: 26, textAlign: 'center' }}>
                            {detectionParams.thresholdMode === 'manual' ? detectionParams.manualThreshold : (inspectDetectionResult?.threshold ?? 128)}
                          </span>
                          <input
                            type="range"
                            min={1}
                            max={254}
                            value={detectionParams.thresholdMode === 'manual' ? detectionParams.manualThreshold : (inspectDetectionResult?.threshold ?? 128)}
                            onChange={(e) => {
                              setDetectionParams({
                                ...detectionParams,
                                thresholdMode: 'manual',
                                manualThreshold: Number(e.target.value)
                              });
                            }}
                            style={{ width: 100, cursor: 'pointer', height: 5 }}
                            title={t('analysis.imageProcessor.thresholdSliderTitle', '二値化の輝度閾値を手動調整')}
                          />
                        </div>

                        {/* Invert Image Colors Option (Negative/Positive) */}
                        <button
                          className={`btn btn-sm ${detectionParams.invertImageColors ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: '9.5px', padding: '2px 6px', gap: 3 }}
                          onClick={() => setDetectionParams({ ...detectionParams, invertImageColors: !detectionParams.invertImageColors })}
                          title={t('analysis.imageProcessor.invertImageColorsTitle', '画像を白黒ネガ反転して物体検出を実行')}
                        >
                          {t('analysis.imageProcessor.invertImageColors', '🔄 画像反転（ネガ）')}{detectionParams.invertImageColors ? ' [ON]' : ' [OFF]'}
                        </button>

                        {/* Polarity Invert Option */}
                        <button
                          className={`btn btn-sm ${detectionParams.invert ? 'btn-warning' : 'btn-secondary'}`}
                          style={{ fontSize: '9.5px', padding: '2px 6px', gap: 3 }}
                          onClick={() => setDetectionParams({ ...detectionParams, invert: !detectionParams.invert })}
                          title={t('analysis.imageProcessor.polarityTitle', '明背景(明視野)と暗背景(蛍光)の極性を反転')}
                        >
                          {detectionParams.invert ? t('analysis.imageProcessor.brightField', '明背景(明視野)') : t('analysis.imageProcessor.darkField', '暗背景(蛍光)')}
                        </button>

                        {/* Mask overlay selector */}
                        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-surface)', padding: 1, borderRadius: 3 }}>
                          <button
                            className={`btn btn-sm ${inspectMaskOverlay === 'boxes' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: '9px', padding: '2px 4px' }}
                            onClick={() => setInspectMaskOverlay('boxes')}
                            title={t('analysis.imageProcessor.viewBoxesTitle', '検出された物体の枠線・中心点のみ表示')}
                          >
                            {t('analysis.imageProcessor.viewBoxes', '枠')}
                          </button>
                          <button
                            className={`btn btn-sm ${inspectMaskOverlay === 'binary' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: '9px', padding: '2px 4px' }}
                            onClick={() => setInspectMaskOverlay('binary')}
                            title={t('analysis.imageProcessor.viewMaskTitle', '二値化マスクのみ表示')}
                          >
                            {t('analysis.imageProcessor.viewMask', '二値')}
                          </button>
                          <button
                            className={`btn btn-sm ${inspectMaskOverlay === 'both' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: '9px', padding: '2px 4px' }}
                            onClick={() => setInspectMaskOverlay('both')}
                            title={t('analysis.imageProcessor.viewBothTitle', '元画像＋二値化マスク＋枠線の合成表示')}
                          >
                            {t('analysis.imageProcessor.viewBoth', '両方')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    {stitchViewMode === 'map'
                      ? t('analysis.imageProcessor.dragHint', '🖱️ タイルをドラッグして移動 | 背景ドラッグでパン | ホイールでズーム')
                      : t('analysis.imageProcessor.sliderHint', '💡 上の閾値スライダーを動かすと、リアルタイムに検出枠が更新されます')}
                  </div>
                </div>

                {/* Canvas Container */}
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  background: '#070b14',
                  borderRadius: 'var(--border-radius-md)',
                  border: '1px solid var(--border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: isPanningPreview ? 'grabbing' : (draggedTileIdx !== null ? 'move' : 'grab')
                }}>
                  <canvas
                    ref={stitchPreviewCanvasRef}
                    width={960}
                    height={560}
                    onMouseDown={handlePreviewMouseDown}
                    onMouseMove={handlePreviewMouseMove}
                    onMouseUp={handlePreviewMouseUp}
                    onMouseLeave={handlePreviewMouseUp}
                    onWheel={handlePreviewWheel}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      aspectRatio: '960 / 560',
                      display: 'block',
                      margin: 'auto'
                    }}
                  />
                  {stitchAligning && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(2px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      borderRadius: 'var(--border-radius-md)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-primary)',
                      zIndex: 10
                    }}>
                      <RefreshCw className="animate-spin" size={26} />
                      <span style={{ fontWeight: 600 }}>{stitchProgress}%</span>
                      <div style={{ width: '60%', height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${stitchProgress}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.2s ease' }} />
                      </div>
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{stitchProgressMsg || t('analysis.imageProcessor.calculatingPlacements', '位置合わせを計算中...')}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Strip: Image Selector Grid */}
                <div style={{ background: 'var(--bg-base)', padding: '6px 8px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold' }}>
                      {t('analysis.imageProcessor.stitchingImagesSelected', { selected: selectedStitchIndices.length, total: images.length, defaultValue: `合成対象の画像 (${selectedStitchIndices.length} / ${images.length} 枚選択中):` })}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={handleSelectAllStitch}>
                        {t('analysis.imageProcessor.selectAll', 'すべて選択')}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={handleDeselectAllStitch}>
                        {t('analysis.imageProcessor.deselectAll', '全解除')}
                      </button>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: 6,
                    overflowX: 'auto',
                    paddingBottom: 2
                  }}>
                    {images.map((img, idx) => {
                      const isChecked = selectedStitchIndices.includes(idx);
                      const isTileSelected = selectedTileIndex === idx;
                      const group = stitchGroups.find(g => g.imageIndices.includes(idx));
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (isChecked) {
                              setSelectedTileIndex(idx);
                            }
                            toggleStitchIndex(idx);
                          }}
                          style={{
                            cursor: 'pointer',
                            padding: 3,
                            borderRadius: 'var(--border-radius-sm)',
                            border: isTileSelected
                              ? '2px solid var(--color-secondary)'
                              : group
                                ? `1.5px solid ${group.color}`
                                : isChecked
                                  ? '1.5px solid var(--color-primary)'
                                  : '1px solid var(--border-default)',
                            background: isChecked ? 'var(--color-primary-dim)' : 'var(--bg-surface)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            position: 'relative',
                            width: 80,
                            flexShrink: 0
                          }}
                        >
                          <div style={{ position: 'absolute', top: 3, left: 3, zIndex: 2 }}>
                            {isChecked ? (
                              <CheckSquare size={14} style={{ color: 'var(--color-primary)', background: '#000', borderRadius: 2 }} />
                            ) : (
                              <Square size={14} style={{ color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.5)', borderRadius: 2 }} />
                            )}
                          </div>
                          {group && (
                            <div style={{
                              position: 'absolute',
                              top: 3,
                              right: 3,
                              zIndex: 2,
                              background: group.color,
                              color: '#fff',
                              fontSize: '7px',
                              fontWeight: 'bold',
                              padding: '0 3px',
                              borderRadius: 2
                            }}>
                              {group.name.replace(/画像群 |Group /g, 'G')}
                            </div>
                          )}
                          <img
                            src={img.url}
                            alt={img.name}
                            style={{ width: '100%', height: 40, objectFit: 'cover', borderRadius: 2 }}
                          />
                          <div style={{
                            fontSize: '8px',
                            color: isChecked ? 'var(--color-primary-hover)' : 'var(--text-secondary)',
                            fontWeight: isChecked ? 'bold' : 'normal',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            #{idx + 1} {img.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Settings, Groups Management & Fine Adjustment */}
              <div style={{
                width: 350,
                minWidth: 330,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                overflowY: 'auto',
                paddingRight: 4,
                borderLeft: '1px solid var(--border-default)',
                paddingLeft: 10
              }}>
                {/* Tabs Header */}
                <div style={{
                  display: 'flex',
                  gap: 3,
                  background: 'var(--bg-base)',
                  padding: 3,
                  borderRadius: 'var(--border-radius-sm)',
                  border: '1px solid var(--border-default)',
                  flexShrink: 0
                }}>
                  <button
                    className={`btn btn-sm ${stitchRightTab === 'threshold' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, fontSize: '10.5px', padding: '5px 2px', lineHeight: 1.1 }}
                    onClick={() => setStitchRightTab('threshold')}
                  >
                    {t('analysis.imageProcessor.tabThreshold', '⚙️ 閾値・方式')}
                  </button>
                  <button
                    className={`btn btn-sm ${stitchRightTab === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, fontSize: '10.5px', padding: '5px 2px', lineHeight: 1.1 }}
                    onClick={() => setStitchRightTab('groups')}
                  >
                    {t('analysis.imageProcessor.tabGroups', { count: stitchGroups.length, defaultValue: `👥 画像群 (${stitchGroups.length})` })}
                  </button>
                  <button
                    className={`btn btn-sm ${stitchRightTab === 'tile' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, fontSize: '10.5px', padding: '5px 2px', lineHeight: 1.1 }}
                    onClick={() => setStitchRightTab('tile')}
                  >
                    {t('analysis.imageProcessor.tabFineTune', '📍 微調整')}
                  </button>
                </div>

                {/* TAB 1: ⚙️ 検出・閾値設定 (常時フル表示でいつでも調整可能) */}
                {stitchRightTab === 'threshold' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Alignment Mode */}
                    <div style={{ background: 'var(--bg-base)', padding: '8px 10px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="form-label" style={{ fontSize: '10px', marginBottom: 2 }}>{t('analysis.imageProcessor.alignmentMethod', 'アライメント方式')}</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className={`btn btn-sm ${stitchMode === 'object' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}
                          onClick={() => {
                            setStitchMode('object');
                            computeAlignment(selectedStitchIndices, 'object', stitchGridCols, stitchGridRows, stitchOverlapRatio, detectionParams);
                          }}
                          disabled={stitchAligning || stitchProcessing}
                        >
                          {t('analysis.imageProcessor.methodObjectDetect', '🎯 物体検出・認識')}
                        </button>
                        <button
                          className={`btn btn-sm ${stitchMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}
                          onClick={() => {
                            setStitchMode('grid');
                            computeAlignment(selectedStitchIndices, 'grid', stitchGridCols, stitchGridRows, stitchOverlapRatio, detectionParams);
                          }}
                          disabled={stitchAligning || stitchProcessing}
                        >
                          <Grid size={12} /> {t('analysis.imageProcessor.methodGrid', 'グリッド配置')}
                        </button>
                      </div>

                      {/* Grid Options (if grid mode) */}
                      {stitchMode === 'grid' && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                          <div>
                            <label className="form-label" style={{ fontSize: '9px', marginBottom: 2 }}>{t('analysis.imageProcessor.gridCols', '列(横)')}</label>
                            <input
                              type="number"
                              min={1}
                              max={8}
                              className="form-input"
                              style={{ width: 45, fontSize: '10px', padding: '2px 4px' }}
                              value={stitchGridCols}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value));
                                setStitchGridCols(val);
                                computeAlignment(selectedStitchIndices, 'grid', val, stitchGridRows, stitchOverlapRatio, detectionParams);
                              }}
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '9px', marginBottom: 2 }}>{t('analysis.imageProcessor.gridRows', '行(縦)')}</label>
                            <input
                              type="number"
                              min={1}
                              max={8}
                              className="form-input"
                              style={{ width: 45, fontSize: '10px', padding: '2px 4px' }}
                              value={stitchGridRows}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value));
                                setStitchGridRows(val);
                                computeAlignment(selectedStitchIndices, 'grid', stitchGridCols, val, stitchOverlapRatio, detectionParams);
                              }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="form-label" style={{ fontSize: '9px', marginBottom: 2 }}>{t('analysis.imageProcessor.gridOverlap', { percent: Math.round(stitchOverlapRatio * 100), defaultValue: `重なり: ${Math.round(stitchOverlapRatio * 100)}%` })}</label>
                            <input
                              type="range"
                              min={0.05}
                              max={0.50}
                              step={0.05}
                              value={stitchOverlapRatio}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setStitchOverlapRatio(val);
                                computeAlignment(selectedStitchIndices, 'grid', stitchGridCols, stitchGridRows, val, detectionParams);
                              }}
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Object Detection Thresholds Card */}
                    {stitchMode === 'object' && (
                      <div style={{
                        padding: '10px',
                        background: 'var(--bg-base)',
                        borderRadius: 'var(--border-radius-sm)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontSize: '11px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '11px', color: 'var(--color-primary)' }}>
                            {t('analysis.imageProcessor.detectionSettings', '⚙️ 物体検出 閾値・感度設定')}
                          </span>
                          <button
                            className={`btn btn-sm ${stitchViewMode === 'detect_preview' ? 'btn-success' : 'btn-secondary'}`}
                            style={{ fontSize: '9.5px', padding: '2px 6px', gap: 3 }}
                            onClick={() => setStitchViewMode(stitchViewMode === 'detect_preview' ? 'map' : 'detect_preview')}
                            title={t('analysis.imageProcessor.inspectDetectTitle', '選択した画像の検出結果（二値化マスク＆検出枠）を画面に表示')}
                          >
                            <Sliders size={11} />
                            <span>{stitchViewMode === 'detect_preview' ? t('analysis.imageProcessor.checkingDetectPreview', '✓ 検出プレビュー中') : t('analysis.imageProcessor.checkDetection', '🔍 検出結果を確認')}</span>
                          </button>
                        </div>

                        {/* Live Detection Summary for Inspected Image */}
                        <div style={{
                          background: 'var(--bg-surface)',
                          padding: '6px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--border-default)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                              {t('analysis.imageProcessor.inspectImage', { idx: inspectImageIdx + 1, name: images[inspectImageIdx]?.name || '', defaultValue: `検査画像: #${inspectImageIdx + 1} ${images[inspectImageIdx]?.name || ''}` })}
                            </span>
                            {inspectLoading ? (
                              <RefreshCw size={11} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                            ) : (
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 'bold',
                                color: (inspectDetectionResult?.objects.length ?? 0) > 0 ? '#10B981' : '#EF4444'
                              }}>
                                {t('analysis.imageProcessor.detectedObjectsCount', { count: inspectDetectionResult?.objects.length ?? 0, defaultValue: `🎯 検出数: ${inspectDetectionResult?.objects.length ?? 0} 個` })}
                              </span>
                            )}
                          </div>
                          {inspectDetectionResult && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-tertiary)' }}>
                              <span>{t('analysis.imageProcessor.effectiveThreshold', { val: inspectDetectionResult.threshold, defaultValue: `実効閾値: ${inspectDetectionResult.threshold}` })}</span>
                              <span>{t('analysis.imageProcessor.estimatedPolarity', { val: inspectDetectionResult.estimatedInvert ? t('analysis.imageProcessor.brightField', '明背景(明視野)') : t('analysis.imageProcessor.darkField', '暗背景(蛍光)'), defaultValue: `極性推定: ${inspectDetectionResult.estimatedInvert ? '明背景(明視野)' : '暗背景(蛍光)'}` })}</span>
                            </div>
                          )}
                        </div>

                        {/* If 0 objects detected, display clear helpful hint */}
                        {inspectDetectionResult && inspectDetectionResult.objects.length === 0 && !inspectLoading && (
                          <div style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            padding: '6px 8px',
                            borderRadius: 4,
                            fontSize: '9.5px',
                            color: '#FCA5A5',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}>
                            <div>
                              {t('analysis.imageProcessor.noObjectsWarning', '⚠️ 物体が検出されていません。背景と物体の明暗設定が逆になっている可能性があります。')}
                            </div>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '9px', padding: '2px 6px', color: '#fff', background: 'rgba(239, 68, 68, 0.3)' }}
                              onClick={() => setDetectionParams({ ...detectionParams, invert: !detectionParams.invert })}
                            >
                              {t('analysis.imageProcessor.togglePolarity', { val: detectionParams.invert ? t('analysis.imageProcessor.toDarkBg', '暗背景・明物体へ') : t('analysis.imageProcessor.toBrightBg', '明背景・暗物体へ'), defaultValue: `🔄 明暗極性を反転（${detectionParams.invert ? '暗背景・明物体へ' : '明背景・暗物体へ'}）` })}
                            </button>
                          </div>
                        )}

                        {/* Always-visible Threshold Slider Card */}
                        <div style={{
                          background: 'var(--bg-surface)',
                          padding: '8px 10px',
                          borderRadius: 4,
                          border: '1px solid var(--border-default)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="form-label" style={{ fontSize: '11px', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>
                              {t('analysis.imageProcessor.brightnessThresholdSlider', '🎚️ 二値化・輝度閾値スライダー')}
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 'bold', color: 'var(--color-primary)', fontSize: '13px' }}>
                                {detectionParams.thresholdMode === 'otsu' && inspectDetectionResult
                                  ? `${inspectDetectionResult.threshold} (${t('analysis.imageProcessor.otsuAuto', '自動')})`
                                  : detectionParams.manualThreshold}
                              </span>
                              {detectionParams.thresholdMode === 'manual' ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '8.5px', padding: '1px 4px', color: 'var(--color-primary)' }}
                                  onClick={() => setDetectionParams({ ...detectionParams, thresholdMode: 'otsu' })}
                                  title={t('analysis.imageProcessor.resetToAutoTitle', '大津の自動二値化に戻す')}
                                >
                                  {t('analysis.imageProcessor.resetToAuto', '↺ 自動に戻す')}
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '8.5px', padding: '1px 4px', color: 'var(--color-secondary)' }}
                                  onClick={() => {
                                    const otsuVal = inspectDetectionResult?.threshold ?? 128;
                                    setDetectionParams({ ...detectionParams, thresholdMode: 'manual', manualThreshold: otsuVal });
                                  }}
                                  title={t('analysis.imageProcessor.manualAdjustTitle', '自動計算値をベースに手動微調整を開始')}
                                >
                                  {t('analysis.imageProcessor.manualAdjust', '✎ 手動調整')}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Permanent Interactive Slider */}
                          <input
                            type="range"
                            min={1}
                            max={254}
                            value={detectionParams.thresholdMode === 'manual' ? detectionParams.manualThreshold : (inspectDetectionResult?.threshold ?? 128)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setDetectionParams({
                                ...detectionParams,
                                thresholdMode: 'manual',
                                manualThreshold: val
                              });
                            }}
                            style={{ width: '100%', cursor: 'pointer' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-tertiary)' }}>
                            <span>{t('analysis.imageProcessor.thresholdHintDark', '1 (暗い物体も広く拾う)')}</span>
                            <span>{t('analysis.imageProcessor.thresholdHintBright', '254 (高輝度のみ厳密に拾う)')}</span>
                          </div>
                        </div>

                        {/* Min Area Slider */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <label className="form-label" style={{ fontSize: '10px' }}>{t('analysis.imageProcessor.minObjectSize', '最小物体サイズ (ノイズ除去)')}</label>
                            <span style={{ fontWeight: 'bold', color: 'var(--color-primary)', fontSize: '11px' }}>
                              {detectionParams.minArea} px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            step={1}
                            value={detectionParams.minArea}
                            onChange={(e) => setDetectionParams({ ...detectionParams, minArea: Number(e.target.value) })}
                            style={{ width: '100%', cursor: 'pointer' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-tertiary)' }}>
                            <span>{t('analysis.imageProcessor.minSizeHintSmall', '1px (極小点・細胞核も検出)')}</span>
                            <span>{t('analysis.imageProcessor.minSizeHintLarge', '100px (大きな構造のみ)')}</span>
                          </div>
                        </div>

                        {/* Polarity (Light vs Dark background) */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>{t('analysis.imageProcessor.polarityLabel', '明暗極性（背景と物体）')}</label>
                            {inspectDetectionResult && (
                              <span style={{ fontSize: '8.5px', color: 'var(--color-secondary)' }}>
                                {t('analysis.imageProcessor.polarityEstimated', { val: inspectDetectionResult.estimatedInvert ? t('analysis.imageProcessor.statusBrightBg', '明背景') : t('analysis.imageProcessor.statusDarkBg', '暗背景'), defaultValue: `推定: ${inspectDetectionResult.estimatedInvert ? '明背景' : '暗背景'}` })}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className={`btn btn-sm ${!detectionParams.invert ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ flex: 1, fontSize: '10px', padding: '4px 4px' }}
                              onClick={() => setDetectionParams({ ...detectionParams, invert: false })}
                            >
                              {t('analysis.imageProcessor.polarityDarkBg', '暗背景・明物体 (蛍光など)')}
                            </button>
                            <button
                              className={`btn btn-sm ${detectionParams.invert ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ flex: 1, fontSize: '10px', padding: '4px 4px' }}
                              onClick={() => setDetectionParams({ ...detectionParams, invert: true })}
                            >
                              {t('analysis.imageProcessor.polarityBrightBg', '明背景・暗物体 (明視野など)')}
                            </button>
                          </div>
                        </div>

                        {/* Invert Image Colors (Negative / Positive) */}
                        <div>
                          <label className="form-label" style={{ fontSize: '10px', marginBottom: 2 }}>{t('analysis.imageProcessor.imageInvertOption', '画像反転オプション')}</label>
                          <button
                            className={`btn btn-sm ${detectionParams.invertImageColors ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ width: '100%', fontSize: '10px', padding: '4px 6px', justifyContent: 'center' }}
                            onClick={() => setDetectionParams({ ...detectionParams, invertImageColors: !detectionParams.invertImageColors })}
                          >
                            {t('analysis.imageProcessor.imageInvertToggle', { val: detectionParams.invertImageColors ? ' [ON]' : ' [OFF]', defaultValue: `🔄 画像を白黒反転（ネガ/ポジ）して検出 ${detectionParams.invertImageColors ? ' [有効]' : ' [無効]'}` })}
                          </button>
                        </div>

                        {/* Recalculate Button */}
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%', fontSize: '11px', padding: '7px 8px', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          onClick={() => computeAlignment(selectedStitchIndices, 'object', stitchGridCols, stitchGridRows, stitchOverlapRatio, detectionParams)}
                          disabled={stitchAligning || stitchProcessing}
                        >
                          <RefreshCw size={13} className={stitchAligning ? 'animate-spin' : ''} />
                          <span>{t('analysis.imageProcessor.reapplyAll', '⚡ 全画像に閾値を適用して再解析')}</span>
                        </button>
                      </div>
                    )}

                    {/* Blending Mode Card */}
                    <div style={{ background: 'var(--bg-base)', padding: '8px 10px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label className="form-label" style={{ fontSize: '10px', marginBottom: 2 }}>{t('analysis.imageProcessor.blendMode', '境界ブレンディング（合成処理）')}</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '11px', padding: '3px 6px' }}
                        value={stitchBlendMode}
                        onChange={(e) => setStitchBlendMode(e.target.value as BlendMode)}
                      >
                        <option value="feather">{t('analysis.imageProcessor.blendFeather', 'なめらかフェザー（境界線を自然に融合）')}</option>
                        <option value="max">{t('analysis.imageProcessor.blendMax', '最大輝度（蛍光シグナル・MIP合成）')}</option>
                        <option value="average">{t('analysis.imageProcessor.blendAverage', '単純配置（重なり上書き）')}</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* TAB 2: 👥 画像群 (グループ) 手動管理 */}
                {stitchRightTab === 'groups' && (
                  <div style={{ background: 'var(--bg-base)', padding: '8px 10px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                          {t('analysis.imageProcessor.detectedGroups', { count: stitchGroups.length, defaultValue: `👥 検出された画像群 (${stitchGroups.length} 群)` })}
                        </span>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '10px', padding: '2px 6px', gap: 3, color: 'var(--color-primary)' }}
                        onClick={() => handleCreateNewGroup()}
                      >
                        <PlusCircle size={12} />
                        <span>{t('analysis.imageProcessor.newGroup', '＋ 新規群')}</span>
                      </button>
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>
                      {t('analysis.imageProcessor.groupNote', '※同物体画像は固めて配置、独立群は別位置に分離配置。下のセレクトから画像を別群へ移動できます。')}
                    </div>

                    {/* Groups List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                      {stitchGroups.map((g) => (
                        <div
                          key={g.id}
                          style={{
                            background: 'var(--bg-surface)',
                            borderRadius: 4,
                            border: `1.5px solid ${g.color}`,
                            padding: '6px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                              <span style={{ fontSize: '10px', fontWeight: 'bold', color: g.color }}>{g.name}</span>
                              <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{t('analysis.imageProcessor.groupCount', { count: g.imageIndices.length, defaultValue: `(${g.imageIndices.length}枚)` })}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {g.imageIndices.map(imgIdx => {
                              const img = images[imgIdx];
                              if (!img) return null;
                              const isTileSelected = selectedTileIndex === imgIdx;
                              return (
                                <div
                                  key={imgIdx}
                                  onClick={() => setSelectedTileIndex(imgIdx)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 4,
                                    background: isTileSelected ? 'var(--bg-surface-active)' : 'var(--bg-base)',
                                    padding: '2px 4px',
                                    borderRadius: 3,
                                    cursor: 'pointer',
                                    border: isTileSelected ? '1px solid var(--color-secondary)' : '1px solid transparent'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                                    <img src={img.url} alt={img.name} style={{ width: 18, height: 18, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                                    <span style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 95 }} title={img.name}>
                                      #{imgIdx + 1} {img.name}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} onClick={e => e.stopPropagation()}>
                                    <select
                                      className="form-select"
                                      style={{ fontSize: '8.5px', padding: '1px 2px', height: 18, width: 78 }}
                                      value={g.id}
                                      onChange={(e) => {
                                        const targetId = e.target.value;
                                        if (targetId === '__NEW__') {
                                          handleCreateNewGroup(imgIdx);
                                        } else if (targetId !== g.id) {
                                          handleMoveImageToGroup(imgIdx, targetId);
                                        }
                                      }}
                                    >
                                      <option value={g.id}>{t('analysis.imageProcessor.here', 'ここ')}</option>
                                      {stitchGroups.filter(other => other.id !== g.id).map(other => (
                                        <option key={other.id} value={other.id}>➔ {other.name.replace(/画像群 |Group /g, 'G')}</option>
                                      ))}
                                      <option value="__NEW__">{t('analysis.imageProcessor.toNewGroup', '＋ 新規群へ')}</option>
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 3: 📍 タイル微調整 */}
                {stitchRightTab === 'tile' && (
                  <div style={{ background: 'var(--bg-base)', padding: '8px 10px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                      {t('analysis.imageProcessor.fineTuneTile', '📍 選択タイルの微調整')}
                    </span>

                    <select
                      className="form-select"
                      style={{ fontSize: '10px', padding: '3px 6px' }}
                      value={selectedTileIndex ?? ''}
                      onChange={(e) => setSelectedTileIndex(Number(e.target.value))}
                    >
                      {stitchPlacements.map((p, idx) => {
                        const grp = stitchGroups.find(g => g.id === p.groupId);
                        return (
                          <option key={p.imageIndex} value={p.imageIndex}>
                            {grp ? `[${grp.name.replace(/画像群 |Group /g, 'G')}] ` : ''}#{idx + 1}: {p.name}
                          </option>
                        );
                      })}
                    </select>

                    {selectedTileIndex !== null && (() => {
                      const selPlacement = stitchPlacements.find(p => p.imageIndex === selectedTileIndex);
                      if (!selPlacement) return null;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
                            <span>{t('analysis.imageProcessor.tilePosition', { x: selPlacement.x, y: selPlacement.y, defaultValue: `位置: (${selPlacement.x}, ${selPlacement.y}) px` })}</span>
                            <span>{t('analysis.imageProcessor.tileConfidence', { val: Math.round(selPlacement.confidence * 100), defaultValue: `信頼度: ${Math.round(selPlacement.confidence * 100)}%` })}</span>
                          </div>

                          {/* Nudge arrow buttons */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 140, margin: '4px auto' }}>
                            <div />
                            <button className="btn btn-secondary btn-sm" style={{ padding: 4 }} onClick={() => handleAdjustTile(0, -5)} title="Up 5px">▲</button>
                            <div />
                            <button className="btn btn-secondary btn-sm" style={{ padding: 4 }} onClick={() => handleAdjustTile(-5, 0)} title="Left 5px">◀</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: 4, fontSize: '9px' }} onClick={() => handleAdjustTile(0, 0)} title="Center">●</button>
                            <button className="btn btn-secondary btn-sm" style={{ padding: 4 }} onClick={() => handleAdjustTile(5, 0)} title="Right 5px">▶</button>
                            <div />
                            <button className="btn btn-secondary btn-sm" style={{ padding: 4 }} onClick={() => handleAdjustTile(0, 5)} title="Down 5px">▼</button>
                            <div />
                          </div>

                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => handleAdjustTile(-1, 0)}>← 1px</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => handleAdjustTile(1, 0)}>1px →</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => handleAdjustTile(0, -1)}>↑ 1px</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => handleAdjustTile(0, 1)}>↓ 1px</button>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--border-default)' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ width: '100%', fontSize: '10px', padding: '4px 6px' }}
                        onClick={() => computeAlignment()}
                        disabled={stitchAligning || stitchProcessing}
                      >
                        <RefreshCw size={12} className={stitchAligning ? 'animate-spin' : ''} />
                        <span>{t('analysis.imageProcessor.recalculateAlignment', '再アライメント計算')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '8px 16px', flexDirection: 'column', gap: 6 }}>
              {(stitchProcessing || stitchAligning) && (
                <div style={{ width: '100%', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                    <RefreshCw className="animate-spin" size={14} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                      {stitchProgress}% — {stitchProgressMsg || t('common.loading', '処理中...')}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 5, background: 'rgba(99,102,241,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${stitchProgress}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
                <button className="btn btn-secondary" onClick={() => setShowStitchModal(false)} disabled={stitchProcessing}>
                  {t('common.cancel', 'キャンセル')}
                </button>
                <button
                  className="btn btn-success"
                  onClick={generateStitchedMap}
                  disabled={stitchProcessing || stitchAligning || selectedStitchIndices.length < 2 || stitchPlacements.length < 2}
                >
                  <MapIcon size={14} />
                  <span>
                    {stitchProcessing
                      ? t('analysis.imageProcessor.generatingMapProgress', { progress: stitchProgress, defaultValue: `マップ合成中... ${stitchProgress}%` })
                      : t('analysis.imageProcessor.generateMapBtn', { imagesCount: stitchPlacements.length, groupsCount: stitchGroups.length, defaultValue: `🗺️ マップを生成して画像リストに追加 (${stitchPlacements.length}枚 / ${stitchGroups.length}画像群)` })}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Max Intensity Projection (MIP) Modal */}
      {showMipModal && (
        <div className="modal-overlay" onClick={() => !mipProcessing && setShowMipModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />
                <h2 className="modal-title">{t('analysis.imageProcessor.mipModalTitle', 'Max Intensity（最大輝度投影）画像の作製')}</h2>
              </div>
              {!mipProcessing && (
                <button className="btn btn-ghost btn-icon" onClick={() => setShowMipModal(false)}>
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                {t('analysis.imageProcessor.mipModalDesc1', '選択した複数画像の各ピクセルにおける最大輝度値（Max Intensity）を抽出し、焦点深度の深い1枚のクリアな画像として合成します。')}
                {t('analysis.imageProcessor.mipModalDesc2', '作製された画像はリストに追加され、そのまま円囲みや点カウント解析、画像保存が可能です。')}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-xs) 0' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>
                  {t('analysis.imageProcessor.mipSelectImages', { selected: selectedMipIndices.length, total: images.length, defaultValue: `合成対象の画像を選択 (${selectedMipIndices.length} / ${images.length} 枚選択中):` })}
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={handleSelectAllMip}>
                    {t('analysis.imageProcessor.selectAll', 'すべて選択')}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={handleDeselectAllMip}>
                    {t('analysis.imageProcessor.deselectAll', '全解除')}
                  </button>
                </div>
              </div>

              {/* Image Grid with Checkboxes */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: 'var(--space-sm)',
                maxHeight: '340px',
                overflowY: 'auto',
                padding: 'var(--space-xs)',
                background: 'var(--bg-base)',
                borderRadius: 'var(--border-radius-md)'
              }}>
                {images.map((img, idx) => {
                  const isChecked = selectedMipIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleMipIndex(idx)}
                      style={{
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 'var(--border-radius-md)',
                        border: isChecked ? '2px solid var(--color-primary)' : '1px solid var(--border-default)',
                        background: isChecked ? 'var(--color-primary-dim)' : 'var(--bg-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        position: 'relative'
                      }}
                    >
                      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
                        {isChecked ? (
                          <CheckSquare size={18} style={{ color: 'var(--color-primary)', background: '#000', borderRadius: 2 }} />
                        ) : (
                          <Square size={18} style={{ color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.5)', borderRadius: 2 }} />
                        )}
                      </div>
                      <img
                        src={img.url}
                        alt={img.name}
                        style={{ width: '100%', height: 75, objectFit: 'cover', borderRadius: 4 }}
                      />
                      <div style={{
                        fontSize: '10px',
                        color: isChecked ? 'var(--color-primary-hover)' : 'var(--text-secondary)',
                        fontWeight: isChecked ? 'bold' : 'normal',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {img.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMipModal(false)} disabled={mipProcessing}>
                {t('common.cancel', 'キャンセル')}
              </button>
              <button
                className="btn btn-primary"
                onClick={generateMaxIntensityImage}
                disabled={mipProcessing || selectedMipIndices.length < 2}
              >
                <Sparkles size={14} />
                <span>{mipProcessing ? t('analysis.imageProcessor.mipProcessing', '合成処理中...') : t('analysis.imageProcessor.mipCreateBtn', { count: selectedMipIndices.length, defaultValue: `Max Intensity画像を作製 (${selectedMipIndices.length}枚)` })}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', minHeight: 560 }}>
        {/* Left: Image List */}
        <div style={{ width: 145, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
            <FolderOpen size={14} />
            <span>{t('analysis.imageProcessor.selectFolder', 'フォルダ選択')}</span>
            <input
              type="file"
              // @ts-ignore - webkitdirectory
              webkitdirectory=""
              multiple
              style={{ display: 'none' }}
              onChange={handleDirectorySelect}
            />
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center', flex: 1, padding: '4px 6px' }}>
              <Upload size={13} />
              <span>{t('analysis.imageProcessor.addFiles', '追加')}</span>
              <input
                type="file"
                multiple
                accept="image/*,.tif,.tiff"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  setLoadingImages(true);
                  try {
                    const newImages: ImageData[] = [];
                    for (let i = 0; i < files.length; i++) {
                      const f = files[i];
                      if (/\.(png|jpe?g|tiff?|webp|bmp|gif)$/i.test(f.name)) {
                        try {
                          const res = await processImageFile(f);
                          newImages.push({
                            blob: res.blob,
                            url: res.url,
                            brightness: 0,
                            name: f.name
                          });
                        } catch (err) {
                          console.error(`Error loading image ${f.name}:`, err);
                        }
                      }
                    }
                    if (newImages.length === 0) return;
                    const combined = [...images, ...newImages];
                    setImages(combined);
                    if (activeImageIdx < 0) setActiveImageIdx(0);
                    await saveImagesToDB(combined.map(img => ({ name: img.name, blob: img.blob, brightness: img.brightness })));
                  } finally {
                    setLoadingImages(false);
                  }
                }}
              />
            </label>
            {images.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px 6px', color: 'var(--color-danger)' }}
                onClick={handleClearImages}
                title={t('analysis.imageProcessor.clearImageList', '画像リストをクリア')}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* Action Buttons for Multi-image operations */}
          {images.length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* マップ生成機能はUIから一時削除 */}

              <button
                className="btn btn-secondary btn-sm"
                onClick={openMipModal}
                title={t('analysis.imageProcessor.mipToolTitle', '複数画像からMax Intensity（最大輝度投影）画像を合成作製')}
                style={{
                  fontSize: '11px',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                }}
              >
                <Sparkles size={13} />
                <span>Max Intensity</span>
              </button>
            </div>
          )}

          {loadingImages && (
            <div style={{ fontSize: 'var(--font-size-xs)', textAlign: 'center', color: 'var(--color-primary)', padding: 4 }}>
              {t('analysis.imageProcessor.convertingImage', '画像変換中...')}
            </div>
          )}

          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 'calc(100vh - 380px)'
          }}>
            {images.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setActiveImageIdx(idx)}
                style={{
                  cursor: 'pointer',
                  border: idx === activeImageIdx ? '2px solid var(--color-primary)' : '1px solid var(--border-default)',
                  borderRadius: 'var(--border-radius-md)',
                  padding: 4,
                  background: idx === activeImageIdx ? 'var(--bg-surface-hover)' : 'transparent',
                  position: 'relative'
                }}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }}
                />
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {img.name}
                </div>
                {(roiCountByImage[img.name] || 0) > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: 'var(--color-primary)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    {roiCountByImage[img.name]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: Canvas & Toolbars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Main Toolbar */}
          <div className="card" style={{ marginBottom: 'var(--space-xs)' }}>
            <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center', padding: 'var(--space-sm) var(--space-md)' }}>
              {/* Tool Mode Buttons */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-base)', borderRadius: 'var(--border-radius-md)', padding: 2 }}>
                <button
                  className={`btn btn-sm ${toolMode === 'select' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setToolMode('select')}
                  title={t('analysis.imageProcessor.toolSelectTitle', '選択 / 移動 (キー: S)')}
                >
                  <MousePointer size={15} /> <span>{t('analysis.imageProcessor.toolSelect', '選択')}</span>
                </button>
                <button
                  className={`btn btn-sm ${toolMode === 'circle' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setToolMode('circle')}
                  title={t('analysis.imageProcessor.toolCircleTitle', '円で囲む (キー: C)')}
                >
                  <Circle size={15} /> <span>{t('analysis.imageProcessor.toolCircle', '囲み')}</span>
                </button>
                <button
                  className={`btn btn-sm ${toolMode === 'point' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setToolMode('point')}
                  title={t('analysis.imageProcessor.toolPointTitle', '点プロット (キー: P) — 囲み内または画像全体をクリックしてカウント')}
                >
                  <Crosshair size={15} /> <span>{t('analysis.imageProcessor.toolPoint', '点プロット')}</span>
                </button>
              </div>

              {/* Undo Button */}
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleUndo}
                disabled={history.length === 0}
                title={t('analysis.imageProcessor.undoTitle', '1つ前の状態に戻す (Ctrl+Z)')}
                style={{ opacity: history.length === 0 ? 0.5 : 1 }}
              >
                <Undo2 size={15} /> <span>{t('analysis.imageProcessor.undo', '1つ戻す')}</span>
              </button>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Point Type Quick Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', fontWeight: 'bold' }}>{t('analysis.imageProcessor.pointColor', '点の色:')}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {pointTypes.map(pt => (
                    <button
                      key={pt.id}
                      onClick={() => {
                        setActivePointTypeId(pt.id);
                        setToolMode('point');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 'var(--border-radius-md)',
                        border: activePointTypeId === pt.id ? `2px solid ${pt.color}` : '1px solid var(--border-default)',
                        background: activePointTypeId === pt.id ? `${pt.color}25` : 'var(--bg-base)',
                        color: activePointTypeId === pt.id ? pt.color : 'var(--text-primary)',
                        fontWeight: activePointTypeId === pt.id ? 'bold' : 'normal',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                      title={t('analysis.imageProcessor.pointTypeTooltip', { name: getPointTypeDisplayName(pt.name), shortcut: pt.shortcut, defaultValue: `点タイプ: ${getPointTypeDisplayName(pt.name)} (ショートカット: ${pt.shortcut})` })}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: pt.color }} />
                      <span>{getPointTypeDisplayName(pt.name)}</span>
                      {pt.shortcut && <span style={{ opacity: 0.6, fontSize: '10px' }}>({pt.shortcut})</span>}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 4 }}
                  onClick={() => setShowPointSettings(!showPointSettings)}
                  title={t('analysis.imageProcessor.pointTypeSettings', '点タイプの設定・追加')}
                >
                  <Palette size={14} />
                </button>
              </div>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Zoom Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-base)', borderRadius: 'var(--border-radius-md)', padding: '2px 4px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 5px' }}
                  onClick={() => setZoomLevel(prev => Math.max(0.01, Number((prev <= 0.2 ? prev * 0.75 : (prev <= 1 ? prev - 0.1 : prev - 0.25)).toFixed(3))))}
                  title={t('analysis.imageProcessor.zoomOut', '縮小')}
                  disabled={!activeImage}
                >
                  <ZoomOut size={13} />
                </button>
                <select
                  className="form-select"
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '2px 18px 2px 6px',
                    height: 24,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                  value={Math.round(zoomLevel * 100)}
                  onChange={(e) => setZoomLevel(Number(e.target.value) / 100)}
                  disabled={!activeImage}
                >
                  <option value={5}>5%</option>
                  <option value={10}>10%</option>
                  <option value={25}>25%</option>
                  <option value={50}>50%</option>
                  <option value={75}>75%</option>
                  <option value={100}>{t('analysis.imageProcessor.zoomActual', '100% (実寸)')}</option>
                  <option value={125}>125%</option>
                  <option value={150}>150%</option>
                  <option value={200}>200% ({t('analysis.imageProcessor.zoom2x', '2倍')})</option>
                  <option value={300}>300% ({t('analysis.imageProcessor.zoom3x', '3倍')})</option>
                  <option value={400}>400% ({t('analysis.imageProcessor.zoom4x', '4倍')})</option>
                  <option value={500}>500% ({t('analysis.imageProcessor.zoom5x', '5倍')})</option>
                  <option value={800}>800% ({t('analysis.imageProcessor.zoom8x', '8倍')})</option>
                  <option value={1000}>1000% ({t('analysis.imageProcessor.zoom10x', '10倍')})</option>
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 5px' }}
                  onClick={() => setZoomLevel(prev => Math.min(10.0, Number((prev < 1 ? prev + 0.1 : prev + 0.25).toFixed(2))))}
                  title={t('analysis.imageProcessor.zoomIn', '拡大')}
                  disabled={!activeImage}
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={handleFitToScreen}
                  title={t('analysis.imageProcessor.zoomFitTitle', '画面に合わせて最適な大きさに拡大/縮小')}
                  disabled={!activeImage}
                >
                  <Maximize2 size={11} /> <span>{t('analysis.imageProcessor.zoomFit', 'フィット')}</span>
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={() => setZoomLevel(1)}
                  title={t('analysis.imageProcessor.zoom100Title', '原寸100%で表示')}
                  disabled={!activeImage}
                >
                  <span>100%</span>
                </button>
              </div>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Brightness */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.imageProcessor.brightness', '輝度:')}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={activeImage?.brightness || 0}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ width: 26, textAlign: 'right', color: 'var(--text-secondary)' }}>{activeImage?.brightness || 0}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: 2 }} onClick={() => handleBrightnessChange(0)} title={t('analysis.imageProcessor.reset', 'リセット')}>
                  <RefreshCw size={12} />
                </button>
              </div>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Selected ROI Label Selector & Delete */}
              {selectedRegionId && (() => {
                const selRegion = regions.find(r => r.id === selectedRegionId);
                if (!selRegion) return null;
                return (
                  <>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: selRegion.isFullImage ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                      {getRegionIdDisplay(selRegion)}
                    </span>
                    <select
                      className="form-select"
                      style={{ maxWidth: 130, fontSize: 'var(--font-size-xs)', padding: '4px 6px' }}
                      value={selRegion.labelId || ''}
                      onChange={(e) => handleSetLabel(selectedRegionId, e.target.value)}
                    >
                      <option value="">{t('analysis.imageProcessor.unassignedLabel', 'ラベル未設定')}</option>
                      {labels.map(l => (
                        <option key={l.id} value={l.id}>{getLabelDisplayName(l.name)}</option>
                      ))}
                    </select>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRegion(selectedRegionId)} title={selRegion.isFullImage ? t('analysis.imageProcessor.clearWholeImage', '画像全体のデータをクリア') : t('analysis.imageProcessor.deleteRoi', 'ROI削除')}>
                      <Trash2 size={14} />
                    </button>
                  </>
                );
              })()}

              <div style={{ flex: 1 }} />

              {/* Reference Toggle */}
              <button
                className={`btn btn-sm ${showRefPanel ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => {
                  if (!showRefPanel && refImageIndices.length === 0 && images.length > 0) {
                    const candidateIdx = images.findIndex((_, idx) => idx !== activeImageIdx);
                    setRefImageIndices([candidateIdx >= 0 ? candidateIdx : 0]);
                  }
                  setShowRefPanel(!showRefPanel);
                }}
                title={t('analysis.imageProcessor.refImagesTitle', '参照画像を表示（最大3枚まで並べて比較可能）')}
              >
                {showRefPanel ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{t('analysis.imageProcessor.refImagesBtn', '参照画像')} {refImageIndices.length > 0 ? `(${refImageIndices.length})` : ''}</span>
              </button>

              {/* Download raw image / MIP as TIFF */}
              <button className="btn btn-ghost btn-sm" onClick={downloadActiveRawImage} disabled={!activeImage} title={t('analysis.imageProcessor.saveTiffTitle', '現在表示中の元画像/MIP画像をTIFF（.tif）形式で保存')}>
                <Download size={14} /> <span>{t('analysis.imageProcessor.saveTiff', 'TIFF保存')}</span>
              </button>

              {/* Export annotated image as TIFF */}
              <button className="btn btn-ghost btn-sm" onClick={exportImage} disabled={!activeImage} title={t('analysis.imageProcessor.exportAnalysisTiffTitle', 'アノテーション（囲み・打点）付き解析画像をTIFF（.tif）形式で出力')}>
                <Download size={14} /> <span>{t('analysis.imageProcessor.exportAnalysisTiff', '解析図出力(TIFF)')}</span>
              </button>
            </div>
          </div>

          {/* Point Types Settings Panel (collapsible) */}
          {showPointSettings && (
            <div className="card" style={{ marginBottom: 'var(--space-xs)', background: 'var(--bg-base)', border: '1px solid var(--border-default)' }}>
              <div className="card-body" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>{t('analysis.imageProcessor.pointTypeSettingsTitle', '📍 点タイプ（色・分類）の設定')}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPointSettings(false)}><X size={14} /></button>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <input
                    type="color"
                    value={newPointTypeColor}
                    onChange={(e) => setNewPointTypeColor(e.target.value)}
                    style={{ width: 30, height: 26, border: 'none', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('analysis.imageProcessor.newPointTypeName', '新しい点タイプ名 (例: 分裂細胞, 陽性スポット)')}
                    value={newPointTypeName}
                    onChange={(e) => setNewPointTypeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addPointType(); }}
                    style={{ maxWidth: 220, fontSize: 'var(--font-size-xs)' }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={addPointType}>
                    <Plus size={13} /> {t('analysis.imageProcessor.addPointType', '点タイプ追加')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
                  {pointTypes.map((pt, idx) => (
                    <span key={pt.id} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      borderRadius: 'var(--border-radius-full)',
                      background: `${pt.color}20`,
                      border: `1px solid ${pt.color}40`,
                      fontSize: 'var(--font-size-xs)'
                    }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: pt.color }} />
                      <span style={{ color: pt.color, fontWeight: 'bold' }}>{getPointTypeDisplayName(pt.name)}</span>
                      <span style={{ opacity: 0.6, fontSize: '10px' }}>{t('analysis.imageProcessor.keyShortcut', { key: idx + 1, defaultValue: `[キー: ${idx + 1}]` })}</span>
                      <X
                        size={12}
                        style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}
                        onClick={() => removePointType(pt.id)}
                      />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Canvas Area */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', flex: 1, minHeight: 650 }}>
            <div
              ref={containerRef}
              className="card"
              style={{
                flex: 1,
                padding: 'var(--space-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'auto',
                minHeight: 650,
                maxHeight: 'calc(100vh - 200px)',
                background: activeImage ? '#1e293b' : 'var(--bg-surface)'
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFilesDrop}
            >
              {!activeImage ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--space-xl)' }}>
                  <ImageIcon size={48} style={{ opacity: 0.3, margin: '0 auto var(--space-md)' }} />
                  <p>{t('analysis.imageProcessor.dragDropHint', 'フォルダを選択するか、画像（TIFF, PNG, JPG等）をドラッグ＆ドロップしてください')}</p>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  style={{
                    display: 'block',
                    width: `${imgRef.current ? Math.round(imgRef.current.naturalWidth * zoomLevel) : 100}px`,
                    height: `${imgRef.current ? Math.round(imgRef.current.naturalHeight * zoomLevel) : 100}px`,
                    imageRendering: zoomLevel >= 2 ? 'pixelated' : 'auto',
                    margin: 'auto',
                    cursor: toolMode === 'circle' || toolMode === 'point'
                      ? 'crosshair'
                      : dragState
                        ? (dragState.type === 'move' ? 'move' : 'crosshair')
                        : hoverCursor
                  }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onContextMenu={handleCanvasContextMenu}
                />
              )}
            </div>

            {/* Reference Image Panel (Up to 3 images vertically) */}
            {showRefPanel && (
              <div
                className="card"
                style={{
                  width: 320,
                  flexShrink: 0,
                  padding: 'var(--space-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-sm)',
                  maxHeight: 'calc(100vh - 200px)',
                  overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Eye size={14} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('analysis.imageProcessor.refImagesHeader', '参照画像 (最大3枚)')}</span>
                  </div>
                  {refImageIndices.length < 3 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 6px', fontSize: '10px', color: 'var(--color-primary)' }}
                      onClick={handleAddRefImage}
                      title={t('analysis.imageProcessor.addRefImage', '参照画像を追加 (最大3枚)')}
                    >
                      <Plus size={12} /> <span>{t('common.add', '追加')} ({refImageIndices.length}/3)</span>
                    </button>
                  )}
                </div>

                {refImageIndices.length === 0 ? (
                  <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                    <p>{t('analysis.imageProcessor.noRefImage', '参照画像が選択されていません')}</p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 6, fontSize: '11px', padding: '3px 8px' }} onClick={handleAddRefImage}>
                      <Plus size={12} /> {t('analysis.imageProcessor.addRefImageBtn', '参照画像を追加')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {refImageIndices.map((imgIdx, slotIdx) => {
                      const curImg = images[imgIdx];
                      return (
                        <div
                          key={slotIdx}
                          style={{
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--border-radius-md)',
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {/* Top selector and delete */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-primary)', width: 20 }}>
                              #{slotIdx + 1}
                            </span>
                            <select
                              className="form-select"
                              style={{ flex: 1, fontSize: '10px', padding: '2px 4px' }}
                              value={imgIdx}
                              onChange={(e) => handleSetRefImageIndex(slotIdx, Number(e.target.value))}
                            >
                              <option value={-1}>{t('analysis.imageProcessor.selectPrompt', '-- 選択 --')}</option>
                              {images.map((img, i) => (
                                <option key={i} value={i}>{img.name}</option>
                              ))}
                            </select>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: 2, color: 'var(--color-danger)' }}
                              onClick={() => handleRemoveRefImage(slotIdx)}
                              title={t('analysis.imageProcessor.removeRefImage', 'この参照画像を削除')}
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {/* Brightness control */}
                          {curImg && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{t('analysis.imageProcessor.brightness', '輝度:')}</span>
                              <input
                                type="range"
                                min={-100}
                                max={100}
                                value={curImg.brightness}
                                onChange={(e) => handleRefBrightnessChange(imgIdx, Number(e.target.value))}
                                style={{ flex: 1, height: 14 }}
                              />
                              <span style={{ width: 24, textAlign: 'right' }}>{curImg.brightness}</span>
                            </div>
                          )}

                          {/* Canvas view */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: curImg ? '#1e293b' : 'transparent',
                              borderRadius: 'var(--border-radius-sm)',
                              minHeight: 140,
                              maxHeight: 220,
                              overflow: 'hidden'
                            }}
                          >
                            {curImg ? (
                              <canvas
                                ref={(el) => { refCanvasRefs.current[slotIdx] = el; }}
                                style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }}
                              />
                            ) : (
                              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center' }}>{t('analysis.imageProcessor.selectImageThumbnail', '画像を選択')}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Target Label Settings */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', alignItems: 'center', padding: 'var(--space-sm) var(--space-md)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowLabelSettings(!showLabelSettings)}>
            <Settings size={14} />
            <span>{t('analysis.imageProcessor.targetLabelSettings', '対象ラベル設定')}</span>
            <ChevronDown size={12} style={{ transform: showLabelSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
            {labels.map(l => (
              <span key={l.id} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 10px',
                borderRadius: 'var(--border-radius-full)',
                background: `${l.color}20`,
                color: l.color,
                border: `1px solid ${l.color}40`,
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)'
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                {getLabelDisplayName(l.name)}
              </span>
            ))}
          </div>
        </div>
        {showLabelSettings && (
          <div style={{ padding: 'var(--space-sm) var(--space-md)', borderTop: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
              <input
                type="color"
                value={newLabelColor}
                onChange={(e) => setNewLabelColor(e.target.value)}
                style={{ width: 32, height: 28, border: 'none', cursor: 'pointer' }}
              />
              <input
                type="text"
                className="form-input"
                placeholder={t('analysis.imageProcessor.newTargetLabelName', '新しい対象ラベル名 (例: 陽性, 陰性, 対照群)')}
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addLabel(); }}
                style={{ maxWidth: 220, fontSize: 'var(--font-size-sm)' }}
              />
              <button className="btn btn-primary btn-sm" onClick={addLabel}>
                <Plus size={14} /> {t('common.add', '追加')}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
              {labels.map(l => (
                <span key={l.id} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 'var(--border-radius-full)',
                  background: `${l.color}20`,
                  border: `1px solid ${l.color}40`,
                  fontSize: 'var(--font-size-xs)'
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                  <span style={{ color: l.color, fontWeight: 'bold' }}>{getLabelDisplayName(l.name)}</span>
                  <X
                    size={12}
                    style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}
                    onClick={() => removeLabel(l.id)}
                  />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Table (with Multi-color Point Breakdown) */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">
            {t('analysis.imageProcessor.resultsTable', { name: sessionName, count: regions.length, defaultValue: `結果テーブル: ${sessionName} (${regions.length}件)` })}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={regions.length === 0}>
              <Download size={14} /> {t('analysis.imageProcessor.exportCsv', 'CSV出力')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={exportImage} disabled={!activeImage}>
              <ImageIcon size={14} /> {t('analysis.imageProcessor.exportImage', '画像出力')}
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {regions.length === 0 ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: 'var(--font-size-sm)' }}>
                {t('analysis.imageProcessor.noMeasurementData', 'まだ計測データがありません。「🔵 囲み」ツールで領域を囲むか、「🎯 点プロット」ツールで画像をクリックしてカウントを開始してください。')}
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>ID</th>
                    <th>{t('analysis.imageProcessor.tableImageFile', '画像ファイル')}</th>
                    <th style={{ width: 110 }}>{t('analysis.imageProcessor.tableTargetLabel', '対象ラベル')}</th>
                    <th style={{ width: 80, textAlign: 'center' }}>{t('analysis.imageProcessor.tableTotalPoints', '合計点数')}</th>
                    {/* Dynamic point type columns */}
                    {pointTypes.map(pt => (
                      <th key={pt.id} style={{ textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: pt.color }} />
                          {getPointTypeDisplayName(pt.name)}
                        </span>
                      </th>
                    ))}
                    <th style={{ width: 60, textAlign: 'center' }}>{t('analysis.imageProcessor.tableActions', '操作')}</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map(r => {
                    const label = labels.find(l => l.id === r.labelId);
                    const isActive = selectedRegionId === r.id;
                    const isCurrent = activeImage?.name === r.imageKey;

                    // Calculate point count breakdown
                    const countsByType: Record<string, number> = {};
                    r.points.forEach(p => {
                      countsByType[p.typeId] = (countsByType[p.typeId] || 0) + 1;
                    });

                    return (
                      <tr
                        key={r.id}
                        onClick={() => handleTableRowClick(r)}
                        style={{
                          cursor: 'pointer',
                          background: isActive ? 'var(--bg-surface-hover)' : undefined,
                          borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent'
                        }}
                      >
                        <td style={{ fontWeight: 'bold', color: r.isFullImage ? 'var(--color-secondary)' : 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                          {getRegionIdDisplay(r)}
                        </td>
                        <td style={{ fontSize: 'var(--font-size-xs)', color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {r.imageKey}
                        </td>
                        <td>
                          {label ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 'var(--border-radius-full)',
                              background: `${label.color}20`,
                              color: label.color,
                              fontSize: 'var(--font-size-xs)',
                              fontWeight: 'bold'
                            }}>
                              {getLabelDisplayName(label.name)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{t('analysis.imageProcessor.unassigned', '未設定')}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>
                          {r.points.length}
                        </td>
                        {/* Point count per type */}
                        {pointTypes.map(pt => {
                          const count = countsByType[pt.id] || 0;
                          return (
                            <td key={pt.id} style={{ textAlign: 'center', fontSize: '12px' }}>
                              {count > 0 ? (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '1px 7px',
                                  borderRadius: 'var(--border-radius-full)',
                                  background: `${pt.color}20`,
                                  color: pt.color,
                                  fontWeight: 'bold'
                                }}>
                                  {count}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-tertiary)' }}>0</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 2, color: 'var(--color-danger)' }}
                            onClick={(e) => { e.stopPropagation(); handleDeleteRegion(r.id); }}
                            title={r.isFullImage ? t('analysis.imageProcessor.clearWholeImage', '画像全体のデータをクリア') : t('analysis.imageProcessor.tableDelete', '削除')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
