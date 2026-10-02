import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Search,
  Check,
  X,
  FileText,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { api } from '../../api/client';
import type { LiteratureItem, Milestone, PriorityTier } from '../../types';
import { PRIORITY_ORDER, PRIORITY_CONFIG } from '../../pages/Milestones';

interface LiteratureTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestones: Milestone[];
  defaultMilestoneId?: number | 'standalone';
  defaultPriority?: PriorityTier;
  onSuccess: (message?: string) => void;
}

export const LiteratureTaskModal: React.FC<LiteratureTaskModalProps> = ({
  isOpen,
  onClose,
  milestones,
  defaultMilestoneId = 'standalone',
  defaultPriority = 'NEXT',
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [literatures, setLiteratures] = useState<LiteratureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read_abstract' | 'read_body'>('all');
  
  // Selection
  const [selectedLitIds, setSelectedLitIds] = useState<number[]>([]);
  const [targetMilestoneId, setTargetMilestoneId] = useState<number | 'standalone'>(defaultMilestoneId);
  const [priority, setPriority] = useState<PriorityTier>(defaultPriority);
  const [taskType, setTaskType] = useState<'body' | 'abstract' | 'general' | 'custom'>('body');
  const [customTitle, setCustomTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      setTargetMilestoneId(defaultMilestoneId);
      setPriority(defaultPriority);
      setSelectedLitIds([]);
      setSearch('');
      setReadFilter('all');
      setTaskType('body');
      setCustomTitle('');
      fetchLiteratures();
    }
  }, [isOpen, defaultMilestoneId, defaultPriority]);

  const fetchLiteratures = async () => {
    setLoading(true);
    try {
      const data = await api.get<LiteratureItem[]>('/literature');
      setLiteratures(data || []);
    } catch (err) {
      console.error('Failed to load literatures:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter literatures
  const filteredLiteratures = useMemo(() => {
    return literatures.filter(lit => {
      // Read status filter
      if (readFilter === 'unread' && (lit.read_body || lit.read_abstract)) return false;
      if (readFilter === 'read_abstract' && !lit.read_abstract) return false;
      if (readFilter === 'read_body' && !lit.read_body) return false;

      // Search keyword filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const titleMatch = lit.title?.toLowerCase().includes(q);
        const authorMatch = lit.authors?.toLowerCase().includes(q);
        const journalMatch = lit.journal?.toLowerCase().includes(q);
        const doiMatch = lit.doi?.toLowerCase().includes(q);
        const tagMatch = Array.isArray(lit.keywords) && lit.keywords.some(k => k.toLowerCase().includes(q));
        if (!titleMatch && !authorMatch && !journalMatch && !doiMatch && !tagMatch) return false;
      }

      return true;
    });
  }, [literatures, search, readFilter]);

  const handleToggleSelect = (id: number) => {
    setSelectedLitIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredLiteratures.map(l => l.id);
    const areAllSelected = allFilteredIds.every(id => selectedLitIds.includes(id));
    if (areAllSelected) {
      setSelectedLitIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedLitIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleSubmit = async () => {
    if (selectedLitIds.length === 0) return;
    setIsSubmitting(true);
    try {
      if (selectedLitIds.length === 1 && taskType === 'custom' && customTitle.trim()) {
        // Single custom title
        await api.post('/milestones/items', {
          milestone_id: targetMilestoneId,
          name: customTitle.trim(),
          data_type: 'task',
          target_count: 1,
          unit: '',
          priority,
          literature_id: selectedLitIds[0]
        });
      } else {
        // Standard batch or single from literature endpoint
        await api.post('/milestones/items/from-literature', {
          milestone_id: targetMilestoneId,
          literature_ids: selectedLitIds,
          task_type: taskType === 'abstract' ? 'abstract' : 'body',
          priority
        });
      }
      onSuccess(t('milestones.literatureTaskCreated', { count: selectedLitIds.length, defaultValue: `${selectedLitIds.length}件の論文読了タスクを追加しました` }));
      onClose();
    } catch (err: any) {
      console.error('Failed to create literature tasks:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal modal-lg bg-[#131722] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl text-gray-100 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header p-4 px-6 border-b border-white/10 flex justify-between items-center bg-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="modal-title text-base sm:text-lg font-bold text-white flex items-center gap-2">
                {t('milestones.addLiteratureTask', '文献管理の論文を読むタスクを追加')}
                <span className="text-[11px] font-normal text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  {t('milestones.literatureSync', '文献管理連携')}
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('milestones.addLiteratureTaskDesc', '文献管理に登録されている論文を選択し、マイルストーンや独立タスクに読了目標として追加します。')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body p-6 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
          {/* Target Milestone & Priority Configuration */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Milestone */}
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                {t('milestones.targetMilestone', '追加先マイルストーン')}
              </label>
              <select
                className="form-select text-xs w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                value={targetMilestoneId}
                onChange={e => {
                  const val = e.target.value;
                  setTargetMilestoneId(val === 'standalone' ? 'standalone' : Number(val));
                }}
              >
                <option value="standalone">📌 {t('milestones.standaloneTasks', '独立タスク（特定目標なし）')}</option>
                {milestones.filter(m => !m.is_standalone && m.name !== '独立タスク').map(m => (
                  <option key={m.id} value={m.id}>🎯 {m.name}</option>
                ))}
              </select>
            </div>

            {/* Task Type / Prefix */}
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                {t('milestones.readingTaskType', 'タスクの目標種別')}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTaskType('body')}
                  className={`text-xs py-1.5 px-2 rounded-lg border text-center transition-all ${
                    taskType === 'body'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  【論文精読】
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType('abstract')}
                  className={`text-xs py-1.5 px-2 rounded-lg border text-center transition-all ${
                    taskType === 'abstract'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  【要旨確認】
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType('general')}
                  className={`text-xs py-1.5 px-2 rounded-lg border text-center transition-all ${
                    taskType === 'general'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  【論文読了】
                </button>
              </div>
            </div>

            {/* Priority Tier Selection */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                {t('milestones.priority', '優先度ティア')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {PRIORITY_ORDER.map(tier => {
                  const cfg = PRIORITY_CONFIG[tier];
                  const TierIcon = cfg.icon;
                  const isSelected = priority === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setPriority(tier)}
                      className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 ${
                        isSelected ? 'ring-2 ring-indigo-500 font-bold scale-[1.01]' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: isSelected ? `${cfg.accent}20` : 'rgba(255,255,255,0.03)',
                        borderColor: isSelected ? cfg.accent : 'rgba(255,255,255,0.1)',
                        color: cfg.color
                      }}
                    >
                      <TierIcon size={15} />
                      <span className="text-[11px]">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('milestones.searchLiteraturePlaceholder', '論文タイトル、著者名、雑誌名、キーワードで検索...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Read status filter pills */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setReadFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  readFilter === 'all' ? 'bg-indigo-500 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('common.all', 'すべて')} ({literatures.length})
              </button>
              <button
                type="button"
                onClick={() => setReadFilter('unread')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  readFilter === 'unread' ? 'bg-amber-500 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('literature.unread', '未読')} ({literatures.filter(l => !l.read_body && !l.read_abstract).length})
              </button>
              <button
                type="button"
                onClick={() => setReadFilter('read_abstract')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  readFilter === 'read_abstract' ? 'bg-blue-500 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('literature.readAbstract', '要旨読了')}
              </button>
            </div>
          </div>

          {/* Quick select all & selected count */}
          <div className="flex items-center justify-between text-xs text-gray-400 px-1">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              {filteredLiteratures.every(l => selectedLitIds.includes(l.id)) && filteredLiteratures.length > 0
                ? t('milestones.deselectAll', '表示中の選択をすべて解除')
                : t('milestones.selectAll', '表示中の論文をすべて選択')}
            </button>
            <span>
              {t('milestones.selectedCount', { count: selectedLitIds.length, defaultValue: `${selectedLitIds.length}件 選択中` })}
            </span>
          </div>

          {/* Paper List */}
          <div className="flex-1 min-h-[240px] max-h-[360px] overflow-y-auto border border-white/10 rounded-xl bg-black/30 divide-y divide-white/5">
            {loading ? (
              <div className="py-12 text-center text-xs text-gray-400">
                {t('common.loading', '読み込み中...')}
              </div>
            ) : filteredLiteratures.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 px-4">
                {search || readFilter !== 'all'
                  ? t('milestones.noLiteratureMatched', '条件に一致する論文は見つかりませんでした。')
                  : t('milestones.noLiteratureRegistered', '文献管理に論文が登録されていません。文献管理ページから論文を登録してください。')}
              </div>
            ) : (
              filteredLiteratures.map(lit => {
                const isSelected = selectedLitIds.includes(lit.id);
                return (
                  <div
                    key={lit.id}
                    onClick={() => handleToggleSelect(lit.id)}
                    className={`p-3.5 transition-all cursor-pointer flex items-start gap-3 hover:bg-white/5 ${
                      isSelected ? 'bg-indigo-500/10 border-l-4 border-l-indigo-500' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'bg-indigo-500 border-indigo-500 text-white'
                          : 'border-white/20 bg-white/5 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>

                    {/* Paper Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-1">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-100 leading-snug break-words">
                          {lit.title}
                        </h4>
                      </div>

                      <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                        {lit.authors && (
                          <span className="truncate max-w-[240px] text-gray-300">
                            {lit.authors}
                          </span>
                        )}
                        {lit.journal && (
                          <span className="italic text-indigo-300">
                            {lit.journal}
                          </span>
                        )}
                        {lit.year && (
                          <span className="font-mono text-gray-400">
                            ({lit.year})
                          </span>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px]">
                        {lit.read_body ? (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> 本文読了
                          </span>
                        ) : lit.read_abstract ? (
                          <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> 要旨読了
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            未読
                          </span>
                        )}

                        {lit.pdf_filename && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5" /> PDFあり
                          </span>
                        )}

                        {lit.project_name && (
                          <span className="px-1.5 py-0.2 rounded bg-white/10 text-gray-300">
                            {lit.project_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer p-4 px-6 bg-white/5 border-t border-white/10 flex justify-between items-center flex-shrink-0">
          <span className="text-xs text-gray-400">
            {selectedLitIds.length > 0
              ? `${selectedLitIds.length} 件の論文を選択中`
              : '論文を選択してください'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary text-xs py-2 px-4 rounded-xl"
            >
              {t('common.cancel', 'キャンセル')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedLitIds.length === 0 || isSubmitting}
              className="btn btn-primary text-xs py-2 px-5 rounded-xl flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-indigo-500/20"
            >
              <BookOpen className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? t('common.loading', '処理中...')
                  : t('milestones.createLiteratureTaskBtn', { count: selectedLitIds.length, defaultValue: `タスクを作成 (${selectedLitIds.length})` })}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
