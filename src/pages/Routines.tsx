import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Plus, Trash2, Edit, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';
import type { RoutineTask } from '../types';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export default function Routines() {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  const [routines, setRoutines] = useState<RoutineTask[]>([]);
  const [todayRoutines, setTodayRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RoutineTask | null>(null);
  const [form, setForm] = useState({ name: '', description: '', recurrence: 'daily', recurrence_days: [] as number[], is_active: true, start_date: '', end_date: '' });

  const fetchData = async () => {
    try {
      const [all, today] = await Promise.all([
        api.get<RoutineTask[]>('/routines'),
        api.get<any[]>('/routines/today'),
      ]);
      setRoutines(all);
      setTodayRoutines(today);
    } catch (e) { addToast('error', t('common.errorOccurred')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const completeRoutine = async (id: number) => {
    try {
      await api.post(`/routines/${id}/complete`);
      addToast('success', t('common.done'));
      fetchData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        await api.put(`/routines/${editing.id}`, form);
      } else {
        await api.post('/routines', form);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowModal(false); setEditing(null);
      setForm({ name: '', description: '', recurrence: 'daily', recurrence_days: [], is_active: true, start_date: '', end_date: '' });
      fetchData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const deleteRoutine = async (id: number) => {
    try {
      await api.delete(`/routines/${id}`);
      addToast('success', t('common.deletedSuccessfully'));
      fetchData();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const completedCount = todayRoutines.filter(r => r.completed_today).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('routines.title')}</h1>
          <p className="page-description">{t('routines.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => {
            setEditing(null); setForm({ name: '', description: '', recurrence: 'daily', recurrence_days: [], is_active: true, start_date: '', end_date: '' }); setShowModal(true);
          }}><Plus size={16} /> {t('routines.addRoutine')}</button>
        </div>
      </div>

      {/* Today's Routines */}
      {todayRoutines.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="card-header">
            <h3 className="card-title">{t('routines.todayRoutines')}</h3>
            <span className="badge badge-primary">{t('routines.completedCount', { completed: completedCount, total: todayRoutines.length })}</span>
          </div>
          {completedCount === todayRoutines.length && todayRoutines.length > 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--color-secondary)', fontWeight: 'var(--font-weight-semibold)' }}>
              ✨ {t('routines.allCompleted')}
            </div>
          )}
          <div className="checklist">
            {todayRoutines.map((r: any) => (
              <div key={r.id} className={`checklist-item ${r.completed_today ? 'completed' : ''}`}
                onClick={() => !r.completed_today && completeRoutine(r.id)} style={{ cursor: r.completed_today ? 'default' : 'pointer' }}>
                <button className="checklist-check">
                  {r.completed_today && <CheckCircle2 size={14} />}
                </button>
                <span className="checklist-text">{r.name}</span>
                {r.description && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{r.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Routines */}
      <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)' }}>{t('common.all')} ({routines.length})</h3>
      {routines.length === 0 ? (
        <div className="empty-state">
          <RotateCcw size={64} />
          <h3 className="empty-state-title">{t('routines.noRoutines')}</h3>
          <p className="empty-state-description">{t('routines.noRoutinesDesc')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {routines.map(r => (
            <div key={r.id} className="card" style={{ padding: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)', opacity: r.is_active ? 1 : 0.5 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{r.description}</div>}
                {(r.start_date || r.end_date) && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', marginTop: 4 }}>
                    {r.start_date ? r.start_date : '指定なし'} 〜 {r.end_date ? r.end_date : '指定なし'}
                  </div>
                )}
              </div>
              <span className="badge badge-info">{t(`routines.${r.recurrence}`)}</span>
              <span className={`badge ${r.is_active ? 'badge-success' : 'badge-warning'}`}>
                {r.is_active ? t('routines.active') : t('routines.inactive')}
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                setEditing(r); setForm({ name: r.name, description: r.description, recurrence: r.recurrence, recurrence_days: r.recurrence_days ? JSON.parse(r.recurrence_days as any) : [], is_active: !!r.is_active, start_date: r.start_date || '', end_date: r.end_date || '' }); setShowModal(true);
              }}><Edit size={14} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteRoutine(r.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? t('routines.editRoutine') : t('routines.addRoutine')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('routines.routineName')} *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('routines.routineNamePlaceholder')} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('routines.recurrence')}</label>
                <select className="form-select" value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}>
                  <option value="daily">{t('routines.daily')}</option>
                  <option value="weekdays">{t('routines.weekdays')}</option>
                  <option value="custom">{t('routines.custom')}</option>
                </select>
              </div>
              {form.recurrence === 'custom' && (
                <div className="form-group">
                  <label className="form-label">{t('routines.selectDays')}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                    {DAY_KEYS.map((d, i) => (
                      <label key={i} className="form-checkbox" style={{ display: 'inline-flex', marginRight: 10 }}>
                        <input type="checkbox" checked={form.recurrence_days.includes(i)} onChange={e => {
                          const next = e.target.checked ? [...form.recurrence_days, i] : form.recurrence_days.filter(x => x !== i);
                          setForm({ ...form, recurrence_days: next });
                        }} />
                        <span>{t(`common.days.${d}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">開始日 (任意)</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">終了日 (任意)</label>
                  <input type="date" className="form-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <label className="form-checkbox">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                <span>{t('routines.active')}</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim()}>{editing ? t('common.save') : t('common.create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
