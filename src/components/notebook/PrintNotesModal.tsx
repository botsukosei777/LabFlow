import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, X, Calendar, ArrowUpDown, Scissors } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import MDEditor from '@uiw/react-md-editor';

interface Note {
  id: number;
  title: string;
  content: string;
  date: string;
  scheduled_experiment_id?: number | null;
  tags?: string;
  updated_at: string;
}

interface PrintNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
}

const parseTags = (tagsStr?: string) => {
  if (!tagsStr) return [];
  try { return JSON.parse(tagsStr); } catch (e) { return []; }
};

export const PrintNotesModal: React.FC<PrintNotesModalProps> = ({
  isOpen,
  onClose,
  notes,
}) => {
  const { t } = useTranslation();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [sortAsc, setSortAsc] = useState<boolean>(true); // デフォルトは時系列貼り付けしやすい昇順
  const [fontSize, setFontSize] = useState<'compact' | 'normal'>('compact');

  // クイック選択プリセット
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

  // フィルタリング & ソート
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

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      className="print-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* 印刷用CSSの埋め込み */}
      <style>{`
        @media print {
          /* 1. ページ全体・html・bodyの背景を純白(#ffffff)に強制 */
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #111827 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          /* 2. bodyの暗い背景グラデーション等の擬似要素を完全無効化 */
          body::before, body::after {
            display: none !important;
            content: none !important;
            background: none !important;
          }

          /* 3. 印刷ページの余白指定 */
          @page {
            margin: 8mm;
            size: auto;
          }

          /* 4. アプリ構造要素やモーダルオーバーレイの暗い背景・固定配置を完全に解除して白背景化 */
          #root, .app-layout, .app-main, .app-content, .print-modal-overlay {
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            border: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            overflow: visible !important;
          }

          /* 5. 画面上の全通常要素（ヘッダー・サイドバー・設定モーダル等）を非表示 */
          .no-print, .sidebar, header {
            display: none !important;
          }

          body * {
            visibility: hidden;
          }

          #printable-notes-area, #printable-notes-area * {
            visibility: visible;
          }

          #printable-notes-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #111827 !important;
            display: block !important;
          }

          /* 6. 日付バッジ「だけ」を黒背景白文字としてピンポイントで印刷強制 */
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

          /* 7. ノートブロックの改ページ制御と白背景 */
          .print-note-block {
            break-inside: avoid;
            page-break-inside: avoid;
            background: #ffffff !important;
            background-color: #ffffff !important;
            border-color: #94a3b8 !important;
            box-shadow: none !important;
          }

          /* Markdownの文字色・背景リセット */
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

      {/* モーダルコンテナ */}
      <div className="bg-[#131722] border border-white/10 rounded-2xl w-full max-w-5xl h-[90vh] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-gray-100 no-print my-auto">
        {/* モーダルヘッダー */}
        <div className="p-3.5 sm:p-4 px-4 sm:px-6 border-b border-white/10 flex justify-between items-center bg-white/5 flex-shrink-0">
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

        {/* コントロールバー（印刷設定エリア） */}
        <div className="p-3 sm:p-4 px-4 sm:px-6 bg-[#0c0f17]/90 border-b border-white/10 flex flex-col gap-2.5 flex-shrink-0">
          {/* 上段: 期間指定 & クイックプリセット */}
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

            {/* クイックプリセット */}
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

          {/* 下段: 表示設定（並び替え・文字サイズ） & 印刷ボタン */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* ソート */}
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
                title={t('notebook.printModal.sortTooltip', '日付の並び順を切り替え')}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
                <span>{sortAsc ? t('notebook.printModal.sortOldest', '古い順 (時系列)') : t('notebook.printModal.sortNewest', '新しい順')}</span>
              </button>

              {/* フォントサイズ・密度切り替え */}
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
            </div>

            {/* 印刷ボタン */}
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

        {/* プレビュー表示エリア（全内容を縦スクロール可能） */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 bg-slate-900/50 print-preview-scroll">
          <div className="w-full max-w-4xl mx-auto bg-white text-gray-900 rounded-lg p-4 sm:p-6 shadow-xl min-h-[200px] h-fit">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('notebook.printModal.preview', '印刷プレビュー')}
                </span>
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                  {t('notebook.printModal.notesCount', { count: targetNotes.length })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Scissors className="w-3.5 h-3.5" />
                <span>{t('notebook.printModal.scissorsNotice', '点線は切り取り線として機能します')}</span>
              </div>
            </div>

            {targetNotes.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {t('notebook.printModal.noNotesInRange', '指定された期間のノートは見つかりませんでした。期間を調整してください。')}
              </div>
            ) : (
              <div className="flex flex-col">
                {targetNotes.map((note, index) => {
                  const tags = parseTags(note.tags);
                  const isCompact = fontSize === 'compact';

                  return (
                    <div
                      key={note.id}
                      className={`print-note-block pb-3 pt-3 first:pt-0 ${
                        index !== targetNotes.length - 1 ? 'border-b-2 border-dashed border-gray-300' : ''
                      }`}
                    >
                      {/* 上部: 左端に日付、その横にタイトル・タグ */}
                      <div className="flex items-start gap-2.5 mb-1.5">
                        {/* 左端 日付バッジ（幅固定・黒背景白文字） */}
                        <div className="flex-shrink-0 w-[90px] px-2 py-0.5 bg-gray-900 text-white rounded text-center text-xs font-bold font-mono tracking-tight leading-tight border border-gray-900">
                          {note.date}
                        </div>

                        {/* タイトルとタグ・実験情報 */}
                        <div className="flex-1 flex flex-wrap items-baseline gap-2 min-w-0">
                          <h3
                            className={`font-bold text-gray-900 tracking-tight leading-tight break-words ${
                              isCompact ? 'text-sm' : 'text-base'
                            }`}
                          >
                            {note.title}
                          </h3>

                          {/* タグ表示 */}
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {tags.map((t: string, i: number) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 border border-gray-300 font-medium"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* 関連実験 */}
                          {note.scheduled_experiment_id && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-medium">
                              {t('notebook.hasRelatedExperiment', '関連実験あり')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* その下に内容（Markdown） */}
                      <div
                        className={`pl-1 pr-1 text-gray-800 leading-relaxed overflow-hidden break-words ${
                          isCompact ? 'text-[11px] prose-compact' : 'text-xs'
                        }`}
                        data-color-mode="light"
                        style={{
                          lineHeight: isCompact ? '1.38' : '1.5',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        <MDEditor.Markdown
                          source={note.content || t('notebook.emptyContent', '*本文なし*')}
                          style={{
                            backgroundColor: 'transparent',
                            color: '#1f2937',
                            fontSize: isCompact ? '11px' : '12px',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="p-3 px-4 sm:px-6 bg-white/5 border-t border-white/10 flex justify-between items-center text-xs text-gray-400 flex-shrink-0">
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

      {/* 印刷専用エリア（普段は不可視、window.print() 時に #printable-notes-area が描画される） */}
      <div id="printable-notes-area" className="hidden print:block text-black bg-white">
        {targetNotes.map((note, index) => {
          const tags = parseTags(note.tags);
          const isCompact = fontSize === 'compact';

          return (
            <div
              key={`print-${note.id}`}
              className={`print-note-block pb-2 pt-2 first:pt-0 ${
                index !== targetNotes.length - 1 ? 'border-b border-dashed border-gray-400' : ''
              }`}
              style={{
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                marginBottom: '4px',
              }}
            >
              {/* 上部: 左端日付 + 横にタイトル */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  marginBottom: '2px',
                }}
              >
                {/* 左端 日付（印刷時も黒背景白文字を完全保持） */}
                <div
                  className="print-date-badge"
                  style={{
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                    flexShrink: 0,
                    width: '85px',
                    padding: '2.5px 4px',
                    backgroundColor: '#111827',
                    color: '#ffffff',
                    borderRadius: '3px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    letterSpacing: '-0.02em',
                    border: '1px solid #111827',
                  }}
                >
                  {note.date}
                </div>

                {/* タイトルとタグ */}
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px' }}>
                  <span
                    style={{
                      fontWeight: 'bold',
                      fontSize: isCompact ? '12px' : '13px',
                      color: '#111827',
                      lineHeight: '1.2',
                    }}
                  >
                    {note.title}
                  </span>
                  {tags.map((t: string, i: number) => (
                    <span
                      key={i}
                      className="print-tag-badge"
                      style={{
                        fontSize: '9px',
                        padding: '1px 4px',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '2px',
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                  {note.scheduled_experiment_id && (
                    <span
                      className="print-exp-badge"
                      style={{
                        fontSize: '9px',
                        padding: '1px 4px',
                        backgroundColor: '#ecfdf5',
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                        borderRadius: '2px',
                      }}
                    >
                      {t('notebook.hasRelatedExperiment', '関連実験あり')}
                    </span>
                  )}
                </div>
              </div>

              {/* 下部: 本文 (Markdown) */}
              <div
                style={{
                  fontSize: isCompact ? '10.5px' : '11.5px',
                  lineHeight: isCompact ? '1.35' : '1.45',
                  color: '#1f2937',
                  paddingLeft: '2px',
                }}
                data-color-mode="light"
              >
                <MDEditor.Markdown
                  source={note.content || t('notebook.emptyContent', '*本文なし*')}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#111827',
                    fontSize: isCompact ? '10.5px' : '11.5px',
                    lineHeight: isCompact ? '1.35' : '1.45',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
