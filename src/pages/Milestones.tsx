import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Target, Plus, Trash2, Edit, ChevronDown, ChevronUp, CheckCircle2,
  MinusCircle, Share2, Download, RefreshCw, Unlink, Flame, Zap, Clock,
  Lightbulb, ArrowUp, ArrowDown, Layers, ListFilter, Search,
  ChevronRight, Tag, HelpCircle
} from 'lucide-react';
import { api } from '../api/client';
import { supabasePost, supabaseDelete } from '../api/supabaseClient';
import { ToastContext } from '../App';
import type { Milestone, MilestoneItem, MilestoneSubItem, PriorityTier } from '../types';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';
import DateInput from '../components/DateInput';

export const PRIORITY_ORDER: PriorityTier[] = ['NOW', 'NEXT', 'LATER', 'IDEAS'];

export const PRIORITY_CONFIG: Record<PriorityTier, {
  label: string;
  subLabelKey: string;
  color: string;
  badgeClass: string;
  bgTint: string;
  borderColor: string;
  accent: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  descriptionKey: string;
}> = {
  NOW: {
    label: 'NOW',
    subLabelKey: 'milestones.priorityNowDesc',
    color: '#EF4444',
    badgeClass: 'badge-danger',
    bgTint: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    accent: '#EF4444',
    icon: Flame,
    descriptionKey: 'milestones.priorityNowDesc'
  },
  NEXT: {
    label: 'NEXT',
    subLabelKey: 'milestones.priorityNextDesc',
    color: '#F59E0B',
    badgeClass: 'badge-warning',
    bgTint: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    accent: '#F59E0B',
    icon: Zap,
    descriptionKey: 'milestones.priorityNextDesc'
  },
  LATER: {
    label: 'LATER',
    subLabelKey: 'milestones.priorityLaterDesc',
    color: '#3B82F6',
    badgeClass: 'badge-info',
    bgTint: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
    accent: '#3B82F6',
    icon: Clock,
    descriptionKey: 'milestones.priorityLaterDesc'
  },
  IDEAS: {
    label: 'IDEAS',
    subLabelKey: 'milestones.priorityIdeasDesc',
    color: '#8B5CF6',
    badgeClass: 'badge-primary',
    bgTint: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
    accent: '#8B5CF6',
    icon: Lightbulb,
    descriptionKey: 'milestones.priorityIdeasDesc'
  }
};

export function getPromotedTier(current: PriorityTier = 'NEXT'): PriorityTier {
  switch (current) {
    case 'IDEAS': return 'LATER';
    case 'LATER': return 'NEXT';
    case 'NEXT': return 'NOW';
    case 'NOW': return 'NOW';
    default: return 'NEXT';
  }
}

export function getDemotedTier(current: PriorityTier = 'NEXT'): PriorityTier {
  switch (current) {
    case 'NOW': return 'NEXT';
    case 'NEXT': return 'LATER';
    case 'LATER': return 'IDEAS';
    case 'IDEAS': return 'IDEAS';
    default: return 'NEXT';
  }
}

