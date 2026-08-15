import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, RotateCcw, Target, Package, CheckCircle2, Calendar, AlertTriangle, ArrowRight, MessageSquare, Plus, Link as LinkIcon, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  const navigate = useNavigate();
  const [todayBlocks, setTodayBlocks] = useState<any[]>([]);
  const [todayRoutines, setTodayRoutines] = useState<any[]>([]);
  const [overdueBlocks, setOverdueBlocks] = useState<any[]>([]);
  const [overdueRoutines, setOverdueRoutines] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [miniMemos, setMiniMemos] = useState<any[]>([]);
  const [memoText, setMemoText] = useState('');
  const [stats, setStats] = useState({ experiments: 0, routines: 0, milestones: 0, alerts: 0, routinesTotal: 0 });
  const [showPostponeModal, setShowPostponeModal] = useState<{ stepId: number, expId: number, scheduledDate: string } | null>(null);
  const [postponeDate, setPostponeDate] = useState('');
  const [postponeTime, setPostponeTime] = useState('');
  const [quickLinks, setQuickLinks] = useState<any[]>([]);
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [linkForm, setLinkForm] = useState<{ id?: number, title: string, url: string, open_in_app: boolean }>({ title: '', url: '', open_in_app: false });
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [blocks, routines, ms, reagentAlerts, memos, links, oBlocks, oRoutines] = await Promise.all([
        api.get<any[]>('/schedule/today'),
        api.get<any[]>('/routines/today'),
        api.get<any[]>('/milestones?status=active'),
        api.get<any[]>('/reagents/alerts'),
        api.get<any[]>('/mini_memos'),
        api.get<any[]>('/quick_links'),
        api.get<any[]>('/schedule/overdue'),
        api.get<any[]>('/routines/overdue'),
      ]);
      setTodayBlocks(blocks);
      setTodayRoutines(routines);
      setMilestones(ms);
      setAlerts(reagentAlerts);
      setMiniMemos(memos);
      setQuickLinks(links);
      setOverdueBlocks(oBlocks);
      setOverdueRoutines(oRoutines);
      
      setStats({
        experiments: blocks.length,
        routines: routines.filter((r: any) => r.is_completed).length,
        routinesTotal: routines.length,
        milestones: ms.length,
        alerts: reagentAlerts.length + oBlocks.length + oRoutines.length
      });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleRoutine = async (routine: any) => {
    try {
      if (routine.completed_today) {
        await api.put(`/routines/${routine.id}/incomplete`);
      } else {
        await api.post(`/routines/${routine.id}/complete`, { date: getLocalTodayStr() });
        addToast('success', t('common.done'));
      }
      loadData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const completeOverdueRoutine = async (routineId: number, missedDate: string) => {
    try {
      await api.post(`/routines/${routineId}/complete`, { date: missedDate });
      addToast('success', t('common.done'));
      loadData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const getLocalTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const completeBlock = async (id: number) => {
    try {
      await api.put(`/schedule/blocks/${id}/complete`);
      addToast('success', t('common.done'));
      loadData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const toggleStep = async (step: any) => {
    try {
      if (step.status === 'completed') {
        await api.put(`/schedule/steps/${step.id}/incomplete`);
      } else {
        await api.put(`/schedule/steps/${step.id}/complete`);
      }
      loadData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const togglePreparation = async (prep: any) => {
    try {
      if (prep.is_completed) {
        await api.put(`/schedule/preparations/${prep.id}/incomplete`);
      } else {
        await api.put(`/schedule/preparations/${prep.id}/complete`);
      }
      loadData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const handlePostpone = async () => {
    if (!showPostponeModal || !postponeDate) return;
    try {
      const { stepId, expId, scheduledDate } = showPostponeModal;
      if (postponeDate === scheduledDate) {
        await api.put(`/schedule/steps/${stepId}/time`, {
          start_time: postponeTime,
          end_time: postponeTime
        });
      } else {
        await api.post(`/schedule/${expId}/postpone`, {
           step_id: stepId,
           target_date: postponeDate,
           target_time: postponeTime
        });
      }
      addToast('success', t('common.savedSuccessfully', '保存しました'));
      setShowPostponeModal(null);
      loadData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const handleAddMemo = async () => {
    if (!memoText.trim()) return;
    try {
      await api.post('/mini_memos', { message: memoText });
      setMemoText('');
      loadData();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleCompleteMemo = async (id: number) => {
    try {
      await api.put(`/mini_memos/${id}/complete`, {});
      loadData();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleSaveLink = async () => {
    if (!linkForm.title || !linkForm.url) return;
    try {
      if (linkForm.id) {
        await api.put(`/quick_links/${linkForm.id}`, linkForm);
      } else {
        await api.post('/quick_links', linkForm);
      }
      setShowAddLinkModal(false);
      setLinkForm({ title: '', url: '', open_in_app: false });
      loadData();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };
  
  const handleDeleteLink = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t('common.confirmDelete', { defaultValue: '本当に削除しますか？' }))) return;
    try {
      await api.delete(`/quick_links/${id}`);
      loadData();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleEditLink = (link: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setLinkForm({ id: link.id, title: link.title, url: link.url, open_in_app: link.open_in_app === 1 || link.open_in_app === true });
    setShowAddLinkModal(true);
  };

  const handleLinkClick = (link: any) => {
    if (link.open_in_app) {
      setIframeUrl(link.url);
    } else {
      window.open(link.url, '_blank');
    }
  };

  const getMilestoneProgress = (ms: any) => {
    if (!ms.items || ms.items.length === 0) return 0;
    const completed = ms.items.filter((i: any) => i.is_completed).length;
    return Math.round((completed / ms.items.length) * 100);
  };

  const getDaysRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-description">{t('dashboard.greeting')}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card" onClick={() => navigate('/calendar')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-primary"><FlaskConical size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.experiments}</div>
            <div className="stat-label">{t('dashboard.statsExperiments')}</div>
          </div>
        </div>
        <div className="stat-card" onClick={() => navigate('/routines')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-success"><RotateCcw size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.routines}/{stats.routinesTotal}</div>
            <div className="stat-label">{t('dashboard.statsRoutines')}</div>
          </div>
        </div>
        <div className="stat-card" onClick={() => navigate('/milestones')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-warning"><Target size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.milestones}</div>
            <div className="stat-label">{t('dashboard.statsMilestones')}</div>
          </div>
        </div>
        <div className="stat-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-danger"><Package size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.alerts}</div>
            <div className="stat-label">{t('dashboard.statsAlerts')}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
        {/* Today's Experiments */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.todaySchedule')}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/calendar')}><ArrowRight size={16} /></button>
          </div>
          {todayBlocks.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('dashboard.noExperiments')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {todayBlocks.map((block: any) => (
                <div key={block.id} style={{ padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-default)', borderLeft: `4px solid ${block.color || 'var(--color-primary)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>{block.experiment_type_name}{block.label ? ` - ${block.label}` : ''}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{block.block_name}</div>
                    </div>
                    {block.mode === 'management' && block.status !== 'completed' && (
                      <button className="btn btn-success btn-sm" onClick={() => completeBlock(block.id)}>
                        <CheckCircle2 size={14} /> {t('common.done')}
                      </button>
                    )}
                    {block.status === 'completed' && (
                      <span className="badge badge-success">{t('common.completed')}</span>
                    )}
                  </div>
                  {block.steps && block.steps.length > 0 && block.mode === 'management' && (
                    <div style={{ marginTop: 'var(--space-sm)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--border-default)' }}>
                      {block.steps.map((step: any) => (
                        <div key={step.id}>
                          <div className={`checklist-item ${step.status === 'completed' ? 'completed' : ''}`} style={{ padding: '4px 0', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                            <button className={`checklist-check`} style={{ width: 18, height: 18 }} onClick={() => toggleStep(step)}>
                              {step.status === 'completed' && <CheckCircle2 size={12} />}
                            </button>
                            <span className="checklist-text" style={{ fontSize: 'var(--font-size-xs)', flex: 1 }}>
                              {step.start_time} - {step.end_time} : {step.step_name} ({step.is_overnight === 1 ? 'Overnight' : `${step.duration_minutes}min`})
                            </span>
                            {step.status !== 'completed' && (
                              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={(e) => {
                                e.stopPropagation();
                                setShowPostponeModal({ stepId: step.id, expId: block.scheduled_experiment_id, scheduledDate: block.scheduled_date });
                                setPostponeDate(block.scheduled_date);
                                setPostponeTime(step.start_time);
                              }}>
                                {t('common.postpone', '延期')}
                              </button>
                            )}
                          </div>
                          {step.preparations && step.preparations.length > 0 && (
                            <div style={{ marginLeft: 'var(--space-xl)', marginBottom: 'var(--space-xs)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {step.preparations.map((prep: any) => (
                                <div key={prep.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: '10px', color: prep.is_completed ? 'var(--text-tertiary)' : 'var(--color-warning)' }}>
                                  <AlertTriangle size={10} />
                                  <span style={{ textDecoration: prep.is_completed ? 'line-through' : 'none', flex: 1 }}>
                                    {prep.message} 
                                    {prep.timing_type === 'before_experiment' && ` (${prep.timing_offset_minutes}分前)`}
                                  </span>
                                  {prep.requires_check === 1 && (
                                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px', fontSize: '10px' }} onClick={() => togglePreparation(prep)}>
                                      {prep.is_completed ? '取消' : '確認'}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Routines */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.todayRoutines')}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/routines')}><ArrowRight size={16} /></button>
          </div>
          {todayRoutines.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('dashboard.noRoutines')}</p>
          ) : (
            <div className="checklist">
              {todayRoutines.map((routine: any) => (
                <div key={routine.id} className={`checklist-item ${routine.completed_today ? 'completed' : ''}`}
                  onClick={() => toggleRoutine(routine)}>
                  <button className="checklist-check">
                    {routine.completed_today && <CheckCircle2 size={14} />}
                  </button>
                  <span className="checklist-text">{routine.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue Items Alert */}
      {(overdueBlocks.length > 0 || overdueRoutines.length > 0) && (
        <div className="card" style={{ marginBottom: 'var(--space-lg)', borderLeft: '4px solid var(--color-danger)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: 'var(--color-danger)' }}>
              <AlertTriangle size={18} style={{ marginRight: 8 }} />
              {t('dashboard.overdueItems', { defaultValue: '期限切れの未完了タスク' })}
            </h3>
          </div>
          <div className="checklist">
            {overdueRoutines.map((routine: any, idx: number) => (
              <div key={`or-${routine.id}-${idx}`} className="checklist-item" style={{ background: 'var(--color-danger-dim)', borderColor: 'var(--color-danger-dim)', border: '1px solid var(--color-danger)' }}>
                <button className="checklist-check" onClick={() => completeOverdueRoutine(routine.id, routine.missed_date)} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="checklist-text" style={{ color: 'var(--text-primary)' }}>{routine.name}</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>{routine.missed_date} のルーティン</span>
                </div>
              </div>
            ))}
            {overdueBlocks.map((block: any, idx: number) => (
              <div key={`ob-${block.id}-${idx}`} className="checklist-item" style={{ background: 'var(--color-danger-dim)', borderColor: 'var(--color-danger-dim)', border: '1px solid var(--color-danger)' }}>
                <button className="checklist-check" onClick={() => completeBlock(block.id)} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="checklist-text" style={{ color: 'var(--text-primary)' }}>{block.label ? `${block.label} - ` : ''}{block.experiment_type_name} ({block.block_name})</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>{block.scheduled_date} の予定</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-2">
        {/* Milestone Progress */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.milestoneProgress')}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/milestones')}><ArrowRight size={16} /></button>
          </div>
          {milestones.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('dashboard.noMilestones')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {milestones.slice(0, 3).map((ms: any) => {
                const progress = getMilestoneProgress(ms);
                const daysLeft = getDaysRemaining(ms.deadline);
                return (
                  <div key={ms.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{ms.name}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: daysLeft !== null && daysLeft < 0 ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
                        {daysLeft !== null ? (daysLeft < 0 ? t('milestones.overdue') : t('milestones.daysRemaining', { count: daysLeft })) : ''}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{progress}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Inventory Alerts */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.inventoryAlerts')}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}><ArrowRight size={16} /></button>
          </div>
          {alerts.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('dashboard.noAlerts')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {alerts.slice(0, 5).map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-danger-dim)' }}>
                  <AlertTriangle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--font-size-sm)', flex: 1 }}>{a.name}</span>
                  <span className="badge badge-danger">{a.is_depleted ? t('inventory.depleted') : t('inventory.lowStock')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mini Memos */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><MessageSquare size={16} style={{ marginRight: 8 }} />{t('dashboard.miniMemosTitle', { defaultValue: 'ミニミニメモ' })}</h3>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder={t('dashboard.miniMemosPlaceholder', { defaultValue: '頼まれごとなどを入力...' })} 
              value={memoText} 
              onChange={e => setMemoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMemo(); }}
            />
            <button className="btn btn-primary" onClick={handleAddMemo} disabled={!memoText.trim()}>
              <Plus size={16} />
            </button>
          </div>
          {miniMemos.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('dashboard.noMiniMemos', { defaultValue: '未完了のメモはありません' })}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {miniMemos.map((memo: any) => (
                <div key={memo.id} className="checklist-item" style={{ padding: '8px', border: '1px solid var(--color-info-dim)', borderLeft: '3px solid var(--color-info)' }}>
                  <button className="checklist-check" onClick={() => handleCompleteMemo(memo.id)}>
                    {memo.is_completed && <CheckCircle2 size={14} />}
                  </button>
                  <span className="checklist-text" style={{ fontSize: 'var(--font-size-sm)' }}>{memo.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Quick Links */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><LinkIcon size={16} style={{ marginRight: 8 }} />{t('dashboard.quickLinksTitle', { defaultValue: 'リンク集' })}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => { setLinkForm({ title: '', url: '', open_in_app: false }); setShowAddLinkModal(true); }}><Plus size={16} /></button>
          </div>
          {quickLinks.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('dashboard.noQuickLinks', { defaultValue: '登録されているリンクはありません。' })}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {quickLinks.map((link: any) => (
                <div key={link.id} onClick={() => handleLinkClick(link)} className="checklist-item" style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <ExternalLink size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.title}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-icon" onClick={(e) => handleEditLink(link, e)} style={{ padding: '4px', opacity: 0.5 }}>
                      <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button className="btn-icon" onClick={(e) => handleDeleteLink(link.id, e)} style={{ padding: '4px', opacity: 0.5 }}>
                      <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPostponeModal && (
        <div className="modal-overlay" onClick={() => setShowPostponeModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('experiments.postponeSteps', 'これ以降のステップを延期')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPostponeModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('experiments.targetDate', '延期先日付')}</label>
                <input type="date" className="form-input" value={postponeDate} onChange={e => setPostponeDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                <label className="form-label">{t('experiments.targetTime', '延期先時刻')}</label>
                <input type="time" className="form-input" value={postponeTime} onChange={e => setPostponeTime(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPostponeModal(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handlePostpone} disabled={!postponeDate}>{t('common.confirm', '確定')}</button>
            </div>
          </div>
        </div>
      )}

      {showAddLinkModal && (
        <div className="modal-overlay" onClick={() => setShowAddLinkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{linkForm.id ? t('dashboard.editQuickLink', { defaultValue: 'リンクを編集' }) : t('dashboard.addQuickLink', { defaultValue: 'リンクを追加' })}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddLinkModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-md)' }}>
                {t('dashboard.addQuickLinkDesc', { defaultValue: 'Google Spreadsheetsなどの外部サイトへのリンクを追加します。' })}
              </p>
              <div className="form-group">
                <label className="form-label">{t('dashboard.linkTitle', { defaultValue: 'タイトル' })} *</label>
                <input className="form-input" value={linkForm.title} onChange={e => setLinkForm({ ...linkForm, title: e.target.value })} placeholder={t('dashboard.linkTitlePlaceholder', { defaultValue: '例: 試薬在庫スプレッドシート' })} />
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                <label className="form-label">{t('dashboard.linkUrl', { defaultValue: 'URL' })} *</label>
                <input className="form-input" value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })} placeholder={t('dashboard.linkUrlPlaceholder', { defaultValue: '例: https://docs.google.com/spreadsheets/...' })} />
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="open-in-app" 
                  checked={linkForm.open_in_app} 
                  onChange={e => setLinkForm({ ...linkForm, open_in_app: e.target.checked })} 
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="open-in-app" style={{ margin: 0, fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>
                  {t('dashboard.openInApp', { defaultValue: 'LabFlow内で開く (モーダル表示)' })}
                </label>
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px', marginLeft: '26px' }}>
                {t('dashboard.openInAppDesc', { defaultValue: 'LabFlowの画面内に埋め込んで開きます。Google Docs等におすすめです。※一部のサイトは埋め込み表示を拒否する設定になっています。' })}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddLinkModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSaveLink} disabled={!linkForm.title || !linkForm.url}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {iframeUrl && (
        <div className="modal-overlay" style={{ zIndex: 9999, padding: 'var(--space-lg)' }}>
          <div className="modal" style={{ width: '100%', maxWidth: '1200px', height: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ExternalLink size={18} /> {quickLinks.find(l => l.url === iframeUrl)?.title || 'Link Preview'}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => window.open(iframeUrl, '_blank')}>
                  <ExternalLink size={14} style={{ marginRight: '4px' }} /> 別タブで開く
                </button>
                <button className="btn btn-ghost btn-icon" onClick={() => setIframeUrl(null)}>×</button>
              </div>
            </div>
            <div className="modal-body" style={{ flex: 1, padding: 0 }}>
              <iframe src={iframeUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="External Link Preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
