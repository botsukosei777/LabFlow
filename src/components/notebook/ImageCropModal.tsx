import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
  Check, X, Crop as CropIcon, RefreshCw, Type, Trash2,
  Circle, ArrowRight, Hash, XCircle
} from 'lucide-react';

export interface ImageCropModalProps {
  isOpen: boolean;
  file?: File | null;
  imageUrl?: string;
  initialAltText?: string;
  onClose: () => void;
  onConfirm: (blob: Blob, altText: string) => Promise<void> | void;
}

interface CropRect {
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  width: number; // percentage 0..100
  height: number; // percentage 0..100
}

export type AnnotationType = 'text' | 'circle' | 'cross' | 'arrow' | 'number';
export type ArrowDirection = 'right' | 'left' | 'up' | 'down';

export interface TextAnnotation {
  id: string;
  type: AnnotationType;
  text: string;
  x: number; // percentage 0..100 of rotated canvas
  y: number; // percentage 0..100 of rotated canvas
  color: string;
  fontSize: number; // size in px (e.g. 10, 14, 20, 28, 38)
  fontFamily: 'sans' | 'serif' | 'mono';
  arrowDirection?: ArrowDirection;
}

type HandleType = 'box' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

const PRESET_COLORS = [
  { label: 'Red', value: '#EF4444', bg: 'bg-red-500' },
  { label: 'Yellow', value: '#FACC15', bg: 'bg-yellow-400' },
  { label: 'Cyan', value: '#06B6D4', bg: 'bg-cyan-400' },
  { label: 'Green', value: '#22C55E', bg: 'bg-green-500' },
  { label: 'White', value: '#FFFFFF', bg: 'bg-white' },
  { label: 'Black', value: '#000000', bg: 'bg-black border border-white/40' },
];

