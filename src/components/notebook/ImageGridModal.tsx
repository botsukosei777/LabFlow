import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Upload,
  Trash2,
  Check,
  Image as ImageIcon,
  Grid2X2,
  Loader2,
  Sparkles,
  Scissors,
  Eye,
  Edit3,
  Maximize2
} from 'lucide-react';
import { uploadImageFile } from '../../utils/markdownConfig';
import { ImageCropModal } from './ImageCropModal';

export interface ImageGridModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertGrid: (markdown: string) => void;
}

interface GridSlot {
  id: string;
  url: string;
  label: string;
  isUploading?: boolean;
  error?: string;
}

const PRESETS = [
  { label: '2 × 2 (4枚)', rows: 2, cols: 2 },
  { label: '2 × 1 (横2枚)', rows: 1, cols: 2 },
  { label: '3 × 1 (横3枚)', rows: 1, cols: 3 },
  { label: '3 × 2 (6枚)', rows: 2, cols: 3 },
  { label: '4 × 1 (横4枚)', rows: 1, cols: 4 },
];

const HEIGHT_OPTIONS = [
  { label: '小 (140px)', value: 140 },
  { label: '中 (200px)', value: 200 },
  { label: '大 (260px)', value: 260 },
  { label: '特大 (320px)', value: 320 },
];

