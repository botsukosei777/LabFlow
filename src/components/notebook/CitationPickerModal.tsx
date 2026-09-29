import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, BookOpen, X, Check, ExternalLink,
  ChevronDown, Filter, FileText, Sparkles
} from 'lucide-react';
import type { LiteratureItem } from '../../types';
import {
  CITATION_STYLES,
  type CitationStyleId,
  formatBibliographyItem,
  getAuthorDateLabel
} from '../../utils/citationEngine';

interface CitationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCitation: (litIds: number[]) => void;
  onInsertBibliography?: () => void;
  selectedStyle: CitationStyleId;
  onStyleChange: (styleId: CitationStyleId) => void;
  literatures: LiteratureItem[];
}

export const CitationPickerModal: React.FC<CitationPickerModalProps> = ({
  isOpen,
  onClose,
  onInsertCitation,
  onInsertBibliography,
  selectedStyle,
  onStyleChange,
  literatures
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedLitIds, setSelectedLitIds] = useState<number[]>([]);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Extract all unique keywords from literature
  const allKeywords = useMemo(() => {
    const set = new Set<string>();
    literatures.forEach(lit => {
      if (Array.isArray(lit.keywords)) {
        lit.keywords.forEach(k => {
          if (k && typeof k === 'string' && k.trim()) set.add(k.trim());
        });
      } else if (typeof (lit as any).keywords === 'string') {
        try {
          const parsed = JSON.parse((lit as any).keywords);
          if (Array.isArray(parsed)) {
            parsed.forEach(k => {
              if (k && typeof k === 'string' && k.trim()) set.add(k.trim());
            });
          }
        } catch {
          // ignore
        }
      }
    });
    return Array.from(set).sort();
  }, [literatures]);

  // Filter literature by search query and tag
  const filteredLiteratures = useMemo(() => {
    return literatures.filter(lit => {
      if (selectedTag) {
        let kws: string[] = [];
        if (Array.isArray(lit.keywords)) kws = lit.keywords;
        else if (typeof (lit as any).keywords === 'string') {
          try { kws = JSON.parse((lit as any).keywords); } catch { kws = []; }
        }
        if (!kws.some(k => k.toLowerCase() === selectedTag.toLowerCase())) {
          return false;
        }
      }

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchTitle = (lit.title || '').toLowerCase().includes(q);
      const matchAuthors = (lit.authors || '').toLowerCase().includes(q);
      const matchJournal = (lit.journal || '').toLowerCase().includes(q);
      const matchYear = String(lit.year || '').includes(q);
      const matchDoi = (lit.doi || '').toLowerCase().includes(q);
      const matchProject = (lit.project_name || '').toLowerCase().includes(q);

      return matchTitle || matchAuthors || matchJournal || matchYear || matchDoi || matchProject;
    });
  }, [literatures, searchQuery, selectedTag]);

  if (!isOpen) return null;

  const currentStyleDef = CITATION_STYLES.find(s => s.id === selectedStyle) || CITATION_STYLES[0]!;

  const handleToggleSelect = (id: number) => {
    setSelectedLitIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSingleInsert = (id: number) => {
    onInsertCitation([id]);
    onClose();
  };

  const handleBatchInsert = () => {
    if (selectedLitIds.length === 0) return;
    onInsertCitation(selectedLitIds);
    setSelectedLitIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#161b22] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-[#1a212d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <span>{t('citation.pickerTitle', '引用番号の挿入')}</span>
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {t('citation.autoRenumbering', '番号自動更新・分注対応')}
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('citation.pickerSubtitle', '登録済み文献を検索して本文に引用コードを挿入します。本文中の位置に応じて文献番号が自動連番されます。')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Style Selector Toolbar */}
        <div className="px-4 py-3 bg-[#111620] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('citation.journalStyle', '引用スタイル (生命系10ジャーナル):')}</span>
            </span>

            {/* Style Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-semibold flex items-center gap-2 transition-colors"
              >
                <span>{currentStyleDef.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200">
                  {currentStyleDef.category === 'numbered' ? t('citation.typeNumbered', '番号順') : t('citation.typeAuthorDate', '著者-出版年')}
                </span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              {showStyleMenu && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-[#1e2638] border border-white/15 rounded-xl shadow-2xl py-1 z-50 max-h-80 overflow-y-auto custom-scrollbar">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 border-b border-white/10">
                    {t('citation.selectJournalStyle', '生命科学系ジャーナルスタイルを選択')}
                  </div>
                  {CITATION_STYLES.map(style => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        onStyleChange(style.id);
                        setShowStyleMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 hover:bg-indigo-500/20 transition-colors ${
                        selectedStyle === style.id ? 'bg-indigo-500/25 border-l-2 border-indigo-400' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-200">{style.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {style.category === 'numbered' ? '[1]' : '(Author, Year)'}
                        </span>
                      </div>
                      <span className="text-[11px] text-indigo-300/90">{style.descriptionJa}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-gray-400 italic hidden sm:inline">
              — {currentStyleDef.descriptionJa}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                previewMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
              }`}
            >
              {previewMode ? t('citation.showFullList', 'リスト一覧に戻す') : t('citation.previewFootnotes', '分注プレビュー')}
            </button>

            {onInsertBibliography && (
              <button
                type="button"
                onClick={() => {
                  onInsertBibliography();
                  onClose();
                }}
                className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
                title={t('citation.insertBibTooltip', '本文末尾に現在引用されている全文献の参考文献リスト（分注）を挿入します')}
              >
                {t('citation.insertBibBtn', '本文末尾に分注リストを挿入')}
              </button>
            )}
          </div>
        </div>

        {/* Search & Tag Filter Bar */}
        <div className="p-3 bg-[#131922] border-b border-white/10 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('citation.searchPlaceholder', '文献を検索 (タイトル・著者・雑誌・発行年・DOI・プロジェクト)...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {allKeywords.length > 0 && (
            <div className="sm:w-56">
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-300 outline-none focus:border-indigo-500"
              >
                <option value="">{t('citation.allKeywords', 'すべてのキーワード/タグ')}</option>
                {allKeywords.map(kw => (
                  <option key={kw} value={kw}>#{kw}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Literature List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2.5 bg-[#0d1117]">
          {literatures.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium text-gray-400">
                {t('citation.noLiteratureFound', '文献がまだ登録されていません')}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {t('citation.noLiteratureGuide', 'サイドバーの「文献管理」から文献を登録すると、ここに引用候補として表示されます。')}
              </p>
            </div>
          ) : filteredLiteratures.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <Filter className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{t('citation.noMatchingLiterature', '条件に一致する文献が見つかりませんでした')}</p>
            </div>
          ) : (
            filteredLiteratures.map((lit, index) => {
              const isSelected = selectedLitIds.includes(lit.id);
              const formattedBib = formatBibliographyItem(index + 1, lit, selectedStyle);
              const inTextLabel = currentStyleDef.category === 'author_date'
                ? `(${getAuthorDateLabel(lit.authors, lit.year)})`
                : currentStyleDef.id === 'nature'
                ? `[${index + 1}]`
                : `(${index + 1})`;

              return (
                <div
                  key={lit.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-500/15 border-indigo-500/50 shadow-md'
                      : 'bg-[#161b22] border-white/5 hover:border-white/15 hover:bg-[#1a212d]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(lit.id)}
                        className="mt-1 rounded border-white/20 text-indigo-500 focus:ring-indigo-400"
                        title={t('citation.selectCheckbox', 'まとめて挿入用に選択')}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-gray-100 hover:text-indigo-300 leading-snug">
                            {lit.title}
                          </h4>
                          {lit.year && (
                            <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-white/10 text-gray-300">
                              {lit.year}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-gray-300">{lit.authors || t('common.unknownAuthor', '著者不明')}</span>
                          {lit.journal && <span className="italic text-gray-400">• {lit.journal}</span>}
                          {lit.volume && <span className="font-semibold text-gray-400">{lit.volume}</span>}
                          {lit.pages && <span className="text-gray-400">pp. {lit.pages}</span>}
                        </div>

                        {/* Citation Style Live Preview Box */}
                        <div className="mt-2 p-2 rounded-lg bg-black/30 border border-white/5 text-[11px] text-gray-300">
                          <div className="flex items-center gap-2 mb-1 text-[10px] text-gray-400">
                            <span className="font-semibold text-indigo-400 uppercase tracking-wider">{currentStyleDef.name} 形式プレビュー:</span>
                            <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                              本文表記: {inTextLabel}
                            </span>
                          </div>
                          <div
                            className="font-serif leading-relaxed text-gray-200"
                            dangerouslySetInnerHTML={{ __html: formattedBib.html }}
                          />
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {lit.project_name && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              📁 {lit.project_name}
                            </span>
                          )}
                          {lit.doi && (
                            <a
                              href={`https://doi.org/${lit.doi}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1 hover:underline"
                            >
                              DOI: {lit.doi}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          {lit.pdf_path && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                              <FileText className="w-2.5 h-2.5" />
                              PDF
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                      <button
                        type="button"
                        onClick={() => handleSingleInsert(lit.id)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all"
                        title={t('citation.insertThisCitation', 'この文献の引用タグ [@lit:{{id}}] をカーソル位置に挿入', { id: lit.id })}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('citation.insertCitationBtn', '引用番号の挿入')}</span>
                      </button>
                      <span className="text-[10px] font-mono text-gray-500">
                        [@lit:{lit.id}]
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#1a212d] border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            {selectedLitIds.length > 0 ? (
              <span className="text-indigo-300 font-medium">
                {t('citation.selectedCount', '{{count}} 件選択中', { count: selectedLitIds.length })}
              </span>
            ) : (
              <span>{t('citation.hintHowItWorks', '💡 本文中に [@lit:ID] を挿入すると、上から出現順に自動で1, 2, 3...と連番され、分注リストに文献詳細が同期されます。')}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
            >
              {t('common.close', '閉じる')}
            </button>
            {selectedLitIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchInsert}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{t('citation.insertSelectedGroup', '選択した{{count}}件をまとめて引用挿入', { count: selectedLitIds.length })}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
