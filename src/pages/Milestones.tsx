import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Plus, Trash2, Edit, ChevronDown, ChevronUp, CheckCircle2, MinusCircle, Share2, Download } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';
import type { Milestone, MilestoneItem } from '../types';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';

export default function Milestones() {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMs, setEditingMs] = useState<Milestone | null>(null);
  const [msForm, setMsForm] = useState({ name: '', description: '', deadline: '' });
  const [showItemModal, setShowItemModal] = useState(false);
  const [currentMsId, setCurrentMsId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<MilestoneItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', data_type: 'qualitative' as const, target_count: 3, current_count: 0, unit: '' });
  const [expandedMs, setExpandedMs] = useState<Set<number>>(new Set());
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fetchMilestones = async () => {
    try {
      const status = showArchived ? 'archived' : 'active';
      const data = await api.get<Milestone[]>(`/milestones?status=${status}`);
      setMilestones(data);
      // Auto-expand all
      setExpandedMs(new Set(data.map(m => m.id)));
    } catch (e) { addToast('error', t('common.errorOccurred')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMilestones(); }, [showArchived]);

  const handleMsSubmit = async () => {
    if (!msForm.name.trim()) return;
    try {
      if (editingMs) {
        await api.put(`/milestones/${editingMs.id}`, { ...msForm, status: editingMs.status });
      } else {
        await api.post('/milestones', msForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowModal(false); setEditingMs(null); setMsForm({ name: '', description: '', deadline: '' });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const handleItemSubmit = async () => {
    if (!itemForm.name.trim() || !currentMsId) return;
    try {
      if (editingItem) {
        await api.put(`/milestones/items/${editingItem.id}`, itemForm);
      } else {
        await api.post(`/milestones/${currentMsId}/items`, itemForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowItemModal(false); setEditingItem(null);
      setItemForm({ name: '', data_type: 'qualitative', target_count: 3, current_count: 0, unit: '' });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const toggleItemComplete = async (item: MilestoneItem) => {
    try {
      await api.put(`/milestones/items/${item.id}`, {
        ...item, is_completed: !item.is_completed,
        current_count: item.data_type === 'quantitative' ? (item.is_completed ? 0 : item.target_count) : item.current_count
      });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const updateItemCount = async (item: MilestoneItem, newCount: number) => {
    try {
      await api.put(`/milestones/items/${item.id}`, { ...item, current_count: newCount });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const [showSubItemModal, setShowSubItemModal] = useState(false);
  const [currentParentItemId, setCurrentParentItemId] = useState<number | null>(null);
  const [editingSubItem, setEditingSubItem] = useState<MilestoneSubItem | null>(null);
  const [subItemForm, setSubItemForm] = useState({ name: '', data_type: 'qualitative' as const, target_count: 1, current_count: 0, unit: '' });

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
      setSubItemForm({ name: '', data_type: 'qualitative', target_count: 1, current_count: 0, unit: '' });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const toggleSubItemComplete = async (sub: MilestoneSubItem) => {
    try {
      await api.put(`/milestones/subitems/${sub.id}`, { 
        name: sub.name, 
        is_completed: !sub.is_completed,
        current_count: sub.data_type === 'quantitative' ? (sub.is_completed ? 0 : sub.target_count) : sub.current_count
      });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const updateSubItemCount = async (sub: MilestoneSubItem, newCount: number) => {
    try {
      await api.put(`/milestones/subitems/${sub.id}`, { ...sub, current_count: newCount });
      fetchMilestones();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const deleteSubItem = async (subItemId: number) => {
    if (window.confirm(t('common.confirmDelete', { defaultValue: '本当に削除しますか？' }))) {
      try {
        await api.delete(`/milestones/subitems/${subItemId}`);
        fetchMilestones();
      } catch (e) { addToast('error', t('common.errorOccurred')); }
    }
  };

  const getProgress = (ms: Milestone) => {
    if (!ms.items || ms.items.length === 0) return 0;
    const completed = ms.items.filter(i => i.is_completed).length;
    return Math.round((completed / ms.items.length) * 100);
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

  return (
    <>
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('milestones.title')}</h1>
          <p className="page-description">{t('milestones.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className={`btn ${showArchived ? 'btn-secondary' : 'btn-ghost'} btn-sm`} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('milestones.active') : t('milestones.archived')}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Download size={16} />
            {t('common.importFromTeam', 'Import from Team')}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingMs(null); setMsForm({ name: '', description: '', deadline: '' }); setShowModal(true); }}>
            <Plus size={16} /> {t('milestones.addMilestone')}
          </button>
        </div>
      </div>

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
            return (
              <div key={ms.id} className="card animate-slide-up">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 4 }}>
                      <h3 className="card-title">{ms.name}</h3>
                      {daysLeft !== null && (
                        <span className={`badge ${daysLeft < 0 ? 'badge-danger' : daysLeft < 7 ? 'badge-warning' : 'badge-info'}`}>
                          {daysLeft < 0 ? t('milestones.overdue') : t('milestones.daysRemaining', { count: daysLeft })}
                        </span>
                      )}
                    </div>
                    {ms.description && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{ms.description}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                    {/* Progress ring */}
                    <svg width="48" height="48" className="progress-ring">
                      <circle className="progress-ring-bg" cx="24" cy="24" r="20" strokeWidth="4" />
                      <circle className="progress-ring-fill" cx="24" cy="24" r="20" strokeWidth="4"
                        strokeDasharray={`${2 * Math.PI * 20}`}
                        strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress / 100)}`}
                        style={{ stroke: progress === 100 ? 'var(--color-secondary)' : 'var(--color-primary)' }}
                      />
                      <text x="24" y="24" textAnchor="middle" dominantBaseline="central"
                        style={{ fill: 'var(--text-primary)', fontSize: '11px', fontWeight: 600, transform: 'rotate(90deg)', transformOrigin: 'center' }}>
                        {progress}%
                      </text>
                    </svg>
                    
                    {!showArchived ? (
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={async () => {
                        if (window.confirm(t('milestones.confirmArchive', { defaultValue: 'このマイルストーンをアーカイブしますか？' }))) {
                          try {
                            await api.put(`/milestones/${ms.id}`, { ...ms, status: 'archived' });
                            addToast('success', t('milestones.archiveSuccess', { defaultValue: 'アーカイブしました' }));
                            fetchMilestones();
                          } catch (e) {
                            addToast('error', t('common.errorOccurred'));
                          }
                        }
                      }}>
                        <CheckCircle2 size={14} style={{ marginRight: 4 }} />{t('milestones.archive', { defaultValue: 'アーカイブ' })}
                      </button>
                    ) : (
                      <button className="btn btn-warning btn-sm" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={async () => {
                        try {
                          await api.put(`/milestones/${ms.id}`, { ...ms, status: 'active' });
                          addToast('success', t('milestones.unarchiveSuccess', { defaultValue: 'アクティブに戻しました' }));
                          fetchMilestones();
                        } catch (e) {
                          addToast('error', t('common.errorOccurred'));
                        }
                      }}>
                        {t('milestones.unarchive', { defaultValue: 'アクティブに戻す' })}
                      </button>
                    )}

                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-info)' }} onClick={() => setShareTarget({ id: ms.id, name: ms.name })} title={t('common.share', 'Share')}><Share2 size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditingMs(ms); setMsForm({ name: ms.name, description: ms.description, deadline: ms.deadline || '' }); setShowModal(true); }}><Edit size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={async () => {
                      if (window.confirm(t('common.confirmDelete', { defaultValue: '本当に削除しますか？' }))) {
                        try {
                          await api.delete(`/milestones/${ms.id}`);
                          addToast('success', t('common.deletedSuccessfully', { defaultValue: '削除しました' }));
                          fetchMilestones();
                        } catch (e) {
                          addToast('error', t('common.errorOccurred'));
                        }
                      }
                    }}><Trash2 size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleExpand(ms.id)}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
                <div className="progress-bar" style={{ marginBottom: 'var(--space-md)' }}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%`, background: progress === 100 ? 'var(--color-secondary)' : undefined }} />
                </div>

                {isExpanded && (
                  <div>
                    {(!ms.items || ms.items.length === 0) ? (
                      <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', padding: 'var(--space-md)' }}>{t('milestones.noItems')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {ms.items.map(item => (
                          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-sm)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-default)', opacity: item.is_completed ? 0.6 : 1 }}>
                            {item.data_type === 'qualitative' || item.data_type === 'task' ? (
                              <button className="checklist-check" onClick={() => toggleItemComplete(item)} style={{ width: 22, height: 22 }}>
                                {item.is_completed && <CheckCircle2 size={14} style={{ color: 'white', opacity: 1 }} />}
                              </button>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => updateItemCount(item, Math.max(0, item.current_count - 1))} disabled={item.current_count <= 0}><MinusCircle size={16} /></button>
                                <span style={{ fontWeight: 600, minWidth: 50, textAlign: 'center' }}>
                                  {item.current_count}/{item.target_count} {item.unit && <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'normal', color: 'var(--text-secondary)' }}>{item.unit}</span>}
                                </span>
                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => updateItemCount(item, item.current_count + 1)}><Plus size={16} /></button>
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                <span style={{ fontSize: 'var(--font-size-sm)', textDecoration: item.is_completed ? 'line-through' : 'none' }}>{item.name}</span>
                                <span className={`badge ${item.data_type === 'qualitative' ? 'badge-primary' : item.data_type === 'quantitative' ? 'badge-info' : 'badge-warning'}`}>
                                  {item.data_type === 'task' ? t('milestones.task', { defaultValue: '作業 (Task)' }) : t(`milestones.${item.data_type}`)}
                                </span>
                              </div>
                              {item.data_type === 'quantitative' && (
                                <div className="progress-bar" style={{ width: 80, marginTop: 4 }}>
                                  <div className="progress-bar-fill" style={{ width: `${Math.min(100, (item.current_count / item.target_count) * 100)}%` }} />
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                                setEditingItem(item);
                                setItemForm({ name: item.name, data_type: item.data_type, target_count: item.target_count || 1, current_count: item.current_count || 0, unit: item.unit || '' });
                                setCurrentMsId(item.milestone_id);
                                setShowItemModal(true);
                              }}><Edit size={14} /></button>
                              <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={async () => {
                                if (window.confirm(t('common.confirmDelete', { defaultValue: '本当に削除しますか？' }))) {
                                  await api.delete(`/milestones/items/${item.id}`); fetchMilestones();
                                }
                              }}><Trash2 size={14} /></button>
                            </div>
                          </div>
                          {/* Sub Items (Available for all data types) */}
                            <div style={{ marginLeft: 'var(--space-xl)', borderLeft: '2px solid var(--border-default)', paddingLeft: 'var(--space-md)' }}>
                              {item.sub_items && item.sub_items.map((sub: any) => (
                                <div key={sub.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-xs)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '4px 0', opacity: sub.is_completed ? 0.6 : 1 }}>
                                    {sub.data_type === 'qualitative' || sub.data_type === 'task' ? (
                                      <button className="checklist-check" onClick={() => toggleSubItemComplete(sub)} style={{ width: 16, height: 16 }}>
                                        {sub.is_completed && <CheckCircle2 size={10} style={{ color: 'white', opacity: 1 }} />}
                                      </button>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => updateSubItemCount(sub, Math.max(0, sub.current_count - 1))} disabled={sub.current_count <= 0}><MinusCircle size={14} /></button>
                                        <span style={{ fontWeight: 600, minWidth: 40, textAlign: 'center', fontSize: 'var(--font-size-xs)' }}>
                                          {sub.current_count}/{sub.target_count} {sub.unit && <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>{sub.unit}</span>}
                                        </span>
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => updateSubItemCount(sub, sub.current_count + 1)}><Plus size={14} /></button>
                                      </div>
                                    )}
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                      <span style={{ fontSize: 'var(--font-size-xs)', textDecoration: sub.is_completed ? 'line-through' : 'none' }}>{sub.name}</span>
                                      <span className={`badge ${sub.data_type === 'qualitative' ? 'badge-primary' : sub.data_type === 'quantitative' ? 'badge-info' : 'badge-warning'}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left' }}>
                                        {sub.data_type === 'task' ? t('milestones.task', { defaultValue: '作業 (Task)' }) : t(`milestones.${sub.data_type}`)}
                                      </span>
                                    </div>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                                      setEditingSubItem(sub);
                                      setSubItemForm({ name: sub.name, data_type: sub.data_type, target_count: sub.target_count || 1, current_count: sub.current_count || 0, unit: sub.unit || '' });
                                      setCurrentParentItemId(item.id);
                                      setShowSubItemModal(true);
                                    }}><Edit size={14} /></button>
                                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)', padding: 2 }} onClick={() => deleteSubItem(sub.id)}><Trash2 size={12} /></button>
                                  </div>
                                  {sub.data_type === 'quantitative' && (
                                    <div className="progress-bar" style={{ width: 60, marginTop: 2, height: 4 }}>
                                      <div className="progress-bar-fill" style={{ width: `${Math.min(100, (sub.current_count / sub.target_count) * 100)}%` }} />
                                    </div>
                                  )}
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 4 }}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => {
                                  setCurrentParentItemId(item.id);
                                  setEditingSubItem(null);
                                  setSubItemForm({ name: '', data_type: 'qualitative', target_count: 1, current_count: 0, unit: '' });
                                  setShowSubItemModal(true);
                                }}>
                                  <Plus size={12} /> {t('milestones.addSubItem', { defaultValue: 'サブタスクを追加' })}
                                </button>
                              </div>
                            </div>
                        </div>
                        ))}
                      </div>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-md)' }} onClick={() => {
                      setCurrentMsId(ms.id); setEditingItem(null); setItemForm({ name: '', data_type: 'qualitative', target_count: 3, current_count: 0, unit: '' }); setShowItemModal(true);
                    }}><Plus size={14} /> {t('milestones.addItem')}</button>
                  </div>
                )}
              </div>
            );
          })}
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
                <input className="form-input" value={msForm.name} onChange={e => setMsForm({ ...msForm, name: e.target.value })} placeholder={t('milestones.milestoneNamePlaceholder')} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={msForm.description} onChange={e => setMsForm({ ...msForm, description: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('milestones.deadline')}</label>
                <input className="form-input" type="date" value={msForm.deadline} onChange={e => setMsForm({ ...msForm, deadline: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleMsSubmit} disabled={!msForm.name.trim()}>{editingMs ? t('common.save') : t('common.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('milestones.addItem')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowItemModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('milestones.itemName')} *</label>
                <input className="form-input" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} placeholder={t('milestones.itemNamePlaceholder')} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{t('milestones.itemType')}</label>
                <select className="form-input" value={itemForm.data_type} onChange={e => setItemForm({ ...itemForm, data_type: e.target.value as any })}>
                  <option value="qualitative">{t('milestones.qualitative')}</option>
                  <option value="quantitative">{t('milestones.quantitative')}</option>
                  <option value="task">{t('milestones.task', { defaultValue: '作業 (Task)' })}</option>
                </select>
              </div>
              {itemForm.data_type === 'quantitative' && (
                <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('milestones.targetCount')}</label>
                    <input className="form-input" type="number" min="1" value={itemForm.target_count} onChange={e => setItemForm({ ...itemForm, target_count: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('milestones.unitLabel', { defaultValue: '単位 (例: kg, ml)' })}</label>
                    <input className="form-input" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} placeholder={t('milestones.unitPlaceholder', { defaultValue: '任意' })} />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowItemModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleItemSubmit} disabled={!itemForm.name.trim()}>{t('common.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* SubItem Modal */}
      {showSubItemModal && (
        <div className="modal-overlay" onClick={() => setShowSubItemModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSubItem ? t('milestones.editSubItem', { defaultValue: 'サブタスクを編集' }) : t('milestones.addSubItem', { defaultValue: 'サブタスクを追加' })}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => { setShowSubItemModal(false); setEditingSubItem(null); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('milestones.itemName')} *</label>
                <input className="form-input" value={subItemForm.name} onChange={e => setSubItemForm({ ...subItemForm, name: e.target.value })} placeholder={t('milestones.subItemNamePlaceholder', { defaultValue: 'サブタスク名' })} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{t('milestones.itemType')}</label>
                <select className="form-input" value={subItemForm.data_type} onChange={e => setSubItemForm({ ...subItemForm, data_type: e.target.value as any })}>
                  <option value="qualitative">{t('milestones.qualitative')}</option>
                  <option value="quantitative">{t('milestones.quantitative')}</option>
                  <option value="task">{t('milestones.task', { defaultValue: '作業 (Task)' })}</option>
                </select>
              </div>
              {subItemForm.data_type === 'quantitative' && (
                <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('milestones.targetCount')}</label>
                    <input className="form-input" type="number" min="1" value={subItemForm.target_count} onChange={e => setSubItemForm({ ...subItemForm, target_count: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('milestones.unitLabel', { defaultValue: '単位 (例: kg, ml)' })}</label>
                    <input className="form-input" value={subItemForm.unit} onChange={e => setSubItemForm({ ...subItemForm, unit: e.target.value })} placeholder={t('milestones.unitPlaceholder', { defaultValue: '任意' })} />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSubItemModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSubItemSubmit} disabled={!subItemForm.name.trim()}>{editingSubItem ? t('common.save') : t('common.create')}</button>
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