export const ImageGridModal: React.FC<ImageGridModalProps> = ({
  isOpen,
  onClose,
  onInsertGrid,
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [slots, setSlots] = useState<GridSlot[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [imageHeight, setImageHeight] = useState<number>(200);
  const [legendText, setLegendText] = useState<string>('');
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  // Initialize or re-dimension slots when rows/cols change
  useEffect(() => {
    if (!isOpen) return;
    const total = rows * cols;
    setSlots(prev => {
      const next: GridSlot[] = [];
      for (let i = 0; i < total; i++) {
        if (prev[i]) {
          next.push(prev[i]);
        } else {
          const letter = String.fromCharCode(65 + i);
          next.push({
            id: `slot-${Date.now()}-${i}`,
            url: '',
            label: `(${letter})`,
          });
        }
      }
      return next;
    });
  }, [rows, cols, isOpen]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setRows(2);
      setCols(2);
      const total = 4;
      const initial: GridSlot[] = [];
      for (let i = 0; i < total; i++) {
        const letter = String.fromCharCode(65 + i);
        initial.push({
          id: `slot-${Date.now()}-${i}`,
          url: '',
          label: `(${letter})`,
        });
      }
      setSlots(initial);
      setActiveSlotIndex(null);
      setActiveTab('edit');
      setImageHeight(200);
      setLegendText('');
      setEditingSlotIndex(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle single slot upload
  const handleSingleSlotUpload = async (file: File, index: number) => {
    setSlots(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], isUploading: true, error: undefined };
      }
      return next;
    });

    try {
      const data = await uploadImageFile(file, file.name);
      setSlots(prev => {
        const next = [...prev];
        if (next[index]) {
          const letter = String.fromCharCode(65 + index);
          const nameNoExt = file.name.replace(/\.[^/.]+$/, '');
          const currentLabel = next[index].label;
          const newLabel =
            currentLabel && currentLabel !== `(${letter})`
              ? currentLabel
              : `(${letter}) ${nameNoExt}`;
          next[index] = {
            ...next[index],
            url: data.url,
            label: newLabel,
            isUploading: false,
          };
        }
        return next;
      });
    } catch (err: any) {
      setSlots(prev => {
        const next = [...prev];
        if (next[index]) {
          next[index] = {
            ...next[index],
            isUploading: false,
            error: err.message || 'Upload failed',
          };
        }
        return next;
      });
    }
  };

  // Handle batch multiple file selection
  const handleBatchFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    setIsBatchUploading(true);

    // If more files than slots, expand rows if needed
    const totalFiles = fileArray.length;
    let targetRows = rows;
    let targetCols = cols;
    if (totalFiles > rows * cols) {
      if (cols <= 2) {
        targetRows = Math.ceil(totalFiles / 2);
        targetCols = 2;
      } else {
        targetRows = Math.ceil(totalFiles / cols);
      }
      setRows(targetRows);
      setCols(targetCols);
    }

    const totalNeeded = Math.max(targetRows * targetCols, totalFiles);
    const firstEmptyIndex = slots.findIndex(s => !s.url);
    const startIdx = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;

    const newSlots = [...slots];
    while (newSlots.length < totalNeeded) {
      const i = newSlots.length;
      const letter = String.fromCharCode(65 + i);
      newSlots.push({
        id: `slot-${Date.now()}-${i}`,
        url: '',
        label: `(${letter})`,
      });
    }

    // Set uploading state
    fileArray.forEach((_, i) => {
      const slotIdx = startIdx + i;
      if (slotIdx < newSlots.length) {
        newSlots[slotIdx] = {
          ...newSlots[slotIdx]!,
          isUploading: true,
          error: undefined,
        };
      }
    });
    setSlots(newSlots);

    // Upload in parallel
    await Promise.all(
      fileArray.map(async (file, i) => {
        const slotIdx = startIdx + i;
        try {
          const data = await uploadImageFile(file, file.name);
          const letter = String.fromCharCode(65 + slotIdx);
          const nameNoExt = file.name.replace(/\.[^/.]+$/, '');
          setSlots(current => {
            const updated = [...current];
            if (updated[slotIdx]) {
              updated[slotIdx] = {
                ...updated[slotIdx],
                url: data.url,
                label: `(${letter}) ${nameNoExt}`,
                isUploading: false,
              };
            }
            return updated;
          });
        } catch (err: any) {
          setSlots(current => {
            const updated = [...current];
            if (updated[slotIdx]) {
              updated[slotIdx] = {
                ...updated[slotIdx],
                isUploading: false,
                error: err.message || 'Upload failed',
              };
            }
            return updated;
          });
        }
      })
    );

    setIsBatchUploading(false);
  };

  const handleSlotDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 1 && files[0]) {
      handleSingleSlotUpload(files[0], index);
    } else if (files.length > 1) {
      handleBatchFiles(files);
    }
  };

  const handleSlotPaste = async (e: React.ClipboardEvent, index: number) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        handleSingleSlotUpload(file, index);
      }
    }
  };

  const updateSlotLabel = (index: number, label: string) => {
    setSlots(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], label };
      }
      return next;
    });
  };

  const clearSlot = (index: number) => {
    setSlots(prev => {
      const next = [...prev];
      if (next[index]) {
        const letter = String.fromCharCode(65 + index);
        next[index] = {
          ...next[index],
          url: '',
          label: `(${letter})`,
          error: undefined,
        };
      }
      return next;
    });
  };

  // Handle crop confirm from ImageCropModal for a slot
  const handleCropConfirmForSlot = async (slotIdx: number, blob: Blob, altText: string) => {
    setSlots(prev => {
      const next = [...prev];
      if (next[slotIdx]) {
        next[slotIdx] = { ...next[slotIdx], isUploading: true, error: undefined };
      }
      return next;
    });

    try {
      const data = await uploadImageFile(blob, `${altText || 'slot-edited'}.png`);
      setSlots(prev => {
        const next = [...prev];
        if (next[slotIdx]) {
          next[slotIdx] = {
            ...next[slotIdx],
            url: data.url,
            label: altText.trim() || next[slotIdx].label,
            isUploading: false,
          };
        }
        return next;
      });
    } catch (err: any) {
      setSlots(prev => {
        const next = [...prev];
        if (next[slotIdx]) {
          next[slotIdx] = {
            ...next[slotIdx],
            isUploading: false,
            error: err.message || 'Crop upload failed',
          };
        }
        return next;
      });
    } finally {
      setEditingSlotIndex(null);
    }
  };

  // Generate standard Markdown table for the image grid
  const handleInsert = () => {
    const lines: string[] = [];

    for (let r = 0; r < rows; r++) {
      const rowSlots = slots.slice(r * cols, (r + 1) * cols);

      // Header row
      const headerLabels = rowSlots.map((s, cIdx) => {
        const defaultLetter = String.fromCharCode(65 + r * cols + cIdx);
        const clean = s.label.replace(/\|/g, '／').trim();
        return clean || `(${defaultLetter})`;
      });

      if (r === 0) {
        lines.push(`| ${headerLabels.join(' | ')} |`);
        lines.push(`| ${Array(cols).fill(':---:').join(' | ')} |`);
      } else {
        // Subsequent row headers formatted with bold
        lines.push(`| ${headerLabels.map(l => `**${l}**`).join(' | ')} |`);
      }

      // Image cells row with title specification for height (never breaks GFM table pipes!)
      const imageCells = rowSlots.map((s, cIdx) => {
        const defaultLetter = String.fromCharCode(65 + r * cols + cIdx);
        const alt = s.label.replace(/\|/g, '／').trim() || `Image ${defaultLetter}`;
        if (s.url) {
          return `![${alt}](${s.url} "${imageHeight}px")`;
        }
        return `*(画像未設定)*`;
      });
      lines.push(`| ${imageCells.join(' | ')} |`);
    }

    let markdown = `\n\n${lines.join('\n')}\n\n`;
    if (legendText.trim()) {
      markdown += `*${legendText.trim()}*\n\n`;
    }

    onInsertGrid(markdown);
    onClose();
  };

  const filledCount = slots.filter(s => !!s.url).length;

  return (
    <>
      <div
        className="modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '16px',
        }}
        onClick={onClose}
      >
        <div
          className="modal-content glass-panel"
          style={{
            width: '100%',
            maxWidth: '880px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            animation: 'scaleIn 0.2s ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(30, 41, 59, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <Grid2X2 size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
                  {t('notebook.imageGridTitle', '画像グリッド配置 (行列レイアウト)')}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                  {t('notebook.imageGridSubtitle', '2行2列や3行1列など、画像をきれいに整列して比較配置できます')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="btn btn-icon btn-ghost btn-sm"
              style={{ color: '#94a3b8', borderRadius: '8px' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '0 20px',
              background: 'rgba(15, 23, 42, 0.6)',
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                style={{
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: activeTab === 'edit' ? 600 : 400,
                  color: activeTab === 'edit' ? '#818cf8' : '#94a3b8',
                  borderBottom: activeTab === 'edit' ? '2px solid #6366f1' : '2px solid transparent',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Edit3 size={15} />
                <span>{t('notebook.gridEditTab', 'グリッド編集')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                style={{
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: activeTab === 'preview' ? 600 : 400,
                  color: activeTab === 'preview' ? '#818cf8' : '#94a3b8',
                  borderBottom: activeTab === 'preview' ? '2px solid #6366f1' : '2px solid transparent',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Eye size={15} />
                <span>{t('notebook.gridPreviewTab', 'プレビュー')}</span>
                {filledCount > 0 && (
                  <span
                    style={{
                      fontSize: '10px',
                      background: '#6366f1',
                      color: 'white',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontWeight: 600,
                    }}
                  >
                    {filledCount}
                  </span>
                )}
              </button>
            </div>

            {/* Image Size Selection */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {t('notebook.imageSize', '画像サイズ:')}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {HEIGHT_OPTIONS.map(opt => {
                  const active = imageHeight === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setImageHeight(opt.value)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        borderRadius: '5px',
                        border: active ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: active ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                        color: active ? '#a5b4fc' : '#94a3b8',
                        cursor: 'pointer',
                        fontWeight: active ? 600 : 400,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Controls Toolbar (Only on Edit tab) */}
          {activeTab === 'edit' && (
            <div
              style={{
                padding: '10px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'rgba(15, 23, 42, 0.4)',
              }}
            >
              {/* Preset Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', marginRight: '4px' }}>
                  {t('notebook.presetLayout', '配置:')}
                </span>
                {PRESETS.map((p, idx) => {
                  const active = rows === p.rows && cols === p.cols;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setRows(p.rows);
                        setCols(p.cols);
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: active ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: active ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        color: active ? '#818cf8' : '#cbd5e1',
                        cursor: 'pointer',
                        fontWeight: active ? 600 : 400,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Batch Upload Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  ref={batchFileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleBatchFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 12px',
                  }}
                  disabled={isBatchUploading}
                  onClick={() => batchFileInputRef.current?.click()}
                >
                  {isBatchUploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-indigo-400" />
                      <span>{t('notebook.uploadingBatch', '一括アップロード中...')}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={14} className="text-indigo-400" />
                      <span>{t('notebook.batchSelectImages', '画像をまとめて選択 (複数可)')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Hidden single file input */}
          <input
            ref={singleFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              if (activeSlotIndex !== null && e.target.files && e.target.files[0]) {
                handleSingleSlotUpload(e.target.files[0], activeSlotIndex);
                e.target.value = '';
              }
            }}
          />

          {/* Body Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {activeTab === 'edit' ? (
              <>
                {/* Slots Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gap: '14px',
                    width: '100%',
                  }}
                >
                  {slots.map((slot, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    return (
                      <div
                        key={slot.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: '10px',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          background: 'rgba(30, 41, 59, 0.4)',
                          overflow: 'hidden',
                          transition: 'border-color 0.15s ease',
                        }}
                        onDrop={e => handleSlotDrop(e, idx)}
                        onDragOver={e => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onPaste={e => handleSlotPaste(e, idx)}
                        tabIndex={0}
                      >
                        {/* Slot Header / Label Input & Actions */}
                        <div
                          style={{
                            padding: '6px 10px',
                            background: 'rgba(15, 23, 42, 0.7)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#818cf8',
                              width: '20px',
                              textAlign: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {letter}
                          </span>
                          <input
                            type="text"
                            value={slot.label}
                            onChange={e => updateSlotLabel(idx, e.target.value)}
                            placeholder={`(${letter}) キャプション・条件名`}
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              color: '#f1f5f9',
                              fontSize: '12px',
                              outline: 'none',
                              padding: '2px 4px',
                              minWidth: 0,
                            }}
                          />
                          {slot.url && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => setEditingSlotIndex(idx)}
                                style={{
                                  background: 'rgba(99, 102, 241, 0.2)',
                                  border: '1px solid rgba(99, 102, 241, 0.4)',
                                  color: '#a5b4fc',
                                  cursor: 'pointer',
                                  padding: '3px 7px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                }}
                                title={t('notebook.cropAndEditSlot', 'この画像を編集・トリミング')}
                              >
                                <Scissors size={12} />
                                <span>{t('notebook.editImage', '編集')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => clearSlot(idx)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title={t('common.delete', '画像を削除')}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Slot Image Area */}
                        <div
                          style={{
                            minHeight: '150px',
                            maxHeight: '200px',
                            height: '160px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            background: 'rgba(0, 0, 0, 0.25)',
                            padding: '8px',
                            cursor: slot.url ? 'default' : 'pointer',
                          }}
                          onClick={() => {
                            if (!slot.url && !slot.isUploading) {
                              setActiveSlotIndex(idx);
                              singleFileInputRef.current?.click();
                            }
                          }}
                        >
                          {slot.isUploading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                              <Loader2 size={24} className="animate-spin text-indigo-400" />
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {t('common.loading', '処理中...')}
                              </span>
                            </div>
                          ) : slot.url ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img
                                src={slot.url}
                                alt={slot.label}
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  width: 'auto',
                                  height: 'auto',
                                  objectFit: 'contain',
                                  borderRadius: '4px',
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#64748b',
                                textAlign: 'center',
                              }}
                            >
                              <ImageIcon size={28} strokeWidth={1.5} />
                              <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8' }}>
                                {t('notebook.clickOrDropImage', 'クリックして画像選択')}
                              </span>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>
                                {t('notebook.orDropPaste', 'またはドラッグ＆ドロップ / Ctrl+V')}
                              </span>
                            </div>
                          )}

                          {slot.error && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 4,
                                left: 4,
                                right: 4,
                                background: 'rgba(239, 68, 68, 0.85)',
                                color: 'white',
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                textAlign: 'center',
                              }}
                            >
                              {slot.error}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Figure Legend Section */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(30, 41, 59, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{t('notebook.figureLegend', 'Figure レジェンド / キャプション説明文 (画像下部に挿入)')}</span>
                  </label>
                  <textarea
                    rows={2}
                    value={legendText}
                    onChange={e => setLegendText(e.target.value)}
                    placeholder={t(
                      'notebook.figureLegendPlaceholder',
                      '例: Figure 1. 各実験群における細胞形態および抗体染色の比較。(A) コントロール, (B) 薬剤A添加群, (C) 薬剤B添加群, (D) 併用群。'
                    )}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      padding: '8px 10px',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {t(
                      'notebook.figureLegendHint',
                      '※ 入力した文章は画像グリッドの直下にイタリック形式（*Figure 1. ...*）で挿入されます。'
                    )}
                  </span>
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Sparkles size={16} className="text-indigo-400 flex-shrink-0" />
                  <span>
                    {t(
                      'notebook.imageGridTip',
                      '各スロットの「編集」から1枚単位でトリミングや回転、注釈入れが可能です。上の「プレビュー」タブで挿入前のレイアウトを確認できます。'
                    )}
                  </span>
                </div>
              </>
            ) : (
              /* Preview Tab Content */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    padding: '24px',
                    borderRadius: '12px',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <table
                      className="image-matrix-table"
                      style={{
                        borderCollapse: 'collapse',
                        margin: '0 auto',
                      }}
                    >
                      <thead>
                        <tr>
                          {slots.slice(0, cols).map((s, cIdx) => {
                            const defaultLetter = String.fromCharCode(65 + cIdx);
                            return (
                              <th
                                key={cIdx}
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'center',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: '#cbd5e1',
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                              >
                                {s.label.trim() || `(${defaultLetter})`}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: rows }).map((_, r) => {
                          const rowSlots = slots.slice(r * cols, (r + 1) * cols);
                          return (
                            <React.Fragment key={r}>
                              {r > 0 && (
                                <tr>
                                  {rowSlots.map((s, cIdx) => {
                                    const defaultLetter = String.fromCharCode(65 + r * cols + cIdx);
                                    return (
                                      <th
                                        key={cIdx}
                                        style={{
                                          padding: '8px 12px',
                                          textAlign: 'center',
                                          fontSize: '13px',
                                          fontWeight: 600,
                                          color: '#cbd5e1',
                                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                        }}
                                      >
                                        {s.label.trim() || `(${defaultLetter})`}
                                      </th>
                                    );
                                  })}
                                </tr>
                              )}
                              <tr>
                                {rowSlots.map((s, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="image-matrix-cell"
                                    style={{
                                      padding: '8px',
                                      textAlign: 'center',
                                      verticalAlign: 'middle',
                                    }}
                                  >
                                    {s.url ? (
                                      <img
                                        src={s.url}
                                        alt={s.label}
                                        style={{
                                          maxHeight: `${imageHeight}px`,
                                          maxWidth: '100%',
                                          height: 'auto',
                                          width: 'auto',
                                          objectFit: 'contain',
                                          borderRadius: '4px',
                                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                                        }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          width: `${Math.round(imageHeight * 1.2)}px`,
                                          height: `${imageHeight}px`,
                                          borderRadius: '6px',
                                          border: '1px dashed rgba(255, 255, 255, 0.15)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: '#64748b',
                                          fontSize: '12px',
                                          fontStyle: 'italic',
                                          margin: '0 auto',
                                        }}
                                      >
                                        *(画像未設定)*
                                      </div>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Figure Legend in Preview */}
                  {legendText.trim() && (
                    <div
                      style={{
                        marginTop: '20px',
                        width: '100%',
                        maxWidth: '750px',
                        padding: '12px 16px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderLeft: '3px solid #6366f1',
                        fontSize: '13px',
                        color: '#cbd5e1',
                        fontStyle: 'italic',
                        lineHeight: 1.6,
                        textAlign: 'left',
                      }}
                    >
                      {legendText.trim()}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('edit')}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Edit3 size={14} />
                    <span>{t('notebook.backToGridEdit', '編集に戻る')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleInsert}
                    className="btn btn-primary btn-sm"
                    disabled={filledCount === 0 || isBatchUploading}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Check size={14} />
                    <span>{t('notebook.insertGridToNote', 'この内容でノートに挿入')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(30, 41, 59, 0.5)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {t('notebook.gridImagesSelected', {
                count: filledCount,
                total: slots.length,
                defaultValue: `${filledCount} / ${slots.length} 枚の画像を設定済み`,
              })}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
                {t('common.cancel', 'キャンセル')}
              </button>
              <button
                type="button"
                onClick={handleInsert}
                className="btn btn-primary btn-sm"
                disabled={filledCount === 0 || isBatchUploading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Check size={14} />
                <span>{t('notebook.insertGridToNote', 'グリッドをノートに挿入')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Slot Image Crop & Edit Modal */}
      {editingSlotIndex !== null && slots[editingSlotIndex] && (
        <ImageCropModal
          isOpen={true}
          imageUrl={slots[editingSlotIndex].url}
          initialAltText={slots[editingSlotIndex].label}
          onClose={() => setEditingSlotIndex(null)}
          onConfirm={(blob, altText) => handleCropConfirmForSlot(editingSlotIndex, blob, altText)}
        />
      )}
    </>
  );
};
