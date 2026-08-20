import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import UTIF from 'utif';
import {
  Circle, MousePointer, Crosshair, Trash2, Download, Plus, X, Save,
  FolderOpen, RefreshCw, Image as ImageIcon, Settings, Eye, EyeOff,
  ChevronDown, FileText, Upload, Palette, Layers, Bookmark, ZoomIn, ZoomOut, Maximize2, Undo2, Sparkles, CheckSquare, Square
} from 'lucide-react';

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

const DEFAULT_PRESET_SETS: AnnotationPresetSet[] = [
  {
    id: 'ps_colony',
    name: 'コロニーカウント・判定',
    labels: [
      { id: 'l1', name: '陽性', color: '#22C55E' },
      { id: 'l2', name: '陰性', color: '#EF4444' },
      { id: 'l3', name: '不明', color: '#9CA3AF' },
    ],
    pointTypes: [
      { id: 'pt1', name: 'タイプ A (赤)', color: '#EF4444', shortcut: '1' },
      { id: 'pt2', name: 'タイプ B (緑)', color: '#22C55E', shortcut: '2' },
      { id: 'pt3', name: 'タイプ C (青)', color: '#3B82F6', shortcut: '3' },
      { id: 'pt4', name: 'タイプ D (黄)', color: '#F59E0B', shortcut: '4' },
    ]
  },
  {
    id: 'ps_fluorescence',
    name: '蛍光免疫染色 (DAPI/GFP/RFP)',
    labels: [
      { id: 'l1', name: '発現あり', color: '#22C55E' },
      { id: 'l2', name: '発現なし', color: '#EF4444' },
      { id: 'l3', name: 'コントロール', color: '#9CA3AF' },
    ],
    pointTypes: [
      { id: 'pt1', name: 'DAPI 核 (青)', color: '#3B82F6', shortcut: '1' },
      { id: 'pt2', name: 'GFP シグナル (緑)', color: '#22C55E', shortcut: '2' },
      { id: 'pt3', name: 'RFP シグナル (赤)', color: '#EF4444', shortcut: '3' },
      { id: 'pt4', name: '共局在/マージ (黄)', color: '#F59E0B', shortcut: '4' },
    ]
  },
  {
    id: 'ps_cell_cycle',
    name: '細胞形態・細胞周期分類',
    labels: [
      { id: 'l1', name: '健常細胞', color: '#22C55E' },
      { id: 'l2', name: 'アポトーシス', color: '#EF4444' },
      { id: 'l3', name: '異常形態', color: '#F59E0B' },
    ],
    pointTypes: [
      { id: 'pt1', name: '間期 (赤)', color: '#EF4444', shortcut: '1' },
      { id: 'pt2', name: '分裂期 前・中期 (緑)', color: '#22C55E', shortcut: '2' },
      { id: 'pt3', name: '分裂期 後・終期 (青)', color: '#3B82F6', shortcut: '3' },
      { id: 'pt4', name: '死細胞 (黄)', color: '#F59E0B', shortcut: '4' },
    ]
  }
];

