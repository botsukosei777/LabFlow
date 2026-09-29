import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Target, Search, X, Check, Calendar, CheckSquare, ListTree,
  CheckCircle2, ChevronRight, ChevronDown, Layers, CornerDownRight
} from 'lucide-react';
import { api } from '../../api/client';
import type { Milestone, MilestoneItem, MilestoneSubItem, PriorityTier } from '../../types';

export type MilestoneLinkType = 'milestone' | 'task' | 'subtask';

export interface MilestoneLinkSelection {
  type: MilestoneLinkType;
  title: string;
  url: string;
  markdown: string;
  milestone: Milestone;
  item?: MilestoneItem;
  subItem?: MilestoneSubItem;
}

interface MilestonePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMilestone?: (milestone: Milestone) => void;
  onSelectLink?: (selection: MilestoneLinkSelection) => void;
}

export const MilestonePickerModal: React.FC<MilestonePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectMilestone,
  onSelectLink
}) => {
  const { t } = useTranslation();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [typeFilter, setTypeFilter] = useState<'all' | 'milestone' | 'task' | 'subtask'>('all');
  const [expandedMsIds, setExpandedMsIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    const fetchMilestones = async () => {
      setLoading(true);
      try {
        const query = statusFilter === 'all' ? '' : '?status=active';
        const data = await api.get<Milestone[]>(`/milestones${query}`);
        const loaded = data || [];
        setMilestones(loaded);
        // Default expand all milestones so tasks are immediately accessible
        setExpandedMsIds(new Set(loaded.map(m => m.id)));
      } catch (err) {
        console.error('Failed to load milestones:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMilestones();
  }, [isOpen, statusFilter]);

  const toggleExpand = (id: number) => {
    setExpandedMsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedMsIds(new Set(milestones.map(m => m.id)));
  const collapseAll = () => setExpandedMsIds(new Set());

  // Filter logic across milestones, tasks, and subtasks
  const filteredMilestones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return milestones.map(ms => {
      const msMatches = !q || (ms.name || '').toLowerCase().includes(q) || (ms.description || '').toLowerCase().includes(q);

      // Filter items
      const matchingItems = (ms.items || []).map(item => {
        const itemMatches = !q || item.name.toLowerCase().includes(q);

        // Filter sub-items
        const matchingSubItems = (item.sub_items || []).filter(sub => {
          if (!q) return true;
          return sub.name.toLowerCase().includes(q);
        });

        const subMatchesCount = matchingSubItems.length;
        const keepItem = itemMatches || subMatchesCount > 0 || (msMatches && !q);

        return {
          item,
          matches: itemMatches,
          matchingSubItems,
          keep: keepItem
        };
      }).filter(res => res.keep);

      const hasMatchingItems = matchingItems.length > 0;
      const keepMilestone = msMatches || hasMatchingItems;

      return {
        milestone: ms,
        matches: msMatches,
        itemsResult: matchingItems,
        keep: keepMilestone
      };
    }).filter(res => res.keep);
  }, [milestones, searchQuery]);

  // When search query changes, expand milestones that have matches
  useEffect(() => {
    if (searchQuery.trim()) {
      const ids = new Set<number>();
      filteredMilestones.forEach(f => ids.add(f.milestone.id));
      setExpandedMsIds(ids);
    }
  }, [searchQuery, filteredMilestones]);

  const handleChoose = (selection: MilestoneLinkSelection) => {
    if (onSelectLink) {
      onSelectLink(selection);
    } else if (onSelectMilestone) {
      onSelectMilestone(selection.milestone);
    }
    onClose();
  };

  const handleChooseMilestone = (ms: Milestone) => {
    handleChoose({
      type: 'milestone',
      title: ms.name,
      url: `/milestones?id=${ms.id}`,
      markdown: `[🎯 ${ms.name}](/milestones?id=${ms.id})`,
      milestone: ms
    });
  };

  const handleChooseTask = (ms: Milestone, item: MilestoneItem) => {
    handleChoose({
      type: 'task',
      title: item.name,
      url: `/milestones?milestoneId=${ms.id}&itemId=${item.id}`,
      markdown: `[📋 ${item.name}](/milestones?milestoneId=${ms.id}&itemId=${item.id})`,
      milestone: ms,
      item
    });
  };

  const handleChooseSubtask = (ms: Milestone, item: MilestoneItem, sub: MilestoneSubItem) => {
    handleChoose({
      type: 'subtask',
      title: sub.name,
      url: `/milestones?milestoneId=${ms.id}&itemId=${item.id}&subItemId=${sub.id}`,
      markdown: `[🔹 ${sub.name}](/milestones?milestoneId=${ms.id}&itemId=${item.id}&subItemId=${sub.id})`,
      milestone: ms,
      item,
      subItem: sub
    });
  };

  const getPriorityBadge = (priority?: PriorityTier) => {
    switch (priority) {
      case 'NOW':
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">NOW</span>;
      case 'NEXT':
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">NEXT</span>;
      case 'LATER':
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">LATER</span>;
      case 'IDEAS':
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">IDEAS</span>;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-50 p-4 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-[#151b28] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#192233]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30 shadow-inner">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <span>{t('notebook.milestonePickerTitle', 'マイルストーンリンクの挿入')}</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {t('notebook.milestonePickerBadge', 'マイルストーン・タスク・サブタスク')}
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('notebook.milestonePickerSubtitle', 'ノート内に挿入したいマイルストーン、各タスク、またはサブタスクを選択してください。クリック時に自動保存して該当箇所へジャンプします。')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 bg-[#121824] border-b border-white/10 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('notebook.milestoneSearchPlaceholder', 'マイルストーン名、タスク、サブタスクを検索...')}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500 transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-white text-xs"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-black/30 p-1 rounded-lg border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-purple-600 text-white font-medium shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('common.active', '進行中のみ')}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-purple-600 text-white font-medium shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('common.all', 'すべて')}
              </button>
            </div>
          </div>

          {/* Type Filter & Expand/Collapse All */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-2 py-1 rounded transition-colors ${
                  typeFilter === 'all' ? 'bg-white/15 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('notebook.filterAll', 'すべて表示')}
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('milestone')}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  typeFilter === 'milestone' ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🎯</span>
                <span>{t('notebook.filterMilestones', 'マイルストーン')}</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('task')}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  typeFilter === 'task' ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>📋</span>
                <span>{t('notebook.filterTasks', 'タスク')}</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('subtask')}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  typeFilter === 'subtask' ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🔹</span>
                <span>{t('notebook.filterSubtasks', 'サブタスク')}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <button
                type="button"
                onClick={expandAll}
                className="hover:text-purple-300 transition-colors"
              >
                {t('common.expandAll', 'すべて展開')}
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="hover:text-purple-300 transition-colors"
              >
                {t('common.collapseAll', 'すべて折りたたみ')}
              </button>
            </div>
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span>{t('common.loading', '読み込み中...')}</span>
            </div>
          ) : filteredMilestones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Target className="w-12 h-12 text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-300">
                {t('notebook.noMilestonesFound', 'マイルストーンが見つかりませんでした')}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                {t('notebook.noMilestonesHint', 'サイドバーの「マイルストーン」から目標やタスクを登録すると、ここにリンク候補として表示されます。')}
              </p>
            </div>
          ) : (
            filteredMilestones.map(({ milestone: ms, itemsResult }) => {
              const isExpanded = expandedMsIds.has(ms.id);
              const items = ms.items || [];
              const completedCount = items.filter(it => it.is_completed).length;
              const totalCount = items.length;
              const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
              const isStandalone = !!ms.is_standalone || ms.name === '独立タスク';

              // Filter items according to typeFilter
              const visibleItems = itemsResult.filter(res => {
                if (typeFilter === 'milestone') return false;
                if (typeFilter === 'subtask') return res.matchingSubItems.length > 0;
                return true;
              });

              const showMilestoneHeader = typeFilter !== 'task' && typeFilter !== 'subtask';

              return (
                <div
                  key={ms.id}
                  className="rounded-xl bg-white/[0.02] border border-white/10 hover:border-purple-500/40 transition-all overflow-hidden flex flex-col"
                >
                  {/* Milestone Card Header */}
                  <div className="p-3.5 flex items-center justify-between gap-3 bg-white/[0.02] border-b border-white/5">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {totalCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(ms.id)}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors mt-0.5 flex-shrink-0"
                          title={isExpanded ? '折りたたむ' : '展開する'}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      ) : (
                        <div className="w-6 flex-shrink-0" />
                      )}

                      <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 flex-shrink-0">
                        {isStandalone ? <Layers className="w-4 h-4 text-indigo-400" /> : <Target className="w-4 h-4 text-purple-400" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-100">
                            {ms.name}
                          </span>
                          {isStandalone ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {t('milestones.standaloneTag', '独立タスク')}
                            </span>
                          ) : ms.deadline ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-purple-400" />
                              <span>{ms.deadline}</span>
                            </span>
                          ) : null}
                          {ms.status === 'completed' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {t('common.completed', '完了')}
                            </span>
                          )}
                        </div>

                        {ms.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                            {ms.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                          <span>
                            {t('milestones.tasksCount', '{{count}} 件のタスク', { count: totalCount })}
                          </span>
                          {totalCount > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full transition-all"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="font-mono text-gray-400">{percent}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Milestone Link Insert Button */}
                    <button
                      type="button"
                      onClick={() => handleChooseMilestone(ms)}
                      className="px-2.5 py-1.5 rounded-lg bg-purple-600/90 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all flex-shrink-0"
                      title={t('notebook.insertThisMilestoneLink', 'このマイルストーンへのリンクを挿入')}
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>{t('notebook.insertMilestoneLink', 'マイルストーン')}</span>
                    </button>
                  </div>

                  {/* Tasks and Subtasks (when expanded or when filtered by task/subtask) */}
                  {(isExpanded || typeFilter === 'task' || typeFilter === 'subtask') && visibleItems.length > 0 && (
                    <div className="p-3 pl-8 sm:pl-10 space-y-2 bg-black/20 border-t border-white/5">
                      {visibleItems.map(({ item, matchingSubItems }) => {
                        const showTaskRow = typeFilter !== 'subtask';
                        const visibleSubItems = typeFilter === 'task' ? [] : matchingSubItems;

                        return (
                          <div key={item.id} className="space-y-1.5">
                            {/* Task Row */}
                            {showTaskRow && (
                              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10 hover:border-purple-400/40 hover:bg-white/[0.06] transition-all flex items-center justify-between gap-3 group">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="p-1 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 flex-shrink-0">
                                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-xs font-semibold ${item.is_completed ? 'line-through text-gray-500' : 'text-gray-200'} group-hover:text-indigo-200 transition-colors`}>
                                        {item.name}
                                      </span>
                                      {getPriorityBadge(item.priority)}
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-gray-400 font-mono">
                                        {item.data_type === 'quantitative' ? `${item.current_count}/${item.target_count}${item.unit ? ` ${item.unit}` : ''}` : item.data_type === 'task' ? 'タスク' : '定性'}
                                      </span>
                                      {item.is_completed && (
                                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>完了</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleChooseTask(ms, item)}
                                  className="px-2.5 py-1 rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all flex-shrink-0"
                                  title={t('notebook.insertTaskTooltip', 'このタスクへのリンクを挿入')}
                                >
                                  <CheckSquare className="w-3 h-3" />
                                  <span>{t('notebook.insertTaskLink', 'タスク')}</span>
                                </button>
                              </div>
                            )}

                            {/* Subtask Rows */}
                            {visibleSubItems.length > 0 && (
                              <div className="pl-6 space-y-1.5 border-l-2 border-indigo-500/20 ml-3">
                                {visibleSubItems.map(sub => (
                                  <div
                                    key={sub.id}
                                    className="p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-indigo-400/40 hover:bg-white/[0.05] transition-all flex items-center justify-between gap-3 group"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <CornerDownRight className="w-3 h-3 text-indigo-400/60 flex-shrink-0" />
                                      <div className="p-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 flex-shrink-0">
                                        <ListTree className="w-3 h-3 text-purple-400" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`text-xs ${sub.is_completed ? 'line-through text-gray-500' : 'text-gray-300'} group-hover:text-purple-200 transition-colors`}>
                                            {sub.name}
                                          </span>
                                          {getPriorityBadge(sub.priority)}
                                          {sub.is_completed && (
                                            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                              <CheckCircle2 className="w-3 h-3" />
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleChooseSubtask(ms, item, sub)}
                                      className="px-2 py-1 rounded bg-purple-600/70 hover:bg-purple-500 text-white text-[11px] font-medium flex items-center gap-1 shadow-sm transition-all flex-shrink-0"
                                      title={t('notebook.insertSubtaskTooltip', 'このサブタスクへのリンクを挿入')}
                                    >
                                      <ListTree className="w-3 h-3" />
                                      <span>{t('notebook.insertSubtaskLink', 'サブタスク')}</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#121824] border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5 text-[11px] truncate mr-2">
            <span>💡</span>
            <span>{t('notebook.milestoneLinkHintExtended', '挿入形式: [🎯 マイルストーン](/milestones?id=ID) / [📋 タスク](/milestones?milestoneId=ID&itemId=ID) / [🔹 サブタスク](/milestones?milestoneId=ID&itemId=ID&subItemId=ID)')}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors flex-shrink-0"
          >
            {t('common.close', '閉じる')}
          </button>
        </div>
      </div>
    </div>
  );
};