const PRESET_SIZES = [
  { key: 'sizeXSmall', value: 10, label: 'XS' },
  { key: 'sizeSmall', value: 14, label: 'S' },
  { key: 'sizeMedium', value: 20, label: 'M' },
  { key: 'sizeLarge', value: 28, label: 'L' },
  { key: 'sizeXLarge', value: 38, label: 'XL' },
];

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  file,
  imageUrl,
  initialAltText,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();

  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 100, height: 100 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '4:3' | '16:9'>('free');
  const [altText, setAltText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Annotations & stamps state
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [nextNumberCounter, setNextNumberCounter] = useState<number>(1);
  // Active stamp tool mode ('none' | 'number' | 'circle' | 'cross' | 'arrow' | 'text')
  const [activeStampTool, setActiveStampTool] = useState<'none' | 'number' | 'circle' | 'cross' | 'arrow' | 'text'>('none');
  // Default styling for new stamps
  const [currentStampColor, setCurrentStampColor] = useState<string>('#FACC15');
  const [currentStampSize, setCurrentStampSize] = useState<number>(20);
  const [currentArrowDirection, setCurrentArrowDirection] = useState<ArrowDirection>('right');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragInfoRef = useRef<{
    type: 'crop' | 'annotation';
    handle?: HandleType;
    annotationId?: string;
    startX: number;
    startY: number;
    startCrop?: CropRect;
    startAnnotationPos?: { x: number; y: number };
    containerW: number;
    containerH: number;
    hasMoved?: boolean;
  } | null>(null);

  // Load image when file or imageUrl changes
  useEffect(() => {
    if (!isOpen || (!file && !imageUrl)) {
      setImageElement(null);
      return;
    }

    const defaultAlt = file?.name
      ? file.name.replace(/\.[^/.]+$/, '')
      : (initialAltText || 'image');
    setAltText(defaultAlt);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
    setAspectRatio('free');
    setAnnotations([]);
    setSelectedAnnotationId(null);
    setNextNumberCounter(1);
    setActiveStampTool('none');

    let objectUrl = '';
    let isCancelled = false;

    if (file) {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (!isCancelled) setImageElement(img);
      };
      img.src = objectUrl;
    } else if (imageUrl) {
      // Fetch as Blob to prevent canvas taint when exporting cropped image
      fetch(imageUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then(blob => {
          if (isCancelled) return;
          objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (!isCancelled) setImageElement(img);
          };
          img.src = objectUrl;
        })
        .catch(err => {
          console.warn('Failed to fetch imageUrl as blob, falling back to direct src:', err);
          if (isCancelled) return;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (!isCancelled) setImageElement(img);
          };
          img.src = imageUrl;
        });
    }

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isOpen, file, imageUrl, initialAltText]);

  // Draw rotated/flipped preview onto canvas
  useEffect(() => {
    if (!imageElement || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isRotated90 = rotation === 90 || rotation === 270;
    const naturalW = isRotated90 ? imageElement.naturalHeight : imageElement.naturalWidth;
    const naturalH = isRotated90 ? imageElement.naturalWidth : imageElement.naturalHeight;

    // Scale to fit viewport container (max ~560px wide, ~350px tall)
    const maxPreviewW = Math.min(560, window.innerWidth - 80);
    const maxPreviewH = 350;
    const scale = Math.min(maxPreviewW / naturalW, maxPreviewH / naturalH, 1);

    const targetW = Math.max(100, Math.round(naturalW * scale));
    const targetH = Math.max(100, Math.round(naturalH * scale));

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.save();
    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    const drawW = isRotated90 ? targetH : targetW;
    const drawH = isRotated90 ? targetW : targetH;
    ctx.drawImage(imageElement, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [imageElement, rotation, flipH, flipV]);

  // Rotate handlers
  const handleRotateLeft = () => {
    setRotation(prev => ((prev - 90 + 360) % 360));
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
  };

  const handleRotateRight = () => {
    setRotation(prev => ((prev + 90) % 360));
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
  };

  const handleFlipHorizontal = () => {
    setFlipH(prev => !prev);
  };

  const handleFlipVertical = () => {
    setFlipV(prev => !prev);
  };

  const handleResetCrop = () => {
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
  };

  // Toggle or select an active stamp tool
  const handleSelectTool = (tool: 'none' | 'number' | 'circle' | 'cross' | 'arrow' | 'text') => {
    if (activeStampTool === tool) {
      setActiveStampTool('none');
    } else {
      setActiveStampTool(tool);
      setSelectedAnnotationId(null);
    }
  };

  // Click on the image/canvas to place a stamp or text at the clicked coordinate
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If we just finished a drag movement, don't place a stamp
    if (dragInfoRef.current?.hasMoved) return;

    if (activeStampTool === 'none') {
      setSelectedAnnotationId(null);
      return;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check if within canvas boundaries
    if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) return;

    const xPct = Math.round(((clickX / rect.width) * 100) * 10) / 10;
    const yPct = Math.round(((clickY / rect.height) * 100) * 10) / 10;

    const newId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (activeStampTool === 'number') {
      const currentNum = nextNumberCounter;
      const newAnnotation: TextAnnotation = {
        id: newId,
        type: 'number',
        text: String(currentNum),
        x: xPct,
        y: yPct,
        color: currentStampColor,
        fontSize: currentStampSize,
        fontFamily: 'sans',
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedAnnotationId(newId);
      setNextNumberCounter(prev => prev + 1);
    } else if (activeStampTool === 'circle') {
      const newAnnotation: TextAnnotation = {
        id: newId,
        type: 'circle',
        text: '',
        x: xPct,
        y: yPct,
        color: currentStampColor,
        fontSize: Math.max(currentStampSize, 24),
        fontFamily: 'sans',
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedAnnotationId(newId);
    } else if (activeStampTool === 'cross') {
      const newAnnotation: TextAnnotation = {
        id: newId,
        type: 'cross',
        text: '',
        x: xPct,
        y: yPct,
        color: currentStampColor,
        fontSize: Math.max(currentStampSize, 20),
        fontFamily: 'sans',
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedAnnotationId(newId);
    } else if (activeStampTool === 'arrow') {
      const newAnnotation: TextAnnotation = {
        id: newId,
        type: 'arrow',
        text: '',
        x: xPct,
        y: yPct,
        color: currentStampColor,
        fontSize: Math.max(currentStampSize, 24),
        fontFamily: 'sans',
        arrowDirection: currentArrowDirection,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedAnnotationId(newId);
    } else if (activeStampTool === 'text') {
      const newAnnotation: TextAnnotation = {
        id: newId,
        type: 'text',
        text: 'Text',
        x: xPct,
        y: yPct,
        color: currentStampColor,
        fontSize: currentStampSize,
        fontFamily: 'sans',
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedAnnotationId(newId);
    }
  };

  // Delete annotation
  const handleDeleteAnnotation = (idToDelete: string) => {
    setAnnotations(prev => prev.filter(item => item.id !== idToDelete));
    if (selectedAnnotationId === idToDelete) {
      setSelectedAnnotationId(null);
    }
  };

  // Update selected annotation property
  const updateSelectedAnnotation = (updates: Partial<TextAnnotation>) => {
    if (!selectedAnnotationId) return;
    setAnnotations(prev =>
      prev.map(item => (item.id === selectedAnnotationId ? { ...item, ...updates } : item))
    );
    // Also remember last selected color/size/direction for subsequent stamps
    if (updates.color) setCurrentStampColor(updates.color);
    if (updates.fontSize) setCurrentStampSize(updates.fontSize);
    if (updates.arrowDirection) setCurrentArrowDirection(updates.arrowDirection);
  };

  const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId) || null;

  // Preset aspect ratio handler
  const handleApplyAspectRatio = (ratio: 'free' | '1:1' | '4:3' | '16:9') => {
    setAspectRatio(ratio);
    if (!canvasRef.current || ratio === 'free') return;

    const canvasW = canvasRef.current.width;
    const canvasH = canvasRef.current.height;
    let targetRatio = 1;
    if (ratio === '4:3') targetRatio = 4 / 3;
    if (ratio === '16:9') targetRatio = 16 / 9;

    const canvasRatio = canvasW / canvasH;
    let newW = 100;
    let newH = 100;

    if (canvasRatio > targetRatio) {
      newH = 90;
      const pixelH = (newH / 100) * canvasH;
      const pixelW = pixelH * targetRatio;
      newW = Math.min(100, (pixelW / canvasW) * 100);
    } else {
      newW = 90;
      const pixelW = (newW / 100) * canvasW;
      const pixelH = pixelW / targetRatio;
      newH = Math.min(100, (pixelH / canvasH) * 100);
    }

    setCrop({
      x: (100 - newW) / 2,
      y: (100 - newH) / 2,
      width: newW,
      height: newH,
    });
  };

  // Drag interaction for crop box & handles
  const handleCropMouseDown = (e: React.MouseEvent, handle: HandleType) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    dragInfoRef.current = {
      type: 'crop',
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      containerW: rect.width,
      containerH: rect.height,
      hasMoved: false,
    };
  };

  // Drag interaction for annotation elements
  const handleAnnotationMouseDown = (e: React.MouseEvent, annotationId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setSelectedAnnotationId(annotationId);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const item = annotations.find(a => a.id === annotationId);
    if (!item) return;

    dragInfoRef.current = {
      type: 'annotation',
      annotationId,
      startX: e.clientX,
      startY: e.clientY,
      startAnnotationPos: { x: item.x, y: item.y },
      containerW: rect.width,
      containerH: rect.height,
      hasMoved: false,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragInfoRef.current) return;

      const { type, handle, annotationId, startX, startY, startCrop, startAnnotationPos, containerW, containerH } =
        dragInfoRef.current;
      const dxPct = ((e.clientX - startX) / containerW) * 100;
      const dyPct = ((e.clientY - startY) / containerH) * 100;

      if (Math.abs(dxPct) > 0.5 || Math.abs(dyPct) > 0.5) {
        dragInfoRef.current.hasMoved = true;
      }

      if (type === 'crop' && startCrop && handle) {
        const MIN_SIZE = 5; // minimum 5%

        let nextX = startCrop.x;
        let nextY = startCrop.y;
        let nextW = startCrop.width;
        let nextH = startCrop.height;

        if (handle === 'box') {
          nextX = Math.max(0, Math.min(100 - startCrop.width, startCrop.x + dxPct));
          nextY = Math.max(0, Math.min(100 - startCrop.height, startCrop.y + dyPct));
        } else {
          // Horizontal adjustment
          if (handle.includes('e')) {
            nextW = Math.max(MIN_SIZE, Math.min(100 - startCrop.x, startCrop.width + dxPct));
          } else if (handle.includes('w')) {
            const desiredX = startCrop.x + dxPct;
            const maxLeft = startCrop.x + startCrop.width - MIN_SIZE;
            nextX = Math.max(0, Math.min(maxLeft, desiredX));
            nextW = startCrop.width + (startCrop.x - nextX);
          }

          // Vertical adjustment
          if (handle.includes('s')) {
            nextH = Math.max(MIN_SIZE, Math.min(100 - startCrop.y, startCrop.height + dyPct));
          } else if (handle.includes('n')) {
            const desiredY = startCrop.y + dyPct;
            const maxTop = startCrop.y + startCrop.height - MIN_SIZE;
            nextY = Math.max(0, Math.min(maxTop, desiredY));
            nextH = startCrop.height + (startCrop.y - nextY);
          }
        }

        setCrop({
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
          width: Math.round(nextW * 10) / 10,
          height: Math.round(nextH * 10) / 10,
        });
      } else if (type === 'annotation' && annotationId && startAnnotationPos) {
        const nextX = Math.max(0, Math.min(100, startAnnotationPos.x + dxPct));
        const nextY = Math.max(0, Math.min(100, startAnnotationPos.y + dyPct));

        setAnnotations(prev =>
          prev.map(item =>
            item.id === annotationId
              ? { ...item, x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 }
              : item
          )
        );
      }
    };

    const handleMouseUp = () => {
      // Delay clearing dragInfo slightly so container click won't trigger immediately after dragging
      setTimeout(() => {
        dragInfoRef.current = null;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [crop]);

  // Helper to determine font family css/canvas string
  const getFontFamilyString = (family: 'sans' | 'serif' | 'mono') => {
    if (family === 'serif') return 'serif';
    if (family === 'mono') return 'monospace, "Courier New"';
    return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif';
  };

  // Helper to test if a color is dark
  const isColorDark = (hex: string) => {
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  // Helper to draw stamp or text onto canvas
  const drawAnnotationToCanvas = (
    ctx: CanvasRenderingContext2D,
    item: TextAnnotation,
    posX: number,
    posY: number,
    scaleFactor: number
  ) => {
    const effectiveSize = Math.round(item.fontSize * scaleFactor);
    const outlineColor = isColorDark(item.color) ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)';

    ctx.save();
    ctx.translate(posX, posY);

    if (item.type === 'text' || item.type === 'number') {
      const displayText = item.text || (item.type === 'number' ? '1' : 'Text');
      const fontStr = `bold ${effectiveSize}px ${getFontFamilyString(item.fontFamily)}`;
      ctx.font = fontStr;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outline
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = Math.max(2, Math.round(effectiveSize * 0.18));
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(displayText, 0, 0);

      // Fill
      ctx.fillStyle = item.color;
      ctx.fillText(displayText, 0, 0);
    } else if (item.type === 'circle') {
      // Draw hollow Circle 〇
      const radius = Math.round(effectiveSize / 2);
      const strokeWidth = Math.max(2, Math.round(effectiveSize * 0.12));

      // Undercoat outline
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = strokeWidth + Math.max(2, Math.round(strokeWidth * 0.5));
      ctx.stroke();

      // Main circle
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    } else if (item.type === 'cross') {
      // Draw Cross ✕
      const halfSize = Math.round(effectiveSize / 2);
      const strokeWidth = Math.max(2, Math.round(effectiveSize * 0.14));

      // Outline
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = strokeWidth + Math.max(2, Math.round(strokeWidth * 0.6));
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(-halfSize, -halfSize);
      ctx.lineTo(halfSize, halfSize);
      ctx.moveTo(halfSize, -halfSize);
      ctx.lineTo(-halfSize, halfSize);
      ctx.stroke();

      // Main color
      ctx.strokeStyle = item.color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(-halfSize, -halfSize);
      ctx.lineTo(halfSize, halfSize);
      ctx.moveTo(halfSize, -halfSize);
      ctx.lineTo(-halfSize, halfSize);
      ctx.stroke();
    } else if (item.type === 'arrow') {
      // Draw Arrow
      const len = effectiveSize * 1.3;
      const headLen = Math.max(6, Math.round(len * 0.4));
      const strokeWidth = Math.max(2, Math.round(effectiveSize * 0.13));

      // Rotate canvas according to direction
      let angle = 0;
      if (item.arrowDirection === 'left') angle = Math.PI;
      else if (item.arrowDirection === 'up') angle = -Math.PI / 2;
      else if (item.arrowDirection === 'down') angle = Math.PI / 2;
      ctx.rotate(angle);

      const startX = -len / 2;
      const endX = len / 2;

      // Draw shaft and arrowhead path
      const drawArrowPath = () => {
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(endX, 0);
        ctx.moveTo(endX - headLen, -headLen * 0.6);
        ctx.lineTo(endX, 0);
        ctx.lineTo(endX - headLen, headLen * 0.6);
      };

      // Outline
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = strokeWidth + Math.max(2, Math.round(strokeWidth * 0.6));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawArrowPath();
      ctx.stroke();

      // Main arrow
      ctx.strokeStyle = item.color;
      ctx.lineWidth = strokeWidth;
      drawArrowPath();
      ctx.stroke();
    }

    ctx.restore();
  };

  // Generate cropped/rotated image blob with text/stamps and submit
  const handleConfirmCropped = async () => {
    if (!imageElement || (!file && !imageUrl)) return;

    setIsProcessing(true);
    try {
      const isRotated90 = rotation === 90 || rotation === 270;
      const rotW = isRotated90 ? imageElement.naturalHeight : imageElement.naturalWidth;
      const rotH = isRotated90 ? imageElement.naturalWidth : imageElement.naturalHeight;

      // 1. Render rotated full image
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rotCtx = rotCanvas.getContext('2d')!;

      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate((rotation * Math.PI) / 180);
      rotCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      rotCtx.drawImage(imageElement, -imageElement.naturalWidth / 2, -imageElement.naturalHeight / 2);

      // 2. Crop to selected area
      const cropPixelX = Math.round((crop.x / 100) * rotW);
      const cropPixelY = Math.round((crop.y / 100) * rotH);
      const cropPixelW = Math.max(1, Math.round((crop.width / 100) * rotW));
      const cropPixelH = Math.max(1, Math.round((crop.height / 100) * rotH));

      const outCanvas = document.createElement('canvas');
      outCanvas.width = cropPixelW;
      outCanvas.height = cropPixelH;
      const outCtx = outCanvas.getContext('2d')!;

      outCtx.drawImage(
        rotCanvas,
        cropPixelX, cropPixelY, cropPixelW, cropPixelH,
        0, 0, cropPixelW, cropPixelH
      );

      // 3. Draw text and stamps annotations onto output canvas if any exist
      if (annotations.length > 0 && canvasRef.current) {
        const previewCanvasW = canvasRef.current.width || 1;
        const fontScaleFactor = rotW / previewCanvasW;

        annotations.forEach(item => {
          // Coordinate on output canvas
          const posXInRotCanvas = (item.x / 100) * rotW;
          const posYInRotCanvas = (item.y / 100) * rotH;

          const outX = posXInRotCanvas - cropPixelX;
          const outY = posYInRotCanvas - cropPixelY;

          drawAnnotationToCanvas(outCtx, item, outX, outY, fontScaleFactor);
        });
      }

      const mimeType = file?.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      outCanvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('Canvas to blob conversion failed');
        }
        await onConfirm(blob, altText.trim() || 'image');
        onClose();
      }, mimeType, 0.95);
    } catch (err) {
      console.error('Failed to crop image:', err);
      alert('画像のトリミングに失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // Insert original file without crop/rotation
  const handleConfirmOriginal = async () => {
    if (file) {
      setIsProcessing(true);
      try {
        await onConfirm(file, altText.trim() || 'image');
        onClose();
      } catch (err) {
        console.error('Failed to insert original image:', err);
      } finally {
        setIsProcessing(false);
      }
    } else {
      onClose();
    }
  };

  if (!isOpen || (!file && !imageUrl)) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 animate-fade-in">
      <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-4xl w-full max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-gray-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <CropIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {t('notebook.cropModal.title', '画像の調整・トリミング・スタンプ')}
              </h3>
              <p className="text-[11px] text-gray-400">
                {activeStampTool === 'number'
                  ? t('notebook.cropModal.clickToStampNumber', '【連番スタンプ中】画像をクリックすると 1, 2, 3... と自動ナンバリングされます')
                  : activeStampTool !== 'none'
                  ? t('notebook.cropModal.clickToStamp', '【スタンプモード中】画像をクリックした位置にスタンプが配置されます')
                  : t('notebook.cropModal.dragToCrop', 'トリミング範囲の指定、向き調整、文字やスタンプ(〇・✕・矢印・連番)の配置ができます')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Toolbar: Rotation, Flip, Aspect Ratio, Stamp Tools */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 bg-slate-800/40 border-b border-white/10 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-gray-400 mr-0.5">{t('common.actions', '操作')}:</span>
            <button
              type="button"
              onClick={handleRotateLeft}
              title={t('notebook.cropModal.rotateLeft', '左に90°回転')}
              className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
              <span>-90°</span>
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              title={t('notebook.cropModal.rotateRight', '右に90°回転')}
              className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>+90°</span>
            </button>
            <button
              type="button"
              onClick={handleFlipHorizontal}
              title={t('notebook.cropModal.flipH', '左右反転')}
              className={`p-1.5 rounded-md border transition-colors ${
                flipH ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFlipVertical}
              title={t('notebook.cropModal.flipV', '上下反転')}
              className={`p-1.5 rounded-md border transition-colors ${
                flipV ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
              }`}
            >
              <FlipVertical className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-4 bg-white/15 mx-0.5" />

            {/* Stamp Tool Buttons: Click to enter stamping mode */}
            {/* 1. Incremental Number Stamp Tool */}
            <button
              type="button"
              onClick={() => handleSelectTool('number')}
              title={t('notebook.cropModal.clickToStampNumber', '選択中: 画像をクリックすると 1, 2, 3... と連番配置')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all font-medium ${
                activeStampTool === 'number'
                  ? 'bg-amber-500 text-slate-900 border-amber-400 ring-2 ring-amber-400/50 shadow-md scale-105'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>{t('notebook.cropModal.addNumber', '番号')}: {nextNumberCounter}</span>
            </button>

            {/* 2. Circle Stamp Tool */}
            <button
              type="button"
              onClick={() => handleSelectTool('circle')}
              title={t('notebook.cropModal.addCircle', '〇 (丸スタンプ) - 画像クリックで配置')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all ${
                activeStampTool === 'circle'
                  ? 'bg-red-500 text-white border-red-400 ring-2 ring-red-400/50 shadow-md scale-105'
                  : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
              }`}
            >
              <Circle className="w-3.5 h-3.5 text-red-400" />
              <span>{t('notebook.cropModal.addCircle', '〇')}</span>
            </button>

            {/* 3. Cross Stamp Tool */}
            <button
              type="button"
              onClick={() => handleSelectTool('cross')}
              title={t('notebook.cropModal.addCross', '✕ (バツスタンプ) - 画像クリックで配置')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all ${
                activeStampTool === 'cross'
                  ? 'bg-red-500 text-white border-red-400 ring-2 ring-red-400/50 shadow-md scale-105'
                  : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
              }`}
            >
              <X className="w-3.5 h-3.5 text-red-400" />
              <span>{t('notebook.cropModal.addCross', '✕')}</span>
            </button>

            {/* 4. Arrow Stamp Tool */}
            <button
              type="button"
              onClick={() => handleSelectTool('arrow')}
              title={t('notebook.cropModal.addArrow', '矢印スタンプ - 画像クリックで配置')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all ${
                activeStampTool === 'arrow'
                  ? 'bg-yellow-500 text-slate-900 border-yellow-400 ring-2 ring-yellow-400/50 shadow-md scale-105'
                  : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
              }`}
            >
              <ArrowRight className="w-3.5 h-3.5 text-yellow-400" />
              <span>{t('notebook.cropModal.addArrow', '矢印')}</span>
            </button>

            {/* 5. Text Tool */}
            <button
              type="button"
              onClick={() => handleSelectTool('text')}
              title={t('notebook.cropModal.addText', '文字 - 画像クリックで配置')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all ${
                activeStampTool === 'text'
                  ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/50 shadow-md scale-105'
                  : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
              }`}
            >
              <Type className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t('notebook.cropModal.addText', '文字')}</span>
            </button>

            {/* If a tool is active, show quick exit/reset button */}
            {activeStampTool !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveStampTool('none')}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] text-gray-300 border border-white/15 transition-colors"
                title={t('notebook.cropModal.exitStampMode', 'モード解除')}
              >
                {t('notebook.cropModal.exitStampMode', '完了')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <span className="text-gray-400 mr-1">{t('notebook.cropModal.aspectFree', '比率')}:</span>
            <button
              type="button"
              onClick={() => handleApplyAspectRatio('free')}
              className={`px-2 py-0.5 rounded-md border transition-colors ${
                aspectRatio === 'free' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
            >
              {t('notebook.cropModal.aspectFree', '自由')}
            </button>
            <button
              type="button"
              onClick={() => handleApplyAspectRatio('1:1')}
              className={`px-1.5 py-0.5 rounded-md border transition-colors ${
                aspectRatio === '1:1' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
            >
              1:1
            </button>
            <button
              type="button"
              onClick={() => handleApplyAspectRatio('4:3')}
              className={`px-1.5 py-0.5 rounded-md border transition-colors ${
                aspectRatio === '4:3' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
            >
              4:3
            </button>
            <button
              type="button"
              onClick={() => handleApplyAspectRatio('16:9')}
              className={`px-1.5 py-0.5 rounded-md border transition-colors ${
                aspectRatio === '16:9' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
            >
              16:9
            </button>
            <button
              type="button"
              onClick={handleResetCrop}
              title={t('notebook.cropModal.resetCrop', '全選択（リセット）')}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 ml-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3 text-emerald-400" />
              <span>{t('notebook.cropModal.resetCrop', '全選択')}</span>
            </button>
          </div>
        </div>

        {/* Secondary Toolbar: Styling for selected item OR active tool settings */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-2 bg-indigo-950/40 border-b border-indigo-500/20 text-xs animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* If item is selected, allow editing its text or direction */}
            {selectedAnnotation ? (
              <>
                {(selectedAnnotation.type === 'text' || selectedAnnotation.type === 'number') && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-300 font-medium whitespace-nowrap">
                      {selectedAnnotation.type === 'number'
                        ? t('notebook.cropModal.addNumber', '番号')
                        : t('notebook.cropModal.editSelectedText', '文字')}
                      :
                    </span>
                    <input
                      type={selectedAnnotation.type === 'number' ? 'number' : 'text'}
                      value={selectedAnnotation.text}
                      onChange={e => updateSelectedAnnotation({ text: e.target.value })}
                      placeholder={t('notebook.cropModal.textPlaceholder', '文字を入力...')}
                      className="w-28 bg-black/50 border border-indigo-500/40 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-indigo-400"
                    />
                  </div>
                )}

                {selectedAnnotation.type === 'arrow' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">{t('notebook.cropModal.arrowDirection', '向き')}:</span>
                    <div className="flex items-center gap-1">
                      {(['right', 'left', 'up', 'down'] as ArrowDirection[]).map(dir => {
                        const dirSymbols: Record<ArrowDirection, string> = {
                          right: '→',
                          left: '←',
                          up: '↑',
                          down: '↓',
                        };
                        return (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => updateSelectedAnnotation({ arrowDirection: dir })}
                            className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                              selectedAnnotation.arrowDirection === dir
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                            }`}
                          >
                            {dirSymbols[dir]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              // If no item is selected but a tool is active, display guidance
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-medium text-[11px] border border-indigo-500/40">
                  {activeStampTool === 'number'
                    ? `連番モード (次は ${nextNumberCounter})`
                    : activeStampTool === 'circle'
                    ? '〇スタンプモード'
                    : activeStampTool === 'cross'
                    ? '✕スタンプモード'
                    : activeStampTool === 'arrow'
                    ? '矢印モード'
                    : activeStampTool === 'text'
                    ? '文字追加モード'
                    : '配置済みアイテムをクリックして編集・ドラッグ'}
                </span>
                {activeStampTool === 'arrow' && (
                  <div className="flex items-center gap-1">
                    {(['right', 'left', 'up', 'down'] as ArrowDirection[]).map(dir => {
                      const dirSymbols: Record<ArrowDirection, string> = {
                        right: '→',
                        left: '←',
                        up: '↑',
                        down: '↓',
                      };
                      return (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => setCurrentArrowDirection(dir)}
                          className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                            currentArrowDirection === dir
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                          }`}
                        >
                          {dirSymbols[dir]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Reset number counter button */}
            <button
              type="button"
              onClick={() => setNextNumberCounter(1)}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-[11px] text-gray-300 border border-white/10 transition-colors whitespace-nowrap"
              title={t('notebook.cropModal.resetCounter', '次の番号を1にリセット')}
            >
              {t('notebook.cropModal.resetCounter', '番号リセット (1へ)')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Color selection */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">{t('notebook.cropModal.textColor', '色')}:</span>
              <div className="flex items-center gap-1">
                {PRESET_COLORS.map(c => {
                  const isCurrent = selectedAnnotation
                    ? selectedAnnotation.color === c.value
                    : currentStampColor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => {
                        if (selectedAnnotation) {
                          updateSelectedAnnotation({ color: c.value });
                        } else {
                          setCurrentStampColor(c.value);
                        }
                      }}
                      className={`w-5 h-5 rounded-full ${c.bg} transition-transform ${
                        isCurrent
                          ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900 scale-110'
                          : 'hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                    />
                  );
                })}
                {/* Custom Color Input */}
                <input
                  type="color"
                  value={selectedAnnotation ? selectedAnnotation.color : currentStampColor}
                  onChange={e => {
                    if (selectedAnnotation) {
                      updateSelectedAnnotation({ color: e.target.value });
                    } else {
                      setCurrentStampColor(e.target.value);
                    }
                  }}
                  title="Custom Color"
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 ml-0.5"
                />
              </div>
            </div>

            {/* Size selection */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">{t('notebook.cropModal.textSize', 'サイズ')}:</span>
              <div className="flex items-center gap-1">
                {PRESET_SIZES.map(s => {
                  const isCurrent = selectedAnnotation
                    ? selectedAnnotation.fontSize === s.value
                    : currentStampSize === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        if (selectedAnnotation) {
                          updateSelectedAnnotation({ fontSize: s.value });
                        } else {
                          setCurrentStampSize(s.value);
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                        isCurrent
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                      }`}
                    >
                      {t(`notebook.cropModal.${s.key}`, s.label)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delete button (only when selected) */}
            {selectedAnnotation && (
              <button
                type="button"
                onClick={() => handleDeleteAnnotation(selectedAnnotation.id)}
                title={t('notebook.cropModal.deleteText', '削除')}
                className="p-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors ml-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Viewport Canvas & Crop Box Area */}
        <div
          className="flex-1 min-h-[300px] max-h-[420px] p-4 flex items-center justify-center bg-black/50 overflow-hidden select-none"
        >
          <div
            ref={containerRef}
            className={`relative inline-block border border-white/10 rounded-lg shadow-xl overflow-hidden ${
              activeStampTool !== 'none' ? 'cursor-crosshair' : ''
            }`}
            style={{ touchAction: 'none' }}
            onClick={handleContainerClick}
          >
            {/* Base Canvas displaying the rotated/flipped image */}
            <canvas ref={canvasRef} className="block max-w-full max-h-[350px]" />

            {/* Annotations & Stamps Layer on top of canvas */}
            {annotations.map(item => {
              const isSelected = item.id === selectedAnnotationId;
              const isDark = isColorDark(item.color);
              const textShadow = isDark
                ? '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 5px rgba(255,255,255,0.8)'
                : '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 5px rgba(0,0,0,0.8)';
              const outlineColor = isDark ? '#FFFFFF' : '#000000';

              return (
                <div
                  key={item.id}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-0.5 rounded transition-all select-none group z-20 flex items-center justify-center ${
                    isSelected ? 'ring-2 ring-indigo-400 bg-indigo-500/20' : 'hover:ring-1 hover:ring-white/40'
                  }`}
                  style={{
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                  }}
                  onMouseDown={e => handleAnnotationMouseDown(e, item.id)}
                >
                  {/* Render annotation depending on type */}
                  {item.type === 'text' || item.type === 'number' ? (
                    <span
                      style={{
                        color: item.color,
                        fontSize: `${item.fontSize}px`,
                        fontFamily: getFontFamilyString(item.fontFamily),
                        fontWeight: 700,
                        textShadow,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.text || (item.type === 'number' ? '1' : 'Text')}
                    </span>
                  ) : item.type === 'circle' ? (
                    <svg
                      width={item.fontSize}
                      height={item.fontSize}
                      viewBox="0 0 32 32"
                      className="overflow-visible"
                    >
                      {/* Outline circle */}
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="none"
                        stroke={outlineColor}
                        strokeWidth="5"
                      />
                      {/* Inner circle */}
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="3.5"
                      />
                    </svg>
                  ) : item.type === 'cross' ? (
                    <svg
                      width={item.fontSize}
                      height={item.fontSize}
                      viewBox="0 0 32 32"
                      className="overflow-visible"
                    >
                      {/* Outline cross */}
                      <path
                        d="M6 6 L26 26 M26 6 L6 26"
                        stroke={outlineColor}
                        strokeWidth="5.5"
                        strokeLinecap="round"
                      />
                      {/* Inner cross */}
                      <path
                        d="M6 6 L26 26 M26 6 L6 26"
                        stroke={item.color}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : item.type === 'arrow' ? (
                    <div
                      style={{
                        transform: `rotate(${
                          item.arrowDirection === 'left'
                            ? '180deg'
                            : item.arrowDirection === 'up'
                            ? '-90deg'
                            : item.arrowDirection === 'down'
                            ? '90deg'
                            : '0deg'
                        })`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width={Math.round(item.fontSize * 1.4)}
                        height={Math.round(item.fontSize * 0.9)}
                        viewBox="0 0 36 24"
                        className="overflow-visible"
                      >
                        {/* Outline arrow */}
                        <path
                          d="M4 12 L30 12 M20 4 L30 12 L20 20"
                          fill="none"
                          stroke={outlineColor}
                          strokeWidth="5.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* Inner arrow */}
                        <path
                          d="M4 12 L30 12 M20 4 L30 12 L20 20"
                          fill="none"
                          stroke={item.color}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  ) : null}

                  {isSelected && (
                    <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  )}
                </div>
              );
            })}

            {/* Dark mask overlay with transparent crop box window using box-shadow */}
            <div
              className={`absolute border-2 border-indigo-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] transition-all duration-75 z-10 ${
                activeStampTool === 'none' ? 'cursor-move' : 'pointer-events-none opacity-40'
              }`}
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`,
              }}
              onMouseDown={(e) => {
                if (activeStampTool === 'none') {
                  handleCropMouseDown(e, 'box');
                }
              }}
            >
              {/* 3x3 Grid rule-of-thirds lines */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-white"></div>
                <div className="border-r border-white"></div>
                <div></div>
              </div>

              {/* Corner Handles (only active when not stamping) */}
              {activeStampTool === 'none' && (
                <>
                  <div
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-indigo-500 border border-white rounded-sm cursor-nwse-resize shadow-md pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'nw')}
                  />
                  <div
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-indigo-500 border border-white rounded-sm cursor-nesw-resize shadow-md pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'ne')}
                  />
                  <div
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-indigo-500 border border-white rounded-sm cursor-nwse-resize shadow-md pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'se')}
                  />
                  <div
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-indigo-500 border border-white rounded-sm cursor-nesw-resize shadow-md pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'sw')}
                  />

                  {/* Edge Handles */}
                  <div
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-indigo-400 border border-white rounded-sm cursor-ns-resize pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'n')}
                  />
                  <div
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-indigo-400 border border-white rounded-sm cursor-ns-resize pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 's')}
                  />
                  <div
                    className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-4 bg-indigo-400 border border-white rounded-sm cursor-ew-resize pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'w')}
                  />
                  <div
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-4 bg-indigo-400 border border-white rounded-sm cursor-ew-resize pointer-events-auto"
                    onMouseDown={(e) => handleCropMouseDown(e, 'e')}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer: Alt text, Cancel, Insert Original, Apply Crop & Insert */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-white/10 bg-slate-800/80">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-sm">
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {t('notebook.cropModal.altTextLabel', '画像の説明 (Alt):')}
            </span>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder={t('notebook.cropModal.altTextPlaceholder', '例: WB_サンプル1')}
              className="flex-1 bg-black/40 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
            >
              {t('common.cancel', 'キャンセル')}
            </button>
            <button
              type="button"
              onClick={handleConfirmOriginal}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-xs font-medium transition-colors"
            >
              {t('notebook.cropModal.insertOriginal', 'そのまま挿入')}
            </button>
            <button
              type="button"
              onClick={handleConfirmCropped}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>
                {isProcessing
                  ? t('common.loading', '処理中...')
                  : t('notebook.cropModal.insertCropped', '調整して挿入')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;