const LABELS_STORAGE_KEY = 'labflow_image_labels_preset';
const POINT_TYPES_STORAGE_KEY = 'labflow_image_point_types_preset';
const PRESET_SETS_STORAGE_KEY = 'labflow_image_preset_sets';
const STORAGE_KEY = 'labflow_image_sessions';

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
    if (!ifds || ifds.length === 0) throw new Error('無効なTIFFファイルです');
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
        else reject(new Error('TIFF変換に失敗しました'));
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

  // ─── Session State ───
  const [sessionName, setSessionName] = useState(() => {
    const now = new Date();
    return `計測 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
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
    if (!confirm('このプリセットセットを削除しますか？')) return;
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
    if (images.length > 0 && !confirm('読み込んだ画像リストをクリアしますか？')) return;
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
    setActiveImageIdx(-1);
    setRefImageIndices([]);
    await clearImagesFromDB();
  };

  const handleAddRefImage = () => {
    if (refImageIndices.length >= 3) {
      alert('参照画像は最大3枚まで配置できます。');
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

    // Draw regions
    currentRegions.forEach(region => {
      const label = labels.find(l => l.id === region.labelId);
      const color = label?.color || '#6366F1';
      const isSelected = selectedRegionId === region.id;

      // Circle
      ctx.beginPath();
      ctx.ellipse(region.cx, region.cy, region.rx, region.ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = `${color}15`;
      ctx.fill();

      // Header Text
      const fontSize = Math.max(13, Math.min(18, region.rx * 0.35));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const idText = `#${region.id}`;
      const labelText = label ? ` ${label.name}` : '';
      const totalCountText = ` (計${region.points.length}点)`;
      const fullText = idText + labelText + totalCountText;
      const textWidth = ctx.measureText(fullText).width;

      const tx = region.cx - region.rx;
      const ty = region.cy - region.ry - 6;

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(tx - 2, ty - fontSize, textWidth + 8, fontSize + 4);
      ctx.fillStyle = color;
      ctx.fillText(fullText, tx + 2, ty - 2);

      // Points
      region.points.forEach(pt => {
        const ptType = pointTypes.find(t => t.id === pt.typeId) || pointTypes[0];
        const ptColor = ptType?.color || '#EF4444';

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = ptColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Resize handles if selected
      if (isSelected) {
        const diagFactor = 0.7071;
        const handleRadius = Math.max(5, Math.min(8, region.rx * 0.15));
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
          ctx.lineWidth = 2.5;
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
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [activeImage, currentRegions, labels, pointTypes, selectedRegionId, isDrawing, drawStart, drawCurrent]);

  // Load image when active changes
  useEffect(() => {
    if (!activeImage) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
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
    const region = currentRegions.find(r => r.id === selectedRegionId);
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
    // If a region is currently selected, check if click is inside it first
    if (selectedRegionId) {
      const sel = currentRegions.find(r => r.id === selectedRegionId);
      if (sel) {
        const dx = (x - sel.cx) / sel.rx;
        const dy = (y - sel.cy) / sel.ry;
        if (dx * dx + dy * dy <= tolerance * tolerance) return sel;
      }
    }
    // Otherwise check from topmost region downwards
    for (let i = currentRegions.length - 1; i >= 0; i--) {
      const r = currentRegions[i];
      const dx = (x - r.cx) / r.rx;
      const dy = (y - r.cy) / r.ry;
      if (dx * dx + dy * dy <= tolerance * tolerance) return r;
    }
    return null;
  };

  const findPointAt = (x: number, y: number): { regionId: number; pointIdx: number } | null => {
    for (const r of currentRegions) {
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i];
        const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
        if (dist < 12) return { regionId: r.id, pointIdx: i };
      }
    }
    return null;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    // POINT MODE: Only inside regions, never blocked by handles
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
      const region = currentRegions.find(r => r.id === handleHit.regionId);
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
        const newId = regions.length + 1;
        const newRegion: Region = {
          id: newId,
          cx, cy, rx, ry,
          labelId: '',
          points: [],
          imageKey: activeImage.name
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
      // Strictly re-index remaining regions 1..N
      return remaining.map((r, idx) => ({
        ...r,
        id: idx + 1
      }));
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
      alert('最低1つの点タイプが必要です。');
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
    alert(`「${sessionName}」を一時保存しました。`);
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
    if (regions.length > 0 && !confirm('現在のセッションを破棄して新規セッションを開始しますか？')) return;
    const now = new Date();
    setSessionName(`計測 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setRegions([]);
    setSelectedRegionId(null);
  };

  // ─── Export CSV ───
  const exportCSV = () => {
    const headerCols = ['ID', '画像ファイル', 'ラベル', '合計点数', ...pointTypes.map(pt => `点数_${pt.name}`)];
    const rows = [headerCols.join(',')];

    regions.forEach(r => {
      const label = labels.find(l => l.id === r.labelId);
      const countsByType: Record<string, number> = {};
      r.points.forEach(p => {
        countsByType[p.typeId] = (countsByType[p.typeId] || 0) + 1;
      });

      const ptCols = pointTypes.map(pt => String(countsByType[pt.id] || 0));

      rows.push([
        `#${r.id}`,
        `"${r.imageKey}"`,
        `"${label?.name || '未設定'}"`,
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
      alert('記録がありません。');
      return;
    }
    exportCSV();
    if (confirm('セッションを終了して新規セッションを開始しますか？')) {
      handleNewSession();
    }
  };

  // ─── Max Intensity Projection (MIP) ───
  const [showMipModal, setShowMipModal] = useState(false);
  const [selectedMipIndices, setSelectedMipIndices] = useState<number[]>([]);
  const [mipProcessing, setMipProcessing] = useState(false);

  const openMipModal = () => {
    if (images.length < 2) {
      alert('Max Intensity画像の作製には2枚以上の画像が必要です。');
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
      alert('合成する画像を2枚以上選択してください。');
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
      alert(`「${mipName}」を作製し、解析画像リストに追加しました！`);
    } catch (err) {
      console.error('Failed to generate Max Intensity image:', err);
      alert('Max Intensity画像の作製中にエラーが発生しました。');
    } finally {
      setMipProcessing(false);
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
            <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>セッション名:</span>
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
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>設定プリセット:</span>
            <select
              className="form-select"
              style={{ fontSize: 'var(--font-size-xs)', padding: '3px 8px', maxWidth: 200 }}
              value={selectedPresetSetId}
              onChange={(e) => handleSelectPresetSet(e.target.value)}
            >
              {presetSets.map(ps => (
                <option key={ps.id} value={ps.id}>
                  {ps.name} {ps.isCustom ? '★' : ''}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '3px 6px', fontSize: '11px' }}
              onClick={() => setShowSavePresetModal(true)}
              title="現在のラベル＆点タイプを新規プリセットとして保存"
            >
              <Save size={12} /> <span>セット保存</span>
            </button>
            {presetSets.find(ps => ps.id === selectedPresetSetId)?.isCustom && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: 3, color: 'var(--color-danger)' }}
                onClick={(e) => handleDeletePresetSet(selectedPresetSetId, e)}
                title="このカスタムプリセットを削除"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Session Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={saveSession} title="一時保存">
              <Save size={14} /> <span>一時保存</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSavedSessions(!showSavedSessions)} title="復元">
              <FolderOpen size={14} /> <span>復元</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleEndSession} title="計測終了 & CSV出力">
              <Download size={14} /> <span>計測終了&出力</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleNewSession} title="新規セッション">
              <RefreshCw size={14} /> <span>新規</span>
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
                <h2 className="modal-title">設定プリセットセットの保存</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowSavePresetModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                現在設定されている **対象ラベル（{labels.length}種）** と **点タイプ（{pointTypes.length}色）** をセットとして名前をつけて保存します。
              </p>
              <div className="form-group">
                <label className="form-label">プリセット名</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例: 形質転換コロニー分析、蛍光染色GFP/RFP..."
                  value={newPresetSetName}
                  onChange={(e) => setNewPresetSetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentAsPresetSet(); }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSavePresetModal(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSaveCurrentAsPresetSet} disabled={!newPresetSetName.trim()}>
                保存する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Sessions Dropdown */}
      {showSavedSessions && (
        <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
          <div className="card-header">
            <h3 className="card-title">保存済みセッション</h3>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSavedSessions(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="card-body">
            {getSavedSessions().length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>一時保存されたセッションはありません。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {getSavedSessions().map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm)', background: 'var(--bg-base)', borderRadius: 'var(--border-radius-md)' }}>
                    <div>
                      <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{s.sessionName}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {new Date(s.savedAt).toLocaleString('ja-JP')} — ROI: {s.regions.length}個
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => loadSession(s)}>復元</button>
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

      {/* Max Intensity Projection (MIP) Modal */}
      {showMipModal && (
        <div className="modal-overlay" onClick={() => !mipProcessing && setShowMipModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />
                <h2 className="modal-title">Max Intensity（最大輝度投影）画像の作製</h2>
              </div>
              {!mipProcessing && (
                <button className="btn btn-ghost btn-icon" onClick={() => setShowMipModal(false)}>
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                選択した複数画像の各ピクセルにおける最大輝度値（Max Intensity）を抽出し、焦点深度の深い1枚のクリアな画像として合成します。
                作製された画像はリストに追加され、そのまま円囲みや点カウント解析、画像保存が可能です。
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-xs) 0' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>
                  合成対象の画像を選択 ({selectedMipIndices.length} / {images.length} 枚選択中):
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={handleSelectAllMip}>
                    すべて選択
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={handleDeselectAllMip}>
                    全解除
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
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={generateMaxIntensityImage}
                disabled={mipProcessing || selectedMipIndices.length < 2}
              >
                <Sparkles size={14} />
                <span>{mipProcessing ? '合成処理中...' : `Max Intensity画像を作製 (${selectedMipIndices.length}枚)`}</span>
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
            <span>フォルダ選択</span>
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
              <span>追加</span>
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
                title="画像リストをクリア"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* Max Intensity Projection Action Button */}
          {images.length >= 2 && (
            <button
              className="btn btn-primary btn-sm"
              onClick={openMipModal}
              title="複数画像からMax Intensity（最大輝度投影）画像を合成作製"
              style={{
                fontSize: '11px',
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                border: 'none',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
              }}
            >
              <Sparkles size={13} />
              <span>Max Intensity</span>
            </button>
          )}

          {loadingImages && (
            <div style={{ fontSize: 'var(--font-size-xs)', textAlign: 'center', color: 'var(--color-primary)', padding: 4 }}>
              画像変換中...
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
                  title="選択 / 移動 (キー: S)"
                >
                  <MousePointer size={15} /> <span>選択</span>
                </button>
                <button
                  className={`btn btn-sm ${toolMode === 'circle' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setToolMode('circle')}
                  title="円で囲む (キー: C)"
                >
                  <Circle size={15} /> <span>囲み</span>
                </button>
                <button
                  className={`btn btn-sm ${toolMode === 'point' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setToolMode('point')}
                  title="点プロット (キー: P)"
                >
                  <Crosshair size={15} /> <span>点プロット</span>
                </button>
              </div>

              {/* Undo Button */}
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleUndo}
                disabled={history.length === 0}
                title="1つ前の状態に戻す (Ctrl+Z)"
                style={{ opacity: history.length === 0 ? 0.5 : 1 }}
              >
                <Undo2 size={15} /> <span>1つ戻す</span>
              </button>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Point Type Quick Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', fontWeight: 'bold' }}>点の色:</span>
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
                      title={`点タイプ: ${pt.name} (ショートカット: ${pt.shortcut})`}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: pt.color }} />
                      <span>{pt.name}</span>
                      {pt.shortcut && <span style={{ opacity: 0.6, fontSize: '10px' }}>({pt.shortcut})</span>}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 4 }}
                  onClick={() => setShowPointSettings(!showPointSettings)}
                  title="点タイプの設定・追加"
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
                  onClick={() => setZoomLevel(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                  title="縮小"
                  disabled={!activeImage}
                >
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: '11px', fontWeight: 'bold', minWidth: 38, textAlign: 'center' }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 5px' }}
                  onClick={() => setZoomLevel(prev => Math.min(3.0, Number((prev + 0.25).toFixed(2))))}
                  title="拡大"
                  disabled={!activeImage}
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 5px', fontSize: '10px' }}
                  onClick={() => setZoomLevel(1)}
                  title="100% (全体表示)"
                  disabled={!activeImage}
                >
                  <Maximize2 size={11} /> <span>100%</span>
                </button>
              </div>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Brightness */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>輝度:</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={activeImage?.brightness || 0}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ width: 26, textAlign: 'right', color: 'var(--text-secondary)' }}>{activeImage?.brightness || 0}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: 2 }} onClick={() => handleBrightnessChange(0)} title="リセット">
                  <RefreshCw size={12} />
                </button>
              </div>

              <div style={{ width: 1, height: 24, background: 'var(--border-default)' }} />

              {/* Selected ROI Label Selector & Delete */}
              {selectedRegionId && (
                <>
                  <select
                    className="form-select"
                    style={{ maxWidth: 130, fontSize: 'var(--font-size-xs)', padding: '4px 6px' }}
                    value={regions.find(r => r.id === selectedRegionId)?.labelId || ''}
                    onChange={(e) => handleSetLabel(selectedRegionId, e.target.value)}
                  >
                    <option value="">ラベル未設定</option>
                    {labels.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRegion(selectedRegionId)} title="ROI削除">
                    <Trash2 size={14} />
                  </button>
                </>
              )}

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
                title="参照画像を表示（最大3枚まで並べて比較可能）"
              >
                {showRefPanel ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>参照画像 {refImageIndices.length > 0 ? `(${refImageIndices.length})` : ''}</span>
              </button>

              {/* Download raw image / MIP as TIFF */}
              <button className="btn btn-ghost btn-sm" onClick={downloadActiveRawImage} disabled={!activeImage} title="現在表示中の元画像/MIP画像をTIFF（.tif）形式で保存">
                <Download size={14} /> <span>TIFF保存</span>
              </button>

              {/* Export annotated image as TIFF */}
              <button className="btn btn-ghost btn-sm" onClick={exportImage} disabled={!activeImage} title="アノテーション（囲み・打点）付き解析画像をTIFF（.tif）形式で出力">
                <Download size={14} /> <span>解析図出力(TIFF)</span>
              </button>
            </div>
          </div>

          {/* Point Types Settings Panel (collapsible) */}
          {showPointSettings && (
            <div className="card" style={{ marginBottom: 'var(--space-xs)', background: 'var(--bg-base)', border: '1px solid var(--border-default)' }}>
              <div className="card-body" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>📍 点タイプ（色・分類）の設定</span>
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
                    placeholder="新しい点タイプ名 (例: 分裂細胞, 陽性スポット)"
                    value={newPointTypeName}
                    onChange={(e) => setNewPointTypeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addPointType(); }}
                    style={{ maxWidth: 220, fontSize: 'var(--font-size-xs)' }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={addPointType}>
                    <Plus size={13} /> 点タイプ追加
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
                      <span style={{ color: pt.color, fontWeight: 'bold' }}>{pt.name}</span>
                      <span style={{ opacity: 0.6, fontSize: '10px' }}>[キー: {idx + 1}]</span>
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
                  <p>フォルダを選択するか、画像（TIFF, PNG, JPG等）をドラッグ＆ドロップしてください</p>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  style={{
                    display: 'block',
                    maxWidth: zoomLevel === 1 ? '100%' : 'none',
                    maxHeight: zoomLevel === 1 ? 'calc(100vh - 220px)' : 'none',
                    width: zoomLevel === 1 ? 'auto' : `${imgRef.current ? Math.round(imgRef.current.naturalWidth * zoomLevel) : 100}px`,
                    height: zoomLevel === 1 ? 'auto' : `${imgRef.current ? Math.round(imgRef.current.naturalHeight * zoomLevel) : 100}px`,
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
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>参照画像 (最大3枚)</span>
                  </div>
                  {refImageIndices.length < 3 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 6px', fontSize: '10px', color: 'var(--color-primary)' }}
                      onClick={handleAddRefImage}
                      title="参照画像を追加 (最大3枚)"
                    >
                      <Plus size={12} /> <span>追加 ({refImageIndices.length}/3)</span>
                    </button>
                  )}
                </div>

                {refImageIndices.length === 0 ? (
                  <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                    <p>参照画像が選択されていません</p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 6, fontSize: '11px', padding: '3px 8px' }} onClick={handleAddRefImage}>
                      <Plus size={12} /> 参照画像を追加
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
                              <option value={-1}>-- 選択 --</option>
                              {images.map((img, i) => (
                                <option key={i} value={i}>{img.name}</option>
                              ))}
                            </select>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: 2, color: 'var(--color-danger)' }}
                              onClick={() => handleRemoveRefImage(slotIdx)}
                              title="この参照画像を削除"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {/* Brightness control */}
                          {curImg && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>輝度:</span>
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
                              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center' }}>画像を選択</span>
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
            <span>対象ラベル設定</span>
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
                {l.name}
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
                placeholder="新しい対象ラベル名 (例: 陽性, 陰性, 対照群)"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addLabel(); }}
                style={{ maxWidth: 220, fontSize: 'var(--font-size-sm)' }}
              />
              <button className="btn btn-primary btn-sm" onClick={addLabel}>
                <Plus size={14} /> 追加
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
                  <span style={{ color: l.color, fontWeight: 'bold' }}>{l.name}</span>
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
            結果テーブル: {sessionName} ({regions.length}件)
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={regions.length === 0}>
              <Download size={14} /> CSV出力
            </button>
            <button className="btn btn-secondary btn-sm" onClick={exportImage} disabled={!activeImage}>
              <ImageIcon size={14} /> 画像出力
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {regions.length === 0 ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: 'var(--font-size-sm)' }}>
                まだ計測データがありません。「🔵 囲み」ツールで対象を円で囲んでください。
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>ID</th>
                    <th>画像ファイル</th>
                    <th style={{ width: 110 }}>対象ラベル</th>
                    <th style={{ width: 80, textAlign: 'center' }}>合計点数</th>
                    {/* Dynamic point type columns */}
                    {pointTypes.map(pt => (
                      <th key={pt.id} style={{ textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: pt.color }} />
                          {pt.name}
                        </span>
                      </th>
                    ))}
                    <th style={{ width: 60, textAlign: 'center' }}>操作</th>
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
                        <td style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>#{r.id}</td>
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
                              {label.name}
                            </span>
                          ) : (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>未設定</span>
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
                            title="削除"
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
