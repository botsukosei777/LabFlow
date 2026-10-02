import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, Calendar, ArrowUpDown, Scissors, ShieldCheck } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import MDEditor from '@uiw/react-md-editor';
import { mdRemarkPlugins, mdRehypePlugins } from '../../utils/markdownConfig';
import type { LiteratureItem } from '../../types';
import {
  CITATION_STYLES,
  type CitationStyleId,
  processCitations
} from '../../utils/citationEngine';

interface Note {
  id: number;
  title: string;
  content: string;
  date: string;
  scheduled_experiment_id?: number | null;
  tags?: string;
  created_at?: string;
  updated_at?: string;
}

interface PrintNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  literatures?: LiteratureItem[];
  citationStyle?: CitationStyleId;
}

interface ContentBlock {
  id: string;
  noteId: number;
  type: 'header' | 'markdown';
  content?: string;
  isImage?: boolean;
  note?: Note;
  isLastInNote?: boolean;
  fittedMaxHeight?: number; // Dynamically calculated height to fit remaining space on page
}

const parseTags = (tagsStr?: string) => {
  if (!tagsStr) return [];
  try { return JSON.parse(tagsStr); } catch (e) { return []; }
};

/**
 * Splits markdown content into atomic blocks while keeping images, captions/legends,
 * and text paragraphs tightly integrated. Prevents unnecessary page breaks by allowing
 * fine-grained packaging while never breaking an image away from its caption.
 */
function splitMarkdownIntoAtomicBlocks(markdown: string, noteId: number): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = markdown.split('\n');
  let textBuffer: string[] = [];

  const flushText = () => {
    const trimmed = textBuffer.join('\n').trim();
    if (trimmed) {
      blocks.push({
        id: `note-${noteId}-b-${blocks.length}`,
        noteId,
        type: 'markdown',
        content: trimmed,
        isImage: false,
      });
    }
    textBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // 1. Check if line is part of a markdown table (e.g. image matrix grid or data table)
    if (line.trim().startsWith('|')) {
      flushText();
      const tableLines: string[] = [];
      let tableHasImage = false;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const cur = lines[i]!;
        tableLines.push(cur);
        if (/!\[.*?\]\(.*?\)/.test(cur) || /<img\s+[^>]*>/i.test(cur)) {
          tableHasImage = true;
        }
        i++;
      }
      i--; // adjust loop index

      // If table has images, keep immediately following legend/caption line in the same block
      if (tableHasImage) {
        let peek = i + 1;
        while (peek < lines.length && lines[peek]!.trim() === '') {
          peek++;
        }
        if (peek < lines.length && /^\s*(\*|_|図|Fig|Photo|画像|Caption|Legend)/i.test(lines[peek]!.trim())) {
          tableLines.push('\n' + lines[peek]!.trim());
          i = peek;
        }
      }

      blocks.push({
        id: `note-${noteId}-b-${blocks.length}`,
        noteId,
        type: 'markdown',
        content: tableLines.join('\n'),
        isImage: tableHasImage,
      });
      continue;
    }

    // 2. Check if line contains markdown or HTML image
    const hasImage = /!\[.*?\]\(.*?\)/.test(line) || /<img\s+[^>]*>/i.test(line);

    if (hasImage) {
      flushText();
      const imageLines: string[] = [line.trim()];

      // Keep immediately following caption/legend attached to this image block
      let peek = i + 1;
      while (peek < lines.length && lines[peek]!.trim() === '') {
        peek++;
      }
      if (peek < lines.length && /^\s*(\*|_|図|Fig|Photo|画像|Caption|Legend)/i.test(lines[peek]!.trim())) {
        imageLines.push(lines[peek]!.trim());
        i = peek;
      }

      blocks.push({
        id: `note-${noteId}-b-${blocks.length}`,
        noteId,
        type: 'markdown',
        content: imageLines.join('\n\n'),
        isImage: true,
      });
      continue;
    }

    // 3. Section headings (#, ##, ###) start fresh blocks for orphan prevention
    if (/^#{1,6}\s+/.test(line.trim())) {
      flushText();
      textBuffer.push(line);
      continue;
    }

    // 4. Blank line: flush paragraphs to allow granular packing on pages
    if (line.trim() === '' && textBuffer.length > 0) {
      flushText();
    } else {
      textBuffer.push(line);
    }
  }

  flushText();
  return blocks;
}