export default function Milestones() {
  const { t, i18n } = useTranslation();
  const { addToast } = useContext(ToastContext);

  const [searchParams] = useSearchParams();
  const targetIdParam = searchParams.get('id') || searchParams.get('milestoneId');
  const targetItemIdParam = searchParams.get('itemId') || searchParams.get('taskId');
  const targetSubItemIdParam = searchParams.get('subItemId') || searchParams.get('subtaskId');
  const [highlightedMsId, setHighlightedMsId] = useState<number | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<number | null>(null);
  const [highlightedSubItemId, setHighlightedSubItemId] = useState<number | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<'tree' | 'milestones'>('tree');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search & Filter state for Priority Tree
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMilestoneId, setFilterMilestoneId] = useState<number | 'all' | 'standalone'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');

  // Milestone Modal
  const [showModal, setShowModal] = useState(false);
  const [editingMs, setEditingMs] = useState<Milestone | null>(null);
  const [msForm, setMsForm] = useState({ name: '', description: '', deadline: '' });

  // Item Modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [currentMsId, setCurrentMsId] = useState<number | 'standalone' | null>(null);
  const [editingItem, setEditingItem] = useState<MilestoneItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    data_type: 'qualitative' as const,
    target_count: 3,
    current_count: 0,
    unit: '',
    priority: 'NEXT' as PriorityTier,
    milestone_id: 'standalone' as number | 'standalone'
  });

  // SubItem Modal
  const [showSubItemModal, setShowSubItemModal] = useState(false);
  const [currentParentItemId, setCurrentParentItemId] = useState<number | null>(null);
  const [editingSubItem, setEditingSubItem] = useState<MilestoneSubItem | null>(null);
  const [subItemForm, setSubItemForm] = useState({
    name: '',
    data_type: 'qualitative' as const,
    target_count: 1,
    current_count: 0,
    unit: '',
    priority: 'NEXT' as PriorityTier
  });

  // UI state
  const [expandedMs, setExpandedMs] = useState<Set<number>>(new Set());
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [activePriorityMenu, setActivePriorityMenu] = useState<{ id: string; type: 'item' | 'subitem' } | null>(null);

  const fetchMilestones = async () => {
    try {
      const status = showArchived ? 'archived' : 'active';
      const data = await api.get<Milestone[]>(`/milestones?status=${status}`);
      setMilestones(data);
      // Auto-expand all milestones
      setExpandedMs(new Set(data.map(m => m.id)));
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMilestones();
  }, [showArchived]);

  // Deep-link from notebook or other pages: ?id=123, ?itemId=456, ?subItemId=789
  useEffect(() => {
    if (milestones.length === 0) return;
    if (!targetIdParam && !targetItemIdParam && !targetSubItemIdParam) return;

    let targetMsId: number | null = targetIdParam ? parseInt(targetIdParam, 10) : null;
    const targetItemId = targetItemIdParam ? parseInt(targetItemIdParam, 10) : null;
    const targetSubItemId = targetSubItemIdParam ? parseInt(targetSubItemIdParam, 10) : null;

    // If milestone ID is missing, locate it through item or subitem
    if (!targetMsId && targetSubItemId) {
      for (const m of milestones) {
        for (const it of m.items || []) {
          if (it.sub_items?.some(s => s.id === targetSubItemId)) {
            targetMsId = m.id;
            break;
          }
        }
        if (targetMsId) break;
      }
    }
    if (!targetMsId && targetItemId) {
      for (const m of milestones) {
        if (m.items?.some(it => it.id === targetItemId)) {
          targetMsId = m.id;
          break;
        }
      }
    }

    setViewMode('milestones');
    if (targetMsId && !isNaN(targetMsId)) {
      setExpandedMs(prev => new Set([...prev, targetMsId!]));
      setFilterMilestoneId(targetMsId);
      if (!targetItemId && !targetSubItemId) {
        setHighlightedMsId(targetMsId);
      }
    }
    if (targetItemId && !isNaN(targetItemId) && !targetSubItemId) {
      setHighlightedItemId(targetItemId);
    }
    if (targetSubItemId && !isNaN(targetSubItemId)) {
      setHighlightedSubItemId(targetSubItemId);
    }

    setTimeout(() => {
      let targetEl: HTMLElement | null = null;
      if (targetSubItemId && !isNaN(targetSubItemId)) {
        targetEl = document.getElementById(`milestone-subitem-${targetSubItemId}`);
      }
      if (!targetEl && targetItemId && !isNaN(targetItemId)) {
        targetEl = document.getElementById(`milestone-item-${targetItemId}`);
      }
      if (!targetEl && targetMsId && !isNaN(targetMsId)) {
        targetEl = document.getElementById(`milestone-${targetMsId}`);
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 280);

    const timer = setTimeout(() => {
      setHighlightedMsId(null);
      setHighlightedItemId(null);
      setHighlightedSubItemId(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [targetIdParam, targetItemIdParam, targetSubItemIdParam, milestones]);

  // Close popup menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActivePriorityMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Standard Milestone Submit
  const handleMsSubmit = async () => {
    if (!msForm.name.trim()) return;
    try {
      if (editingMs) {
        await api.put(`/milestones/${editingMs.id}`, { ...msForm, status: editingMs.status });
      } else {
        await api.post('/milestones', msForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowModal(false);
      setEditingMs(null);
      setMsForm({ name: '', description: '', deadline: '' });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  // Item Submit (handles both milestone items and independent standalone tasks)
  const handleItemSubmit = async () => {
    if (!itemForm.name.trim()) return;
    try {
      if (editingItem) {
        await api.put(`/milestones/items/${editingItem.id}`, {
          ...itemForm,
          milestone_id: itemForm.milestone_id === 'standalone' ? 'standalone' : Number(itemForm.milestone_id)
        });
      } else {
        const targetMs = itemForm.milestone_id;
        await api.post('/milestones/items', {
          ...itemForm,
          milestone_id: targetMs === 'standalone' ? 'standalone' : Number(targetMs)
        });
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowItemModal(false);
      setEditingItem(null);
      setItemForm({
        name: '',
        data_type: 'qualitative',
        target_count: 3,
        current_count: 0,
        unit: '',
        priority: 'NEXT',
        milestone_id: 'standalone'
      });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  // SubItem Submit
  const handleSubItemSubmit = async () => {
    if (!subItemForm.name.trim() || (!currentParentItemId && !editingSubItem)) return;
    try {
      if (editingSubItem) {
        await api.put(`/milestones/subitems/${editingSubItem.id}`, subItemForm);
      } else {
        await api.post(`/milestones/items/${currentParentItemId}/subitems`, subItemForm);
      }
      setShowSubItemModal(false);
      setEditingSubItem(null);
      setSubItemForm({
        name: '',
        data_type: 'qualitative',
        target_count: 1,
        current_count: 0,
        unit: '',
        priority: 'NEXT'
      });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  // Priority Change Handlers with optimistic updates
  const handleItemPriorityChange = async (itemId: number, newPriority: PriorityTier, itemName?: string) => {
    setMilestones(prev => prev.map(ms => ({
      ...ms,
      items: ms.items?.map(it => it.id === itemId ? { ...it, priority: newPriority } : it)
    })));
    try {
      await api.put(`/milestones/items/${itemId}/priority`, { priority: newPriority });
      if (itemName) {
        addToast('info', t('milestones.promotedTo', { name: itemName, tier: newPriority }));
      }
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
      fetchMilestones();
    }
  };

  const handleSubItemPriorityChange = async (subItemId: number, newPriority: PriorityTier, subItemName?: string) => {
    setMilestones(prev => prev.map(ms => ({
      ...ms,
      items: ms.items?.map(it => ({
        ...it,
        sub_items: it.sub_items?.map(sub => sub.id === subItemId ? { ...sub, priority: newPriority } : sub)
      }))
    })));
    try {
      await api.put(`/milestones/subitems/${subItemId}/priority`, { priority: newPriority });
      if (subItemName) {
        addToast('info', t('milestones.promotedTo', { name: subItemName, tier: newPriority }));
      }
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
      fetchMilestones();
    }
  };

  // Completion toggles
  const toggleItemComplete = async (item: MilestoneItem) => {
    try {
      await api.put(`/milestones/items/${item.id}`, {
        ...item,
        is_completed: !item.is_completed,
        current_count: item.data_type === 'quantitative' ? (item.is_completed ? 0 : item.target_count) : item.current_count
      });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const updateItemCount = async (item: MilestoneItem, newCount: number) => {
    try {
      const isCompleted = item.target_count > 0 ? newCount >= item.target_count : item.is_completed;
      await api.put(`/milestones/items/${item.id}`, { ...item, current_count: newCount, is_completed: isCompleted });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const toggleSubItemComplete = async (sub: MilestoneSubItem) => {
    try {
      await api.put(`/milestones/subitems/${sub.id}`, {
        name: sub.name,
        is_completed: !sub.is_completed,
        current_count: sub.data_type === 'quantitative' ? (sub.is_completed ? 0 : sub.target_count) : sub.current_count,
        priority: sub.priority
      });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const updateSubItemCount = async (sub: MilestoneSubItem, newCount: number) => {
    try {
      const isCompleted = sub.target_count > 0 ? newCount >= sub.target_count : sub.is_completed;
      await api.put(`/milestones/subitems/${sub.id}`, { ...sub, current_count: newCount, is_completed: isCompleted });
      fetchMilestones();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const deleteSubItem = async (subItemId: number) => {
    if (window.confirm(t('common.confirmDelete'))) {
      try {
        await api.delete(`/milestones/subitems/${subItemId}`);
        fetchMilestones();
      } catch (e) {
        addToast('error', t('common.errorOccurred'));
      }
    }
  };

  // Sync & Share helpers
  const syncSharedMilestone = async (id: number) => {
    try {
      await supabasePost(`/shared/milestones/${id}/sync`, {});
      addToast('success', t('common.syncSuccess'));
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const unshareSharedMilestone = async (id: number) => {
    if (!window.confirm(t('common.confirmUnshare'))) return;
    try {
      await supabaseDelete(`/shared/milestones/local/${id}`);
      addToast('success', t('common.unshareSuccess'));
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  // Progress Calculations
  const getItemProgressRate = (item: MilestoneItem): number => {
    if (item.sub_items && item.sub_items.length > 0) {
      const subRates = item.sub_items.map((sub: any) => {
        if (sub.data_type === 'quantitative') {
          const target = sub.target_count || 1;
          const current = sub.current_count || 0;
          return Math.min(1, Math.max(0, current / target));
        }
        return sub.is_completed ? 1 : 0;
      });
      return subRates.reduce((a: number, b: number) => a + b, 0) / subRates.length;
    }

    if (item.data_type === 'quantitative') {
      const target = item.target_count || 1;
      const current = item.current_count || 0;
      return Math.min(1, Math.max(0, current / target));
    }
    return item.is_completed ? 1 : 0;
  };

  const getProgress = (ms: Milestone) => {
    if (!ms.items || ms.items.length === 0) return 0;
    const totalRate = ms.items.reduce((sum, item) => sum + getItemProgressRate(item), 0);
    return Math.round((totalRate / ms.items.length) * 100);
  };

  const getDaysLeft = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const toggleExpand = (id: number) => {
    const next = new Set(expandedMs);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedMs(next);
  };

  // Flattened tasks & subtasks for Priority Tree analysis
  const flattenedData = useMemo(() => {
    const tasks: (MilestoneItem & { milestone_name: string; milestone_is_standalone: boolean })[] = [];
    const subtasks: (MilestoneSubItem & { parent_item_name: string; parent_item_priority: PriorityTier; milestone_name: string; milestone_id: number })[] = [];

    milestones.forEach(ms => {
      const isStandalone = !!ms.is_standalone || ms.name === '独立タスク';
      (ms.items || []).forEach(item => {
        const enrichedItem = {
          ...item,
          priority: (item.priority || 'NEXT') as PriorityTier,
          milestone_name: ms.name,
          milestone_is_standalone: isStandalone
        };
        tasks.push(enrichedItem);

        (item.sub_items || []).forEach(sub => {
          subtasks.push({
            ...sub,
            priority: (sub.priority || 'NEXT') as PriorityTier,
            parent_item_name: item.name,
            parent_item_priority: enrichedItem.priority,
            milestone_name: ms.name,
            milestone_id: ms.id
          });
        });
      });
    });

    return { tasks, subtasks };
  }, [milestones]);

  // Filtered tasks & subtasks for Priority Tree
  const filteredData = useMemo(() => {
    let tasks = flattenedData.tasks;
    let subtasks = flattenedData.subtasks;

    // Filter by Milestone
    if (filterMilestoneId === 'standalone') {
      tasks = tasks.filter(t => t.milestone_is_standalone);
      subtasks = subtasks.filter(s => tasks.some(t => t.id === s.milestone_item_id));
    } else if (filterMilestoneId !== 'all') {
      tasks = tasks.filter(t => t.milestone_id === filterMilestoneId);
      subtasks = subtasks.filter(s => s.milestone_id === filterMilestoneId);
    }

    // Filter by Status
    if (filterStatus === 'pending') {
      tasks = tasks.filter(t => !t.is_completed);
      subtasks = subtasks.filter(s => !s.is_completed);
    } else if (filterStatus === 'completed') {
      tasks = tasks.filter(t => t.is_completed);
      subtasks = subtasks.filter(s => s.is_completed);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tasks = tasks.filter(t => t.name.toLowerCase().includes(q) || t.milestone_name.toLowerCase().includes(q));
      subtasks = subtasks.filter(s => s.name.toLowerCase().includes(q) || s.parent_item_name.toLowerCase().includes(q));
    }

    return { tasks, subtasks };
  }, [flattenedData, filterMilestoneId, filterStatus, searchQuery]);

  // Counts per tier
  const tierCounts = useMemo(() => {
    const counts: Record<PriorityTier, { tasks: number; subtasks: number; total: number }> = {
      NOW: { tasks: 0, subtasks: 0, total: 0 },
      NEXT: { tasks: 0, subtasks: 0, total: 0 },
      LATER: { tasks: 0, subtasks: 0, total: 0 },
      IDEAS: { tasks: 0, subtasks: 0, total: 0 }
    };

    filteredData.tasks.forEach(t => {
      const p = t.priority || 'NEXT';
      if (counts[p]) counts[p].tasks += 1;
    });

    filteredData.subtasks.forEach(s => {
      const p = s.priority || 'NEXT';
      if (counts[p]) counts[p].subtasks += 1;
    });

    PRIORITY_ORDER.forEach(p => {
      counts[p].total = counts[p].tasks + counts[p].subtasks;
    });

    return counts;
  }, [filteredData]);

  // Priority Control Component
  const renderPriorityControl = (
    currentPriority: PriorityTier = 'NEXT',
    name: string,
    onPromote: () => void,
    onDemote: () => void,
    onDirectChange: (tier: PriorityTier) => void,
    menuId: string,
    type: 'item' | 'subitem'
  ) => {
    const cfg = PRIORITY_CONFIG[currentPriority];
    const isNow = currentPriority === 'NOW';
    const isIdeas = currentPriority === 'IDEAS';
    const isMenuOpen = activePriorityMenu?.id === menuId;
    const IconComp = cfg.icon;

    return (
      <div className="flex items-center gap-1 relative" onClick={e => e.stopPropagation()}>
        {/* Promote Button */}
        <button
          type="button"
          disabled={isNow}
          onClick={onPromote}
          className={`p-1 rounded transition-colors ${
            isNow
              ? 'opacity-20 cursor-not-allowed text-gray-500'
              : 'text-gray-400 hover:text-emerald-400 hover:bg-white/10 active:scale-95'
          }`}
          title={isNow ? 'すでに最高優先度です' : `${t('milestones.promote')}: ${getPromotedTier(currentPriority)} へ`}
        >
          <ArrowUp size={13} strokeWidth={2.5} />
        </button>

        {/* Priority Badge / Dropdown Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActivePriorityMenu(isMenuOpen ? null : { id: menuId, type });
          }}
          className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider flex items-center gap-1 border transition-all ${
            isMenuOpen ? 'ring-2 ring-indigo-500/50 scale-105' : 'hover:scale-105'
          }`}
          style={{
            backgroundColor: cfg.bgTint,
            borderColor: cfg.borderColor,
            color: cfg.color
          }}
          title={t('milestones.changePriority')}
        >
          <IconComp size={12} style={{ color: cfg.color }} />
          <span>{cfg.label}</span>
          <ChevronDown size={10} className="opacity-60" />
        </button>

        {/* Demote Button */}
        <button
          type="button"
          disabled={isIdeas}
          onClick={onDemote}
          className={`p-1 rounded transition-colors ${
            isIdeas
              ? 'opacity-20 cursor-not-allowed text-gray-500'
              : 'text-gray-400 hover:text-rose-400 hover:bg-white/10 active:scale-95'
          }`}
          title={isIdeas ? 'すでに最低優先度です' : `${t('milestones.demote')}: ${getDemotedTier(currentPriority)} へ`}
        >
          <ArrowDown size={13} strokeWidth={2.5} />
        </button>

        {/* Tier Selector Dropdown Popup */}
        {isMenuOpen && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-[#161b22] border border-white/15 rounded-lg shadow-xl py-1 min-w-[150px] animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[10px] text-gray-400 font-semibold border-b border-white/10 uppercase">
              {t('milestones.changePriority')}
            </div>
            {PRIORITY_ORDER.map(tier => {
              const tierCfg = PRIORITY_CONFIG[tier];
              const TierIcon = tierCfg.icon;
              const isSelected = currentPriority === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => {
                    onDirectChange(tier);
                    setActivePriorityMenu(null);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-white/10 font-bold' : 'hover:bg-white/5'
                  }`}
                  style={{ color: tierCfg.color }}
                >
                  <span className="flex items-center gap-1.5">
                    <TierIcon size={13} />
                    <span>{tierCfg.label}</span>
                    <span className="text-[10px] opacity-70 font-normal">({t(tierCfg.subLabelKey)})</span>
                  </span>
                  {isSelected && <span className="text-emerald-400 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="animate-fade-in pb-12">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Target className="w-7 h-7 text-indigo-400" />
              <span>{t('milestones.title')}</span>
            </h1>
            <p className="page-description">{t('milestones.subtitle')}</p>
          </div>

          <div className="page-actions flex-wrap gap-2">
            {/* View Mode Toggle */}
            <div className="bg-white/5 p-1 rounded-lg border border-white/10 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                  viewMode === 'tree'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Layers size={14} />
                <span>{t('milestones.viewPriorityTree')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('milestones')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                  viewMode === 'milestones'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Target size={14} />
                <span>{t('milestones.viewByMilestone')}</span>
              </button>
            </div>

            <button
              className={`btn ${showArchived ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? t('milestones.active') : t('milestones.archived')}
            </button>

            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
              <Download size={14} />
              <span>{t('common.importFromTeam', 'Import from Team')}</span>
            </button>

            {/* Quick Action: Add Independent Task or Milestone */}
            {viewMode === 'tree' ? (
              <button
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                onClick={() => {
                  setEditingItem(null);
                  setItemForm({
                    name: '',
                    data_type: 'qualitative',
                    target_count: 3,
                    current_count: 0,
                    unit: '',
                    priority: 'NOW',
                    milestone_id: 'standalone'
                  });
                  setShowItemModal(true);
                }}
              >
                <Plus size={14} />
                <span>{t('milestones.addStandaloneTask')}</span>
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                onClick={() => {
                  setEditingMs(null);
                  setMsForm({ name: '', description: '', deadline: '' });
                  setShowModal(true);
                }}
              >
                <Plus size={14} />
                <span>{t('milestones.addMilestone')}</span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: PRIORITY TREE (NOW / NEXT / LATER / IDEAS)                         */}
        {/* ========================================================================= */}
        {viewMode === 'tree' && (
          <div className="space-y-6">
            {/* Filter & Search Toolbar */}
            <div className="card p-3 bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[300px]">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('milestones.searchPlaceholder')}
                    className="form-input text-xs pl-8 py-1.5 w-full bg-black/20 border-white/10 rounded-lg"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Milestone Filter Dropdown */}
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <ListFilter size={14} className="text-indigo-400" />
                  <select
                    value={filterMilestoneId}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === 'all' || v === 'standalone') {
                        setFilterMilestoneId(v);
                      } else {
                        setFilterMilestoneId(Number(v));
                      }
                    }}
                    className="form-select text-xs py-1.5 px-2 bg-black/20 border-white/10 rounded-lg text-gray-200"
                  >
                    <option value="all">{t('milestones.allMilestones')}</option>
                    <option value="standalone">📌 {t('milestones.standaloneTasks')}</option>
                    {milestones.filter(m => !m.is_standalone && m.name !== '独立タスク').map(m => (
                      <option key={m.id} value={m.id}>🎯 {m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 text-xs bg-black/20 p-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${filterStatus === 'all' ? 'bg-white/15 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                  >
                    {t('milestones.statusAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('pending')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${filterStatus === 'pending' ? 'bg-white/15 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                  >
                    {t('milestones.statusPending')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('completed')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${filterStatus === 'completed' ? 'bg-white/15 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                  >
                    {t('milestones.statusCompleted')}
                  </button>
                </div>
              </div>

              {/* Total Summary Pills */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {PRIORITY_ORDER.map(tier => {
                  const cfg = PRIORITY_CONFIG[tier];
                  const count = tierCounts[tier];
                  return (
                    <span
                      key={tier}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold border flex items-center gap-1"
                      style={{
                        backgroundColor: cfg.bgTint,
                        borderColor: cfg.borderColor,
                        color: cfg.color
                      }}
                    >
                      <span>{tier}:</span>
                      <span className="font-bold">{count.total}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* 4-Tier Matrix Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
              {PRIORITY_ORDER.map(tier => {
                const cfg = PRIORITY_CONFIG[tier];
                const TierIcon = cfg.icon;
                const tierTasks = filteredData.tasks.filter(t => (t.priority || 'NEXT') === tier);
                const tierSubtasks = filteredData.subtasks.filter(s => (s.priority || 'NEXT') === tier && s.parent_item_priority !== tier);
                const totalInTier = tierTasks.length + tierSubtasks.length;

                return (
                  <div
                    key={tier}
                    className="flex flex-col rounded-xl border transition-all shadow-md overflow-hidden bg-[#111827]/70 backdrop-blur-md"
                    style={{
                      borderColor: cfg.borderColor,
                      borderTop: `4px solid ${cfg.accent}`
                    }}
                  >
                    {/* Tier Column Header */}
                    <div
                      className="p-3.5 border-b flex items-center justify-between"
                      style={{
                        backgroundColor: cfg.bgTint,
                        borderColor: cfg.borderColor
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
                          style={{ backgroundColor: `${cfg.accent}25`, color: cfg.color }}
                        >
                          <TierIcon size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</h3>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-white/10 text-gray-300">
                              {totalInTier}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">{t(cfg.subLabelKey)}</p>
                        </div>
                      </div>

                      {/* Quick Add into this Tier */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(null);
                          setItemForm({
                            name: '',
                            data_type: 'qualitative',
                            target_count: 3,
                            current_count: 0,
                            unit: '',
                            priority: tier,
                            milestone_id: 'standalone'
                          });
                          setShowItemModal(true);
                        }}
                        className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-gray-200 transition-colors"
                        title={`${tier} にタスクを追加`}
                      >
                        <Plus size={15} />
                      </button>
                    </div>

                    {/* Column Body: Tasks List */}
                    <div className="p-3 space-y-3 min-h-[260px] max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
                      {totalInTier === 0 ? (
                        <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-lg">
                          <TierIcon size={24} className="mx-auto mb-2 opacity-30" style={{ color: cfg.color }} />
                          <p className="text-xs text-gray-400 mb-2">{t('milestones.emptyTier')}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(null);
                              setItemForm({
                                name: '',
                                data_type: 'qualitative',
                                target_count: 3,
                                current_count: 0,
                                unit: '',
                                priority: tier,
                                milestone_id: 'standalone'
                              });
                              setShowItemModal(true);
                            }}
                            className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 mx-auto"
                          >
                            <Plus size={12} /> {t('common.add')}
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Direct Tasks belonging to this tier */}
                          {tierTasks.map(item => (
                            <div
                              key={`tree-item-${item.id}`}
                              className={`p-3 rounded-lg border bg-white/[0.03] transition-all hover:bg-white/[0.06] flex flex-col gap-2.5 ${
                                item.is_completed ? 'opacity-60 border-white/5' : 'border-white/10'
                              }`}
                            >
                              {/* Task Header: Checkbox + Title + Stepper */}
                              <div className="flex items-start gap-2.5">
                                {item.data_type === 'qualitative' || item.data_type === 'task' ? (
                                  <button
                                    type="button"
                                    className="checklist-check mt-0.5"
                                    onClick={() => toggleItemComplete(item)}
                                    style={{ width: 18, height: 18, borderRadius: 4 }}
                                  >
                                    {item.is_completed && <CheckCircle2 size={12} style={{ color: 'white' }} />}
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-icon btn-sm p-0.5 text-gray-400 hover:text-white"
                                      onClick={() => updateItemCount(item, Math.max(0, item.current_count - 1))}
                                      disabled={item.current_count <= 0}
                                    >
                                      <MinusCircle size={14} />
                                    </button>
                                    <span className="text-xs font-bold font-mono">
                                      {item.current_count}/{item.target_count}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-icon btn-sm p-0.5 text-gray-400 hover:text-white"
                                      onClick={() => updateItemCount(item, item.current_count + 1)}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`text-xs font-semibold leading-snug break-words ${
                                        item.is_completed ? 'line-through text-gray-400' : 'text-gray-100'
                                      }`}
                                    >
                                      {item.name}
                                    </span>
                                  </div>

                                  {/* Milestone attribution badge */}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span
                                      className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                        item.milestone_is_standalone
                                          ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                          : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                                      }`}
                                      title={item.milestone_name}
                                    >
                                      {item.milestone_is_standalone ? '📌 ' : '🎯 '}
                                      {item.milestone_name}
                                    </span>

                                    {item.data_type === 'quantitative' && item.unit && (
                                      <span className="text-[10px] text-gray-400 font-mono">
                                        ({item.unit})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Quantitative progress bar */}
                              {item.data_type === 'quantitative' && (
                                <div className="progress-bar h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="progress-bar-fill h-full transition-all"
                                    style={{
                                      width: `${Math.min(100, (item.current_count / item.target_count) * 100)}%`,
                                      backgroundColor: cfg.color
                                    }}
                                  />
                                </div>
                              )}

                              {/* Task Footer: Priority Control & Actions */}
                              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                                {renderPriorityControl(
                                  item.priority || 'NEXT',
                                  item.name,
                                  () => handleItemPriorityChange(item.id, getPromotedTier(item.priority), item.name),
                                  () => handleItemPriorityChange(item.id, getDemotedTier(item.priority), item.name),
                                  (newTier) => handleItemPriorityChange(item.id, newTier, item.name),
                                  `tree-item-${item.id}`,
                                  'item'
                                )}

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="p-1 rounded text-gray-400 hover:text-indigo-300 hover:bg-white/10"
                                    onClick={() => {
                                      setCurrentParentItemId(item.id);
                                      setEditingSubItem(null);
                                      setSubItemForm({
                                        name: '',
                                        data_type: 'qualitative',
                                        target_count: 1,
                                        current_count: 0,
                                        unit: '',
                                        priority: item.priority || 'NEXT'
                                      });
                                      setShowSubItemModal(true);
                                    }}
                                    title={t('milestones.addSubItem')}
                                  >
                                    <Plus size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10"
                                    onClick={() => {
                                      setEditingItem(item);
                                      setItemForm({
                                        name: item.name,
                                        data_type: item.data_type,
                                        target_count: item.target_count || 1,
                                        current_count: item.current_count || 0,
                                        unit: item.unit || '',
                                        priority: item.priority || 'NEXT',
                                        milestone_id: item.milestone_is_standalone ? 'standalone' : item.milestone_id
                                      });
                                      setShowItemModal(true);
                                    }}
                                    title={t('common.edit')}
                                  >
                                    <Edit size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-white/10"
                                    onClick={async () => {
                                      if (window.confirm(t('common.confirmDelete'))) {
                                        await api.delete(`/milestones/items/${item.id}`);
                                        fetchMilestones();
                                      }
                                    }}
                                    title={t('common.delete')}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Nested Subtasks inside Task card */}
                              {item.sub_items && item.sub_items.length > 0 && (
                                <div className="mt-1 pl-2.5 border-l-2 border-white/10 space-y-1.5">
                                  {item.sub_items.map(sub => {
                                    const subPriority = (sub.priority || 'NEXT') as PriorityTier;
                                    const subCfg = PRIORITY_CONFIG[subPriority];
                                    return (
                                      <div
                                        key={`sub-${sub.id}`}
                                        className={`p-1.5 rounded bg-black/25 flex items-center justify-between gap-1 text-[11px] ${
                                          sub.is_completed ? 'opacity-50' : ''
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                          <button
                                            type="button"
                                            className="checklist-check flex-shrink-0"
                                            onClick={() => toggleSubItemComplete(sub)}
                                            style={{ width: 14, height: 14, borderRadius: 3 }}
                                          >
                                            {sub.is_completed && <CheckCircle2 size={9} style={{ color: 'white' }} />}
                                          </button>
                                          <span className={`truncate ${sub.is_completed ? 'line-through text-gray-400' : 'text-gray-200'}`}>
                                            {sub.name}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {renderPriorityControl(
                                            subPriority,
                                            sub.name,
                                            () => handleSubItemPriorityChange(sub.id, getPromotedTier(subPriority), sub.name),
                                            () => handleSubItemPriorityChange(sub.id, getDemotedTier(subPriority), sub.name),
                                            (newTier) => handleSubItemPriorityChange(sub.id, newTier, sub.name),
                                            `tree-sub-${sub.id}`,
                                            'subitem'
                                          )}

                                          <button
                                            type="button"
                                            className="p-0.5 rounded text-gray-400 hover:text-white"
                                            onClick={() => {
                                              setEditingSubItem(sub);
                                              setSubItemForm({
                                                name: sub.name,
                                                data_type: sub.data_type,
                                                target_count: sub.target_count || 1,
                                                current_count: sub.current_count || 0,
                                                unit: sub.unit || '',
                                                priority: subPriority
                                              });
                                              setCurrentParentItemId(item.id);
                                              setShowSubItemModal(true);
                                            }}
                                          >
                                            <Edit size={11} />
                                          </button>
                                          <button
                                            type="button"
                                            className="p-0.5 rounded text-gray-400 hover:text-rose-400"
                                            onClick={() => deleteSubItem(sub.id)}
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Subtasks whose parent is in another tier */}
                          {tierSubtasks.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                              <div className="text-[10px] font-semibold text-gray-400 flex items-center gap-1 uppercase tracking-wider">
                                <Zap size={11} className="text-amber-400" />
                                <span>{t('milestones.treeSubtasksFromOtherTier')}</span>
                              </div>
                              {tierSubtasks.map(sub => (
                                <div
                                  key={`detached-sub-${sub.id}`}
                                  className="p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 flex flex-col gap-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <button
                                        type="button"
                                        className="checklist-check flex-shrink-0"
                                        onClick={() => toggleSubItemComplete(sub)}
                                        style={{ width: 16, height: 16, borderRadius: 3 }}
                                      >
                                        {sub.is_completed && <CheckCircle2 size={10} style={{ color: 'white' }} />}
                                      </button>
                                      <div className="min-w-0">
                                        <div className={`text-xs font-semibold truncate ${sub.is_completed ? 'line-through text-gray-400' : 'text-gray-100'}`}>
                                          {sub.name}
                                        </div>
                                        <div className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                                          <span>↳ {sub.parent_item_name}</span>
                                          <span className="opacity-60">({sub.milestone_name})</span>
                                        </div>
                                      </div>
                                    </div>

                                    {renderPriorityControl(
                                      sub.priority || 'NEXT',
                                      sub.name,
                                      () => handleSubItemPriorityChange(sub.id, getPromotedTier(sub.priority), sub.name),
                                      () => handleSubItemPriorityChange(sub.id, getDemotedTier(sub.priority), sub.name),
                                      (newTier) => handleSubItemPriorityChange(sub.id, newTier, sub.name),
                                      `detached-sub-${sub.id}`,
                                      'subitem'
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: BY MILESTONE (CLASSIC VIEW WITH PROMOTED PRIORITIES)               */}
        {/* ========================================================================= */}
        {viewMode === 'milestones' && (
          <div>
            {milestones.length === 0 ? (
              <div className="empty-state">
                <Target size={64} />
                <h3 className="empty-state-title">{t('milestones.noMilestones')}</h3>
                <p className="empty-state-description">{t('milestones.noMilestonesDesc')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {milestones.map(ms => {
                  const progress = getProgress(ms);
                  const daysLeft = getDaysLeft(ms.deadline);
                  const isExpanded = expandedMs.has(ms.id);
                  const isStandalone = !!ms.is_standalone || ms.name === '独立タスク';

                  return (
                    <div
                      key={ms.id}
                      id={`milestone-${ms.id}`}
                      className={`card animate-slide-up transition-all duration-500 ${
                        highlightedMsId === ms.id ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-[#0f172a] shadow-xl shadow-purple-500/20' : ''
                      }`}
                      style={isStandalone ? { borderLeft: '4px solid #8B5CF6' } : undefined}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 4, flexWrap: 'wrap' }}>
                            <h3 className="card-title flex items-center gap-1.5">
                              {isStandalone && <span>📌</span>}
                              <span>{ms.name}</span>
                            </h3>
                            {isStandalone && (
                              <span className="badge badge-primary text-[10px]">
                                {t('milestones.standaloneTag')}
                              </span>
                            )}
                            {!isStandalone && daysLeft !== null && (
                              <span className={`badge ${daysLeft < 0 ? 'badge-danger' : daysLeft < 7 ? 'badge-warning' : 'badge-info'}`}>
                                {daysLeft < 0 ? t('milestones.overdue') : t('milestones.daysRemaining', { count: daysLeft })}
                              </span>
                            )}
                            {!isStandalone && ms.deadline && (
                              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                                {t('milestones.deadlineDate', {
                                  date: new Date(ms.deadline + 'T00:00:00').toLocaleDateString(
                                    i18n.language === 'en' ? 'en-US' : 'ja-JP',
                                    { year: 'numeric', month: 'short', day: 'numeric' }
                                  )
                                })}
                              </span>
                            )}
                          </div>
                          {ms.description && (
                            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                              {ms.description}
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                          {/* Progress ring */}
                          <svg width="48" height="48" className="progress-ring">
                            <circle className="progress-ring-bg" cx="24" cy="24" r="20" strokeWidth="4" />
                            <circle
                              className="progress-ring-fill"
                              cx="24"
                              cy="24"
                              r="20"
                              strokeWidth="4"
                              strokeDasharray={`${2 * Math.PI * 20}`}
                              strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress / 100)}`}
                              style={{ stroke: progress === 100 ? 'var(--color-secondary)' : 'var(--color-primary)' }}
                            />
                            <text
                              x="24"
                              y="24"
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--text-primary)',
                                fontSize: '11px',
                                fontWeight: 600,
                                transform: 'rotate(90deg)',
                                transformOrigin: 'center'
                              }}
                            >
                              {progress}%
                            </text>
                          </svg>

                          {!isStandalone && (
                            <>
                              {!showArchived ? (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '4px 8px', fontSize: '12px' }}
                                  onClick={async () => {
                                    if (window.confirm(t('milestones.confirmArchive'))) {
                                      try {
                                        await api.put(`/milestones/${ms.id}`, { ...ms, status: 'archived' });
                                        addToast('success', t('milestones.archiveSuccess'));
                                        fetchMilestones();
                                      } catch (e) {
                                        addToast('error', t('common.errorOccurred'));
                                      }
                                    }
                                  }}
                                >
                                  <CheckCircle2 size={14} style={{ marginRight: 4 }} />
                                  {t('milestones.archive')}
                                </button>
                              ) : (
                                <button
                                  className="btn btn-warning btn-sm"
                                  style={{ padding: '4px 8px', fontSize: '12px' }}
                                  onClick={async () => {
                                    try {
                                      await api.put(`/milestones/${ms.id}`, { ...ms, status: 'active' });
                                      addToast('success', t('milestones.unarchiveSuccess'));
                                      fetchMilestones();
                                    } catch (e) {
                                      addToast('error', t('common.errorOccurred'));
                                    }
                                  }}
                                >
                                  {t('milestones.unarchive')}
                                </button>
                              )}

                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--color-primary)' }}
                                onClick={() => syncSharedMilestone(ms.id)}
                                title={t('milestones.syncToTeam')}
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--color-warning)' }}
                                onClick={() => unshareSharedMilestone(ms.id)}
                                title={t('common.unshare')}
                              >
                                <Unlink size={14} />
                              </button>
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--color-info)' }}
                                onClick={() => setShareTarget({ id: ms.id, name: ms.name })}
                                title={t('common.share', 'Share')}
                              >
                                <Share2 size={14} />
                              </button>
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => {
                                  setEditingMs(ms);
                                  setMsForm({ name: ms.name, description: ms.description, deadline: ms.deadline || '' });
                                  setShowModal(true);
                                }}
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--color-danger)' }}
                                onClick={async () => {
                                  if (window.confirm(t('common.confirmDelete'))) {
                                    try {
                                      await api.delete(`/milestones/${ms.id}`);
                                      addToast('success', t('common.deletedSuccessfully'));
                                      fetchMilestones();
                                    } catch (e) {
                                      addToast('error', t('common.errorOccurred'));
                                    }
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}

                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleExpand(ms.id)}>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      <div className="progress-bar" style={{ marginBottom: 'var(--space-md)' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${progress}%`,
                            background: progress === 100 ? 'var(--color-secondary)' : undefined
                          }}
                        />
                      </div>

                      {isExpanded && (
                        <div>
                          {(!ms.items || ms.items.length === 0) ? (
                            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', padding: 'var(--space-md)' }}>
                              {t('milestones.noItems')}
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                              {ms.items.map(item => {
                                const itemPriority = (item.priority || 'NEXT') as PriorityTier;
                                return (
                                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-sm)' }}>
                                    <div
                                      id={`milestone-item-${item.id}`}
                                      className={`transition-all duration-500 rounded-lg ${
                                        highlightedItemId === item.id
                                          ? 'ring-2 ring-purple-500 bg-purple-500/15 shadow-lg shadow-purple-500/25 border-purple-400'
                                          : ''
                                      }`}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-md)',
                                        padding: 'var(--space-sm) var(--space-md)',
                                        borderRadius: 'var(--border-radius-md)',
                                        border: highlightedItemId === item.id ? '1px solid #a855f7' : '1px solid var(--border-default)',
                                        opacity: item.is_completed ? 0.6 : 1
                                      }}
                                    >
                                      {item.data_type === 'qualitative' || item.data_type === 'task' ? (
                                        <button
                                          className="checklist-check"
                                          onClick={() => toggleItemComplete(item)}
                                          style={{ width: 22, height: 22 }}
                                        >
                                          {item.is_completed && <CheckCircle2 size={14} style={{ color: 'white', opacity: 1 }} />}
                                        </button>
                                      ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            onClick={() => updateItemCount(item, Math.max(0, item.current_count - 1))}
                                            disabled={item.current_count <= 0}
                                          >
                                            <MinusCircle size={16} />
                                          </button>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
                                            <input
                                              type="number"
                                              min={0}
                                              className="form-input"
                                              style={{
                                                width: 52,
                                                height: 28,
                                                padding: '2px 4px',
                                                textAlign: 'center',
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'bold',
                                                borderRadius: 'var(--border-radius-sm)'
                                              }}
                                              defaultValue={item.current_count}
                                              key={`item-count-${item.id}-${item.current_count}`}
                                              onBlur={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                if (!isNaN(val) && val >= 0 && val !== item.current_count) {
                                                  updateItemCount(item, val);
                                                } else {
                                                  e.target.value = String(item.current_count);
                                                }
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  (e.target as HTMLInputElement).blur();
                                                }
                                              }}
                                            />
                                            <span style={{ color: 'var(--text-secondary)' }}>/{item.target_count}</span>
                                            {item.unit && (
                                              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: 2 }}>
                                                {item.unit}
                                              </span>
                                            )}
                                          </div>
                                          <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            onClick={() => updateItemCount(item, item.current_count + 1)}
                                          >
                                            <Plus size={16} />
                                          </button>
                                        </div>
                                      )}

                                      <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: 'var(--font-size-sm)', textDecoration: item.is_completed ? 'line-through' : 'none' }}>
                                            {item.name}
                                          </span>
                                          <span className={`badge ${item.data_type === 'qualitative' ? 'badge-primary' : item.data_type === 'quantitative' ? 'badge-info' : 'badge-warning'}`}>
                                            {item.data_type === 'task' ? t('milestones.task') : t(`milestones.${item.data_type}`)}
                                          </span>
                                        </div>
                                        {item.data_type === 'quantitative' && (
                                          <div className="progress-bar" style={{ width: 80, marginTop: 4 }}>
                                            <div
                                              className="progress-bar-fill"
                                              style={{ width: `${Math.min(100, (item.current_count / item.target_count) * 100)}%` }}
                                            />
                                          </div>
                                        )}
                                      </div>

                                      {/* Priority Badge with Promote / Demote */}
                                      {renderPriorityControl(
                                        itemPriority,
                                        item.name,
                                        () => handleItemPriorityChange(item.id, getPromotedTier(itemPriority), item.name),
                                        () => handleItemPriorityChange(item.id, getDemotedTier(itemPriority), item.name),
                                        (newTier) => handleItemPriorityChange(item.id, newTier, item.name),
                                        `ms-item-${item.id}`,
                                        'item'
                                      )}

                                      <div style={{ display: 'flex', gap: 4 }}>
                                        <button
                                          className="btn btn-ghost btn-icon btn-sm"
                                          onClick={() => {
                                            setEditingItem(item);
                                            setItemForm({
                                              name: item.name,
                                              data_type: item.data_type,
                                              target_count: item.target_count || 1,
                                              current_count: item.current_count || 0,
                                              unit: item.unit || '',
                                              priority: itemPriority,
                                              milestone_id: ms.id
                                            });
                                            setCurrentMsId(item.milestone_id);
                                            setShowItemModal(true);
                                          }}
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button
                                          className="btn btn-ghost btn-icon btn-sm"
                                          style={{ color: 'var(--color-danger)' }}
                                          onClick={async () => {
                                            if (window.confirm(t('common.confirmDelete'))) {
                                              await api.delete(`/milestones/items/${item.id}`);
                                              fetchMilestones();
                                            }
                                          }}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Sub Items */}
                                    <div style={{ marginLeft: 'var(--space-xl)', borderLeft: '2px solid var(--border-default)', paddingLeft: 'var(--space-md)' }}>
                                      {item.sub_items && item.sub_items.map((sub: any) => {
                                        const subPriority = (sub.priority || 'NEXT') as PriorityTier;
                                        return (
                                          <div
                                            key={sub.id}
                                            id={`milestone-subitem-${sub.id}`}
                                            className={`transition-all duration-500 rounded-md px-1 py-0.5 ${
                                              highlightedSubItemId === sub.id
                                                ? 'ring-2 ring-indigo-400 bg-indigo-500/20 shadow-md shadow-indigo-500/25 border border-indigo-400/50'
                                                : ''
                                            }`}
                                            style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-xs)' }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '4px 0', opacity: sub.is_completed ? 0.6 : 1 }}>
                                              {sub.data_type === 'qualitative' || sub.data_type === 'task' ? (
                                                <button
                                                  className="checklist-check"
                                                  onClick={() => toggleSubItemComplete(sub)}
                                                  style={{ width: 16, height: 16 }}
                                                >
                                                  {sub.is_completed && <CheckCircle2 size={10} style={{ color: 'white', opacity: 1 }} />}
                                                </button>
                                              ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                  <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    onClick={() => updateSubItemCount(sub, Math.max(0, sub.current_count - 1))}
                                                    disabled={sub.current_count <= 0}
                                                  >
                                                    <MinusCircle size={14} />
                                                  </button>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      className="form-input"
                                                      style={{
                                                        width: 46,
                                                        height: 24,
                                                        padding: '1px 3px',
                                                        textAlign: 'center',
                                                        fontSize: 'var(--font-size-xs)',
                                                        fontWeight: 'bold',
                                                        borderRadius: 'var(--border-radius-sm)'
                                                      }}
                                                      defaultValue={sub.current_count}
                                                      key={`subitem-count-${sub.id}-${sub.current_count}`}
                                                      onBlur={(e) => {
                                                        const val = parseInt(e.target.value, 10);
                                                        if (!isNaN(val) && val >= 0 && val !== sub.current_count) {
                                                          updateSubItemCount(sub, val);
                                                        } else {
                                                          e.target.value = String(sub.current_count);
                                                        }
                                                      }}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          (e.target as HTMLInputElement).blur();
                                                        }
                                                      }}
                                                    />
                                                    <span style={{ color: 'var(--text-secondary)' }}>/{sub.target_count}</span>
                                                    {sub.unit && (
                                                      <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: 2 }}>
                                                        {sub.unit}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    onClick={() => updateSubItemCount(sub, sub.current_count + 1)}
                                                  >
                                                    <Plus size={14} />
                                                  </button>
                                                </div>
                                              )}

                                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                                <span style={{ fontSize: 'var(--font-size-xs)', textDecoration: sub.is_completed ? 'line-through' : 'none' }}>
                                                  {sub.name}
                                                </span>
                                                <span
                                                  className={`badge ${sub.data_type === 'qualitative' ? 'badge-primary' : sub.data_type === 'quantitative' ? 'badge-info' : 'badge-warning'}`}
                                                  style={{ transform: 'scale(0.8)', transformOrigin: 'left' }}
                                                >
                                                  {sub.data_type === 'task' ? t('milestones.task') : t(`milestones.${sub.data_type}`)}
                                                </span>
                                              </div>

                                              {/* Subitem Priority Control */}
                                              {renderPriorityControl(
                                                subPriority,
                                                sub.name,
                                                () => handleSubItemPriorityChange(sub.id, getPromotedTier(subPriority), sub.name),
                                                () => handleSubItemPriorityChange(sub.id, getDemotedTier(subPriority), sub.name),
                                                (newTier) => handleSubItemPriorityChange(sub.id, newTier, sub.name),
                                                `ms-sub-${sub.id}`,
                                                'subitem'
                                              )}

                                              <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                onClick={() => {
                                                  setEditingSubItem(sub);
                                                  setSubItemForm({
                                                    name: sub.name,
                                                    data_type: sub.data_type,
                                                    target_count: sub.target_count || 1,
                                                    current_count: sub.current_count || 0,
                                                    unit: sub.unit || '',
                                                    priority: subPriority
                                                  });
                                                  setCurrentParentItemId(item.id);
                                                  setShowSubItemModal(true);
                                                }}
                                              >
                                                <Edit size={14} />
                                              </button>
                                              <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                style={{ color: 'var(--color-danger)', padding: 2 }}
                                                onClick={() => deleteSubItem(sub.id)}
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </div>

                                            {sub.data_type === 'quantitative' && (
                                              <div className="progress-bar" style={{ width: 60, marginTop: 2, height: 4 }}>
                                                <div
                                                  className="progress-bar-fill"
                                                  style={{ width: `${Math.min(100, (sub.current_count / sub.target_count) * 100)}%` }}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 4 }}>
                                        <button
                                          className="btn btn-ghost btn-sm"
                                          style={{ fontSize: 'var(--font-size-xs)' }}
                                          onClick={() => {
                                            setCurrentParentItemId(item.id);
                                            setEditingSubItem(null);
                                            setSubItemForm({
                                              name: '',
                                              data_type: 'qualitative',
                                              target_count: 1,
                                              current_count: 0,
                                              unit: '',
                                              priority: itemPriority
                                            });
                                            setShowSubItemModal(true);
                                          }}
                                        >
                                          <Plus size={12} /> {t('milestones.addSubItem')}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ marginTop: 'var(--space-md)' }}
                            onClick={() => {
                              setCurrentMsId(ms.id);
                              setEditingItem(null);
                              setItemForm({
                                name: '',
                                data_type: 'qualitative',
                                target_count: 3,
                                current_count: 0,
                                unit: '',
                                priority: 'NEXT',
                                milestone_id: ms.id
                              });
                              setShowItemModal(true);
                            }}
                          >
                            <Plus size={14} /> {t('milestones.addItem')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Milestone Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">{editingMs ? t('milestones.editMilestone') : t('milestones.addMilestone')}</h3>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{t('milestones.milestoneName')} *</label>
                  <input
                    className="form-input"
                    value={msForm.name}
                    onChange={e => setMsForm({ ...msForm, name: e.target.value })}
                    placeholder={t('milestones.milestoneNamePlaceholder')}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.description')}</label>
                  <textarea
                    className="form-textarea"
                    value={msForm.description}
                    onChange={e => setMsForm({ ...msForm, description: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('milestones.deadline')}</label>
                  <DateInput value={msForm.deadline} onChange={val => setMsForm({ ...msForm, deadline: val })} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={handleMsSubmit} disabled={!msForm.name.trim()}>
                  {editingMs ? t('common.save') : t('common.create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Item Modal (Task / Standalone Task) */}
        {showItemModal && (
          <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingItem ? t('milestones.editItem') : t('milestones.addItem')}
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowItemModal(false)}>×</button>
              </div>
              <div className="modal-body">
                {/* Target Milestone Selection */}
                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">
                    {t('milestones.targetMilestone')}
                  </label>
                  <select
                    className="form-select text-sm"
                    value={itemForm.milestone_id}
                    onChange={e => {
                      const v = e.target.value;
                      setItemForm({
                        ...itemForm,
                        milestone_id: v === 'standalone' ? 'standalone' : Number(v)
                      });
                    }}
                  >
                    <option value="standalone">📌 {t('milestones.noMilestone')}</option>
                    {milestones.filter(m => !m.is_standalone && m.name !== '独立タスク').map(m => (
                      <option key={m.id} value={m.id}>🎯 {m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Priority Selection */}
                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">
                    {t('milestones.priority')}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRIORITY_ORDER.map(tier => {
                      const cfg = PRIORITY_CONFIG[tier];
                      const TierIcon = cfg.icon;
                      const isSelected = itemForm.priority === tier;
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setItemForm({ ...itemForm, priority: tier })}
                          className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 ${
                            isSelected ? 'ring-2 ring-indigo-500 font-bold scale-[1.02]' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: isSelected ? `${cfg.accent}20` : 'rgba(255,255,255,0.03)',
                            borderColor: isSelected ? cfg.accent : 'rgba(255,255,255,0.1)',
                            color: cfg.color
                          }}
                        >
                          <TierIcon size={16} />
                          <span className="text-xs">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">{t('milestones.itemName')} *</label>
                  <input
                    className="form-input"
                    value={itemForm.name}
                    onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder={t('milestones.itemNamePlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('milestones.itemType')}</label>
                  <select
                    className="form-input"
                    value={itemForm.data_type}
                    onChange={e => setItemForm({ ...itemForm, data_type: e.target.value as any })}
                  >
                    <option value="qualitative">{t('milestones.qualitative')}</option>
                    <option value="quantitative">{t('milestones.quantitative')}</option>
                    <option value="task">{t('milestones.task')}</option>
                  </select>
                </div>

                {itemForm.data_type === 'quantitative' && (
                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('milestones.targetCount')}</label>
                      <input
                        className="form-input"
                        type="number"
                        min="1"
                        value={itemForm.target_count}
                        onChange={e => setItemForm({ ...itemForm, target_count: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('milestones.unitLabel')}</label>
                      <input
                        className="form-input"
                        value={itemForm.unit}
                        onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                        placeholder={t('milestones.unitPlaceholder')}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowItemModal(false)}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={handleItemSubmit} disabled={!itemForm.name.trim()}>
                  {editingItem ? t('common.save') : t('common.create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SubItem Modal */}
        {showSubItemModal && (
          <div className="modal-overlay" onClick={() => setShowSubItemModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingSubItem ? t('milestones.editSubItem') : t('milestones.addSubItem')}
                </h3>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => { setShowSubItemModal(false); setEditingSubItem(null); }}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                {/* Priority Selection for Subtask */}
                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">
                    {t('milestones.priority')}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRIORITY_ORDER.map(tier => {
                      const cfg = PRIORITY_CONFIG[tier];
                      const TierIcon = cfg.icon;
                      const isSelected = subItemForm.priority === tier;
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setSubItemForm({ ...subItemForm, priority: tier })}
                          className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 ${
                            isSelected ? 'ring-2 ring-indigo-500 font-bold scale-[1.02]' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: isSelected ? `${cfg.accent}20` : 'rgba(255,255,255,0.03)',
                            borderColor: isSelected ? cfg.accent : 'rgba(255,255,255,0.1)',
                            color: cfg.color
                          }}
                        >
                          <TierIcon size={16} />
                          <span className="text-xs">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">{t('milestones.itemName')} *</label>
                  <input
                    className="form-input"
                    value={subItemForm.name}
                    onChange={e => setSubItemForm({ ...subItemForm, name: e.target.value })}
                    placeholder={t('milestones.subItemNamePlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('milestones.itemType')}</label>
                  <select
                    className="form-input"
                    value={subItemForm.data_type}
                    onChange={e => setSubItemForm({ ...subItemForm, data_type: e.target.value as any })}
                  >
                    <option value="qualitative">{t('milestones.qualitative')}</option>
                    <option value="quantitative">{t('milestones.quantitative')}</option>
                    <option value="task">{t('milestones.task')}</option>
                  </select>
                </div>

                {subItemForm.data_type === 'quantitative' && (
                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('milestones.targetCount')}</label>
                      <input
                        className="form-input"
                        type="number"
                        min="1"
                        value={subItemForm.target_count}
                        onChange={e => setSubItemForm({ ...subItemForm, target_count: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('milestones.unitLabel')}</label>
                      <input
                        className="form-input"
                        value={subItemForm.unit}
                        onChange={e => setSubItemForm({ ...subItemForm, unit: e.target.value })}
                        placeholder={t('milestones.unitPlaceholder')}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowSubItemModal(false)}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={handleSubItemSubmit} disabled={!subItemForm.name.trim()}>
                  {editingSubItem ? t('common.save') : t('common.create')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Share Modal */}
      {shareTarget && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareTarget(null)}
          itemType="milestones"
          localItemId={shareTarget.id}
          itemName={shareTarget.name}
          onSuccess={() => setShareTarget(null)}
        />
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        itemType="milestones"
        onSuccess={() => { setShowImport(false); fetchMilestones(); }}
      />
    </>
  );
}