function splitNoteIntoPrintBlocks(
  note: Note,
  literatureMap?: Map<number, LiteratureItem>,
  citationStyle: CitationStyleId = 'nature'
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // 1. Header block
  blocks.push({
    id: `note-${note.id}-header`,
    noteId: note.id,
    type: 'header',
    note,
  });

  // Process citations if literatures are available
  let content = note.content || '';
  if (literatureMap && literatureMap.size > 0) {
    const res = processCitations(content, literatureMap, citationStyle);
    const hasManualBib = /##\s*(?:参考文献|References)/i.test(content);
    if (!hasManualBib && res.citedItems.length > 0) {
      const styleName = CITATION_STYLES.find(s => s.id === citationStyle)?.name || 'References';
      content = `${res.processedText}\n\n---\n### 参考文献 (${styleName})\n\n${res.bibliographyMarkdown}`;
    } else {
      content = res.processedText;
    }
  }

  // 2. Content blocks
  const contentBlocks = splitMarkdownIntoAtomicBlocks(content, note.id);
  blocks.push(...contentBlocks);

  if (blocks.length > 0) {
    blocks[blocks.length - 1].isLastInNote = true;
  }

  return blocks;
}

export const PrintNotesModal: React.FC<PrintNotesModalProps> = ({
  isOpen,
  onClose,
  notes,
  literatures,
  citationStyle = 'nature',
}) => {
  const { t } = useTranslation();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<'compact' | 'normal'>('compact');
  const [voidLines, setVoidLines] = useState<boolean>(true);

  const measureRef = useRef<HTMLDivElement>(null);
  const heightProbeRef = useRef<HTMLDivElement>(null);
  const [measureVersion, setMeasureVersion] = useState(0);
  const [pages, setPages] = useState<ContentBlock[][]>([]);

  // Presets
  const handlePreset = (type: 'week' | 'this_month' | 'last_month' | 'all') => {
    const now = new Date();
    if (type === 'week') {
      setStartDate(format(subDays(now, 7), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (type === 'this_month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else if (type === 'last_month') {
      const lastMonth = subMonths(now, 1);
      setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
    } else if (type === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Filter & Sort
  const targetNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (startDate && note.date < startDate) return false;
        if (endDate && note.date > endDate) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date === b.date) {
          return sortAsc ? a.id - b.id : b.id - a.id;
        }
        return sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      });
  }, [notes, startDate, endDate, sortAsc]);

  const literatureMap = useMemo(() => {
    const map = new Map<number, LiteratureItem>();
    (literatures || []).forEach(lit => map.set(lit.id, lit));
    return map;
  }, [literatures]);

  // Convert notes into flat atomic blocks
  const allBlocks = useMemo(() => {
    const result: ContentBlock[] = [];
    for (const note of targetNotes) {
      result.push(...splitNoteIntoPrintBlocks(note, literatureMap, citationStyle));
    }
    return result;
  }, [targetNotes, literatureMap, citationStyle]);

  // A4 Pagination Algorithm: Partition blocks into exact A4 pages
  // Prioritizes space-packing (高密度配置・改ページ抑制) to eliminate empty spaces in lab notebooks
  useEffect(() => {
    if (allBlocks.length === 0) {
      setPages([]);
      return;
    }

    // Measure maximum content height for A4 (297mm - margins - footer)
    const pageMaxHeight = heightProbeRef.current?.clientHeight || 980;
    const resultPages: ContentBlock[][] = [];
    let currentPage: ContentBlock[] = [];
    let currentHeight = 0;

    for (let i = 0; i < allBlocks.length; i++) {
      const block = allBlocks[i]!;
      const el = document.getElementById(`measure-${block.id}`);
      const elHeight = el ? Math.ceil(el.getBoundingClientRect().height) : 28;

      const remainingSpace = pageMaxHeight - currentHeight;

      // Avoid leaving an orphan header at the very bottom of a page
      const isOrphanHeader = block.type === 'header' && (currentHeight + elHeight + 50 > pageMaxHeight);

      if (isOrphanHeader && currentPage.length > 0) {
        resultPages.push(currentPage);
        currentPage = [block];
        currentHeight = elHeight;
        continue;
      }

      // Check if block fits at its natural measured height
      if (currentHeight + elHeight <= pageMaxHeight) {
        currentPage.push(block);
        currentHeight += elHeight;
        continue;
      }

      // Block exceeds remaining space on current page!
      // If the block is an IMAGE or table containing images, adaptively scale it down
      // so it fits into the remaining space instead of eagerly breaking to a new page
      // and leaving a suspicious blank gap (研究不正・追記防止).
      if (block.isImage && currentPage.length > 0) {
        const isTable = block.content?.trim().startsWith('|');
        const minViableHeight = isTable ? 100 : 65; // minimum legible height

        if (remainingSpace >= minViableHeight) {
          // Fit this image block directly into the remaining space!
          const fittedHeight = remainingSpace - 8;
          const fittedBlock: ContentBlock = {
            ...block,
            fittedMaxHeight: Math.max(45, fittedHeight - 12),
          };
          currentPage.push(fittedBlock);
          // Current page is now fully packed to capacity!
          resultPages.push(currentPage);
          currentPage = [];
          currentHeight = 0;
          continue;
        }
      }

      // If it genuinely cannot fit on current page:
      if (currentPage.length > 0) {
        resultPages.push(currentPage);
        currentPage = [block];
        currentHeight = elHeight;
      } else {
        // First block on empty page exceeds pageMaxHeight
        resultPages.push([block]);
        currentPage = [];
        currentHeight = 0;
      }
    }

    if (currentPage.length > 0) {
      resultPages.push(currentPage);
    }

    setPages(resultPages);
  }, [allBlocks, fontSize, measureVersion]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const renderBlock = (block: ContentBlock, isMeasuring = false) => {
    const isCompact = fontSize === 'compact';

    if (block.type === 'header' && block.note) {
      const note = block.note;
      const tags = parseTags(note.tags);

      return (
        <div className="print-note-header pt-2 pb-1 mb-1 first:pt-0">
          <div className="flex items-start gap-2 mb-1">
            {/* Left Date Badge */}
            <div className="print-date-badge flex-shrink-0 w-[82px] px-1.5 py-0.5 bg-gray-900 text-white rounded text-center text-xs font-bold font-mono tracking-tight leading-tight border border-gray-900">
              {note.date}
            </div>

            {/* Title, tags, timestamps */}
            <div className="flex-1 flex flex-wrap items-baseline gap-2 min-w-0">
              <h3
                className={`font-bold text-gray-900 tracking-tight leading-tight break-words ${
                  isCompact ? 'text-xs' : 'text-sm'
                }`}
              >
                {note.title}
              </h3>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((t: string, i: number) => (
                    <span
                      key={i}
                      className="print-tag-badge text-[9px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 border border-gray-300 font-medium"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {note.scheduled_experiment_id && (
                <span className="print-exp-badge text-[9px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-medium">
                  {t('notebook.hasRelatedExperiment', '関連実験あり')}
                </span>
              )}

              {(note.created_at || note.updated_at) && (
                <div className="print-timestamps ml-auto flex items-center gap-2 text-[9px] text-gray-500 font-mono">
                  {note.created_at && (
                    <span>
                      {t('notebook.createdAt', '作成')}: {note.created_at.replace('T', ' ').substring(0, 16)}
                    </span>
                  )}
                  {note.updated_at && (
                    <span>
                      {t('notebook.updatedAt', '更新')}: {note.updated_at.replace('T', ' ').substring(0, 16)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    const isImageBlock = block.isImage;
    const fittedImgH = block.fittedMaxHeight;
    const isTableWithImage = isImageBlock && block.content && block.content.trim().startsWith('|');

    // For tables with images, calculate per-row max-height so multi-row grids shrink proportionally
    let tableImgH = fittedImgH;
    if (fittedImgH && isTableWithImage) {
      const rowCount = (block.content?.match(/\|.*!\[/g) || []).length || 1;
      tableImgH = Math.max(38, Math.floor((fittedImgH - (rowCount * 16)) / rowCount));
    }

    const blockStyle: React.CSSProperties = {
      ...(fittedImgH ? {
        ['--fitted-img-h' as any]: `${fittedImgH}px`,
        ['--fitted-table-img-h' as any]: `${tableImgH}px`,
      } : {}),
    };

    return (
      <div
        className={`print-block-wrapper ${block.isImage ? 'print-image-block' : 'print-text-block'}`}
        style={blockStyle}
      >
        <div
          className={`text-gray-800 leading-relaxed overflow-hidden break-words ${
            isCompact ? 'text-[11px] prose-compact' : 'text-xs'
          }`}
          data-color-mode="light"
          style={{
            lineHeight: isCompact ? '1.35' : '1.45',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          <MDEditor.Markdown
            source={block.content || ''}
            style={{
              backgroundColor: 'transparent',
              color: '#1f2937',
              fontSize: isCompact ? '11px' : '12px',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
            remarkPlugins={mdRemarkPlugins}
            rehypePlugins={mdRehypePlugins}
          />
        </div>

        {block.isLastInNote && (
          <div className="my-1.5 border-b border-dashed border-gray-300 flex items-center justify-between text-[8px] text-gray-400 font-mono">
            <span className="flex items-center gap-1">
              <Scissors className="w-2.5 h-2.5" />
              {t('notebook.printModal.cutLine', '切り取り線')}
            </span>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div
      className="print-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* 印刷用 & プレビュー用 CSS */}
      <style>{`
        /* =========================================================
           A4 Screen & Print CSS
           ========================================================= */
        .a4-sheet {
          width: 210mm;
          height: 297mm;
          min-height: 297mm;
          max-height: 297mm;
          padding: 12mm 14mm;
          box-sizing: border-box;
          background-color: #ffffff;
          color: #111827;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .a4-sheet img {
          max-width: 100% !important;
          max-height: var(--fitted-img-h, 150px) !important;
          width: auto !important;
          height: auto !important;
          object-fit: contain !important;
          display: block !important;
          margin: 2px auto !important;
          border: 1px solid #d1d5db !important;
          border-radius: 3px !important;
        }

        .a4-sheet.normal img {
          max-height: var(--fitted-img-h, 175px) !important;
        }

        .a4-sheet.compact img {
          max-height: var(--fitted-img-h, 135px) !important;
          margin: 1px auto !important;
        }

        .a4-sheet p:has(> img) {
          text-align: center !important;
          margin: 2px 0 !important;
        }

        .a4-sheet table:has(img),
        .a4-sheet table.image-matrix-table {
          border: none !important;
          width: 100% !important;
          table-layout: fixed !important;
          border-collapse: separate !important;
          border-spacing: 4px 4px !important;
          margin: 2px 0 !important;
        }

        .a4-sheet table:has(img) th,
        .a4-sheet table.image-matrix-table th {
          border: none !important;
          background: transparent !important;
          text-align: center !important;
          padding: 1px 2px !important;
          font-size: 9px !important;
          color: #374151 !important;
          font-weight: 600 !important;
        }

        .a4-sheet table:has(img) td,
        .a4-sheet table.image-matrix-table td {
          border: 1px solid #e5e7eb !important;
          background: #f9fafb !important;
          border-radius: 3px !important;
          padding: 2px !important;
          vertical-align: middle !important;
          text-align: center !important;
        }

        .a4-sheet table:has(img) td img,
        .a4-sheet table.image-matrix-table td img {
          max-width: 100% !important;
          width: 100% !important;
          max-height: var(--fitted-table-img-h, 95px) !important;
          height: auto !important;
          object-fit: contain !important;
          margin: 0 auto !important;
          display: block !important;
          border: none !important;
        }

        .a4-sheet.compact table:has(img) td img,
        .a4-sheet.compact table.image-matrix-table td img {
          max-height: var(--fitted-table-img-h, 80px) !important;
        }

        /* High-density Lab Notebook typography: minimize dead space */
        .a4-sheet .wmde-markdown {
          font-family: inherit !important;
          line-height: 1.35 !important;
        }

        .a4-sheet .wmde-markdown p {
          margin-top: 1px !important;
          margin-bottom: 3px !important;
        }

        .a4-sheet .wmde-markdown h1,
        .a4-sheet .wmde-markdown h2,
        .a4-sheet .wmde-markdown h3,
        .a4-sheet .wmde-markdown h4 {
          margin-top: 4px !important;
          margin-bottom: 2px !important;
          padding-bottom: 1px !important;
          line-height: 1.25 !important;
        }

        .a4-sheet .wmde-markdown ul,
        .a4-sheet .wmde-markdown ol {
          margin-top: 1px !important;
          margin-bottom: 2px !important;
          padding-left: 18px !important;
        }

        .a4-sheet .wmde-markdown li {
          margin-top: 0 !important;
          margin-bottom: 1px !important;
        }

        .a4-sheet .wmde-markdown hr {
          margin: 3px 0 !important;
          border-top: 1px dashed #cbd5e1 !important;
        }

        .a4-sheet .wmde-markdown blockquote {
          margin: 2px 0 !important;
          padding: 1px 8px !important;
        }

        .a4-sheet .wmde-markdown pre {
          margin: 2px 0 !important;
          padding: 3px 6px !important;
        }

        /* GLP Lab Notebook Void-Strike Area (余白抹消線・改ざん防止) */
        .a4-sheet .void-strike-area {
          flex: 1;
          min-height: 20px;
          margin-top: 4px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 10px,
            rgba(203, 213, 225, 0.45) 10px,
            rgba(203, 213, 225, 0.45) 11px
          );
          border-top: 1px dashed #cbd5e1;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .a4-sheet .void-strike-label {
          background: #ffffff;
          padding: 1px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 9999px;
          font-size: 8px;
          font-weight: 600;
          color: #64748b;
          font-family: monospace;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @media print {
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #111827 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          body::before, body::after {
            display: none !important;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }

          /* Hide application root while printing */
          #root {
            display: none !important;
          }

          /* Hide non-print elements */
          .no-print,
          .print-modal-header,
          .print-modal-controls,
          .print-modal-footer {
            display: none !important;
          }

          /* Reset all wrapper ancestors in the portal to unconstrained static flow */
          .print-modal-overlay,
          .print-modal-container,
          .print-preview-scroll {
            background: transparent !important;
            background-color: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
            position: static !important;
            width: 210mm !important;
            max-width: none !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            overflow: visible !important;
            display: block !important;
            inset: auto !important;
            top: auto !important;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
            z-index: auto !important;
          }

          #printable-a4-pages {
            display: block !important;
            position: static !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            gap: 0 !important;
          }

          .page-wrapper {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            display: block !important;
            page-break-after: always !important;
            break-after: page !important;
          }

          .page-wrapper:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .a4-sheet {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 12mm 14mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .a4-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .print-date-badge {
            background-color: #111827 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            border: 1px solid #111827 !important;
          }

          .print-tag-badge {
            background-color: #f3f4f6 !important;
            color: #374151 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            border: 1px solid #d1d5db !important;
          }

          .print-exp-badge {
            background-color: #ecfdf5 !important;
            color: #065f46 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            border: 1px solid #a7f3d0 !important;
          }

          .print-timestamps {
            color: #4b5563 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .a4-sheet img {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .wmde-markdown {
            background-color: transparent !important;
            color: #111827 !important;
          }
          .wmde-markdown pre, .wmde-markdown code {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            border: 1px solid #cbd5e1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .wmde-markdown table th, .wmde-markdown table td {
            border-color: #cbd5e1 !important;
          }
        }
      `}</style>

      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        onLoadCapture={() => setMeasureVersion(v => v + 1)}
        style={{
          position: 'absolute',
          left: '-99999px',
          top: 0,
          width: 'calc(210mm - 28mm)',
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
        aria-hidden="true"
      >
        {allBlocks.map(block => (
          <div key={block.id} id={`measure-${block.id}`}>
            {renderBlock(block, true)}
          </div>
        ))}
      </div>

      {/* Height probe for exact printable height: 297mm - 24mm (margins) - 12mm (footer) = 261mm */}
      <div
        ref={heightProbeRef}
        style={{
          position: 'absolute',
          left: '-99999px',
          top: 0,
          height: '261mm',
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="print-modal-container bg-[#131722] border border-white/10 rounded-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-gray-100 my-auto">
        {/* Modal Header */}
        <div className="print-modal-header no-print p-3.5 sm:p-4 px-4 sm:px-6 border-b border-white/10 flex justify-between items-center bg-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg flex-shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                {t('notebook.printModal.title', '実験ノート 期間指定印刷')}
                <span className="text-[11px] font-normal text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  {t('notebook.printModal.badge', '紙ノート貼付最適化')}
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('notebook.printModal.subtitle', '余分な空白を省き、左端に日付、横にタイトル、下に内容の省スペースレイアウトで印刷します。')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="print-modal-controls no-print p-3 sm:p-4 px-4 sm:px-6 bg-[#0c0f17]/90 border-b border-white/10 flex flex-col gap-2.5 flex-shrink-0">
          {/* Top row: Date range & presets */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-300 font-medium flex-shrink-0">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('notebook.printModal.period', '期間:')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500 w-32 sm:w-36"
                />
                <span className="text-gray-500 text-xs">{t('notebook.printModal.to', '〜')}</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500 w-32 sm:w-36"
                />
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-gray-400 mr-1 hidden sm:inline">{t('notebook.printModal.presets', 'プリセット:')}</span>
              <button
                onClick={() => handlePreset('week')}
                className="text-xs px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 transition-colors"
              >
                {t('notebook.printModal.last7Days', '直近7日')}
              </button>
              <button
                onClick={() => handlePreset('this_month')}
                className="text-xs px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 transition-colors"
              >
                {t('notebook.printModal.thisMonth', '今月')}
              </button>
              <button
                onClick={() => handlePreset('last_month')}
                className="text-xs px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 transition-colors"
              >
                {t('notebook.printModal.lastMonth', '先月')}
              </button>
              <button
                onClick={() => handlePreset('all')}
                className="text-xs px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 transition-colors"
              >
                {t('notebook.printModal.all', '全期間')}
              </button>
            </div>
          </div>

          {/* Bottom row: Sort, font size, and print button */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Sort button */}
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
                title={t('notebook.printModal.sortTooltip', '日付の並び順を切り替え')}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
                <span>{sortAsc ? t('notebook.printModal.sortOldest', '古い順 (時系列)') : t('notebook.printModal.sortNewest', '新しい順')}</span>
              </button>

              {/* Font size switcher */}
              <div className="flex items-center text-xs bg-white/5 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => setFontSize('compact')}
                  className={`px-2.5 py-1 rounded ${
                    fontSize === 'compact' ? 'bg-indigo-500 text-white font-medium shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                  title={t('notebook.printModal.compactTooltip', '紙ノート貼り付け用（高密度・省スペース）')}
                >
                  {t('notebook.printModal.compact', 'コンパクト')}
                </button>
                <button
                  onClick={() => setFontSize('normal')}
                  className={`px-2.5 py-1 rounded ${
                    fontSize === 'normal' ? 'bg-indigo-500 text-white font-medium shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('notebook.printModal.normal', '標準')}
                </button>
              </div>

              {/* Void lines (GLP fraud-prevention strike lines) toggle */}
              <button
                onClick={() => setVoidLines(!voidLines)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  voidLines
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                }`}
                title={t('notebook.printModal.voidLinesTooltip', '研究不正防止：ページの余白に斜線（余白抹消線）を引き、後からの追記を防止します')}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('notebook.printModal.voidLines', '余白抹消線 (不正防止)')}</span>
              </button>

              {/* Total pages indicator */}
              {pages.length > 0 && (
                <span className="text-xs text-indigo-300 font-mono bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                  {t('notebook.printModal.totalPages', { count: pages.length })}
                </span>
              )}
            </div>

            {/* Print Execute Button */}
            <button
              onClick={handlePrint}
              disabled={targetNotes.length === 0}
              className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-500/20 disabled:opacity-50 ml-auto sm:ml-0"
            >
              <Printer className="w-4 h-4" />
              <span>{t('notebook.printModal.executePrint', { count: targetNotes.length })}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area with A4 Sheets */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 sm:p-8 bg-[#090d16] print-preview-scroll">
          {targetNotes.length === 0 ? (
            <div className="w-full max-w-4xl mx-auto bg-white text-gray-900 rounded-lg p-8 shadow-xl text-center py-16 text-gray-400 text-sm">
              {t('notebook.printModal.noNotesInRange', '指定された期間のノートは見つかりませんでした。期間を調整してください。')}
            </div>
          ) : (
            <div id="printable-a4-pages" className="flex flex-col items-center gap-8 py-2">
              {pages.map((pageBlocks, pageIdx) => (
                <div key={pageIdx} className="flex flex-col items-center page-wrapper w-full max-w-[210mm]">
                  {/* Screen-only page indicator above each sheet */}
                  <div className="text-xs text-gray-400 mb-2 font-mono flex items-center justify-between w-full px-1 no-print">
                    <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                      {t('notebook.printModal.a4Page', { current: pageIdx + 1, total: pages.length })}
                    </span>
                    <span className="text-gray-500">210 × 297 mm (A4)</span>
                  </div>

                  {/* The A4 Paper Sheet */}
                  <div
                    className={`a4-sheet ${fontSize === 'compact' ? 'compact' : 'normal'} shadow-2xl rounded-sm border border-gray-300`}
                  >
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <div className="flex-shrink-0">
                        {pageBlocks.map((block) => (
                          <div key={block.id} className="print-item-wrapper">
                            {renderBlock(block, false)}
                          </div>
                        ))}
                      </div>

                      {/* GLP Lab Notebook Void-Strike Lines across remaining empty space */}
                      {voidLines && (
                        <div className="void-strike-area">
                          <span className="void-strike-label">
                            — {t('notebook.printModal.voidSpace', '以下余白（追記・改ざん防止）')} —
                          </span>
                        </div>
                      )}
                    </div>

                    {/* A4 Sheet Footer */}
                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-[9px] text-gray-400 font-mono mt-auto flex-shrink-0">
                      <span>LabFlow - {t('notebook.title', '実験ノート')}</span>
                      <span className="font-bold text-gray-600">- {pageIdx + 1} / {pages.length} -</span>
                      <span>{todayStr}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="print-modal-footer no-print p-3 px-4 sm:px-6 bg-white/5 border-t border-white/10 flex justify-between items-center text-xs text-gray-400 flex-shrink-0">
          <span>
            {t('notebook.printModal.selectedCount', {
              count: targetNotes.length,
              start: startDate || t('notebook.printModal.beginning', '最初'),
              end: endDate || t('notebook.printModal.current', '現在')
            })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
            >
              {t('common.close', '閉じる')}
            </button>
            <button
              onClick={handlePrint}
              disabled={targetNotes.length === 0}
              className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('notebook.print', '印刷')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
