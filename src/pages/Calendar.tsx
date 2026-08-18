import { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Trash2, CalendarDays } from 'lucide-react';
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../calendar-overrides.css';
import CustomAgendaView from '../components/CustomAgendaView';

import { api } from '../api/client';
import { ToastContext } from '../App';

const locales = {
  'en': enUS,
  'ja': ja,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { addToast } = useContext(ToastContext);
  const [events, setEvents] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  
  // Calendar View State
  const [currentView, setCurrentView] = useState<any>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  
  const [selectedStep, setSelectedStep] = useState<any>(null);
  const [showStepModal, setShowStepModal] = useState(false);
  const [postponeTime, setPostponeTime] = useState<string>('');
  
  // Event Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '',
    end_time: '',
    color: '#3B82F6'
  });

  const [protocols, setProtocols] = useState<any[]>([]);
  const [scheduleForm, setScheduleForm] = useState({
    sample_count: 1,
    protocol_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    mode: 'management',
    label: '',
    notes: '',
    color: '#3B82F6'
  });
  const [blockStartTimes, setBlockStartTimes] = useState<Record<number, string>>({});
  const selectedProtocol = useMemo(() => protocols.find(p => p.id === Number(scheduleForm.protocol_id)), [protocols, scheduleForm.protocol_id]);
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    fetchProtocols();
    fetchData();
  }, []);

  const fetchProtocols = async () => {
    try {
      const data = await api.get<any[]>('/experiments/all/protocols');
      setProtocols(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    try {
      const [blocksData, msData, holidaysData, userEvents, notesData] = await Promise.all([
        api.get<any[]>('/schedule/blocks'),
        api.get<any[]>('/milestones?status=active'),
        api.get<any[]>('/settings/holidays'),
        api.get<any[]>('/events'),
        api.get<any[]>('/notebook')
      ]);

      const newEvents: any[] = [];
      
      blocksData.forEach((b: any) => {
        const blockStart = new Date(`${b.scheduled_date}T${b.start_time || '09:00'}:00`);
        const blockEnd = new Date(`${b.end_date || b.scheduled_date}T${b.end_time || '10:00'}:00`);
        
        // Also keep an all-day version of end date for month view
        const blockEndAllDay = new Date(`${b.end_date || b.scheduled_date}T00:00:00`);
        blockEndAllDay.setDate(blockEndAllDay.getDate() + 1);
        
        newEvents.push({
          id: `block-${b.id}`,
          title: `${b.experiment_type_name} ${b.label ? '('+b.label+')' : ''}`,
          start: blockStart,
          end: blockEnd,
          _allDayEnd: blockEndAllDay, // Store this for month view swap
          allDay: true,
          resource: b,
          type: 'block',
          color: b.color || 'var(--color-primary)'
        });
        
        if (b.steps) {
          b.steps.forEach((s: any) => {
             const startDateStr = s.start_date || b.scheduled_date;
             const endDateStr = s.end_date || b.scheduled_date;
             const sStart = new Date(`${startDateStr}T${s.start_time || '09:00'}:00`);
             let sEnd = new Date(`${endDateStr}T${s.end_time || '10:00'}:00`);
             
             // If overnight but the backend hasn't supplied end_date, fallback logic
             if (s.is_overnight === 1 && !s.end_date) {
                const nextBlock = blocksData.find((nb: any) => nb.scheduled_experiment_id === b.scheduled_experiment_id && nb.scheduled_date > b.scheduled_date);
                if (nextBlock) {
                  sEnd = new Date(`${nextBlock.scheduled_date}T${nextBlock.start_time || '09:00'}:00`);
                } else {
                  sEnd.setDate(sEnd.getDate() + 1);
                  sEnd.setHours(9, 0, 0, 0);
                }
             }
             
             newEvents.push({
                id: `step-${s.id}`,
                title: `${s.step_name} (${b.experiment_type_name})`,
                start: sStart,
                end: sEnd,
                allDay: false,
                resource: { ...s, block_id: b.id, experiment_id: b.scheduled_experiment_id, scheduled_date: b.scheduled_date },
                type: 'step',
                color: b.color || 'var(--color-primary)'
             });
          });
        }
      });

      msData.forEach((m: any) => {
        if (!m.deadline) return;
        const msEnd = new Date(m.deadline + 'T00:00:00');
        msEnd.setDate(msEnd.getDate() + 1);
        newEvents.push({
          id: `ms-${m.id}`,
          title: m.name,
          start: new Date(m.deadline + 'T00:00:00'),
          end: msEnd,
          allDay: true,
          type: 'milestone'
        });
      });

      holidaysData.forEach((h: any) => {
        if (!h.date && !h.recurring) return;
        const date = h.date ? new Date(h.date + 'T00:00:00') : new Date();
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        newEvents.push({
          id: `hol-${h.id}`,
          title: h.label || t('settings.holiday', 'Holiday'),
          start: date,
          end: endDate,
          allDay: true,
          type: 'holiday'
        });
      });

      userEvents.forEach((ev: any) => {
        if (!ev.date) return;
        
        let eStart, eEnd;
        if (ev.is_all_day === 1) {
          eStart = new Date(ev.date + 'T00:00:00');
          eEnd = new Date(ev.date + 'T00:00:00');
          eEnd.setDate(eEnd.getDate() + 1); // Exclusive end for allDay
        } else {
          eStart = new Date(`${ev.date}T${ev.start_time || '09:00'}:00`);
          eEnd = new Date(`${ev.date}T${ev.end_time || '10:00'}:00`);
        }

        newEvents.push({
          id: `event-${ev.id}`,
          title: ev.title,
          start: eStart,
          end: eEnd,
          allDay: ev.is_all_day === 1,
          type: 'event',
          resource: ev,
          color: ev.color || 'var(--color-primary)'
        });
      });

      notesData.forEach((note: any) => {
        if (!note.date) return;
        const noteStart = new Date(note.date + 'T00:00:00');
        const noteEnd = new Date(note.date + 'T00:00:00');
        noteEnd.setDate(noteEnd.getDate() + 1);
        
        newEvents.push({
          id: `note-${note.id}`,
          title: `📝 ${note.title}`,
          start: noteStart,
          end: noteEnd,
          allDay: true,
          type: 'note',
          resource: note,
          color: '#10b981' // emerald color for notes
        });
      });

      setEvents(newEvents);
      setBlocks(blocksData);
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.protocol_id) {
      addToast('warning', t('calendar.selectProtocolWarning', 'プロトコルを選択してください'));
      return;
    }
    
    try {
      const result = await api.post<any>('/schedule', {
        ...scheduleForm,
        protocol_id: Number(scheduleForm.protocol_id),
        block_start_times: blockStartTimes
      });
      addToast('success', t('calendar.scheduleSuccess', '実験をスケジュールしました'));
      
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((w: string) => addToast('warning', w));
      }
      
      setShowScheduleModal(false);
      setScheduleForm({ ...scheduleForm, protocol_id: '', label: '', notes: '', color: '#3B82F6', sample_count: 1 });
      setBlockStartTimes({});
      fetchData();
    } catch (e) {
      addToast('error', t('common.errorOccurred', 'エラーが発生しました。'));
    }
  };

  const handleDeleteExperiment = async () => {
    if (!selectedBlock) return;
    if (window.confirm(t('calendar.confirmDeleteExp', 'この実験計画全体（全日程のブロック）を削除しますか？'))) {
      try {
        const expId = selectedBlock.scheduled_experiment_id || selectedBlock.experiment_id;
        await api.delete(`/schedule/${expId}`);
        addToast('success', t('common.deletedSuccessfully', '削除しました'));
        setShowScheduleModal(false);
        fetchData();
      } catch (e) {
        addToast('error', t('common.errorOccurred'));
      }
    }
  };

  const handleRescheduleBlock = async () => {
    if (!selectedBlock || !rescheduleDate) return;
    try {
      await api.post(`/schedule/${selectedBlock.scheduled_experiment_id}/delay`, {
        block_id: selectedBlock.id,
        new_date: rescheduleDate
      });
      addToast('success', t('calendar.rescheduleSuccess', 'ブロックを再割り当てし、以降のスケジュールを自動調整しました'));
      setSelectedBlock(null);
      setRescheduleDate('');
      fetchData();
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleSelectEvent = (event: any) => {
    if (event.type === 'block') {
      setSelectedBlock(event.resource);
      setRescheduleDate(event.resource.scheduled_date);
      setEditColor(event.resource.color || event.color || '#3B82F6');
    } else if (event.type === 'step') {
      setSelectedStep(event.resource);
      setRescheduleDate(event.resource.scheduled_date);
      setPostponeTime(event.resource.start_time);
      setShowStepModal(true);
    } else if (event.type === 'event') {
      setEditingEvent(event.resource);
      setEventForm({
        title: event.resource.title,
        description: event.resource.description || '',
        date: event.resource.date,
        start_time: event.resource.start_time || '',
        end_time: event.resource.end_time || '',
        color: event.resource.color || '#3B82F6'
      });
      setShowEventModal(true);
    } else if (event.type === 'note') {
      navigate('/notebook?id=' + event.resource.id);
    } else if (event.type === 'holiday') {
      if (window.confirm(t('common.confirmDelete', '削除しますか？'))) {
        // Id prefix is 'hol-123'
        const id = String(event.id).replace('hol-', '');
        api.delete(`/settings/holidays/${id}`)
          .then(() => {
            addToast('success', t('common.deletedSuccessfully', '削除しました'));
            fetchData();
          })
          .catch(() => {
            addToast('error', t('common.errorOccurred', 'エラーが発生しました'));
          });
      }
    }
  };

  const handleSelectSlot = async (slotInfo: any) => {
    const dateStr = format(slotInfo.start, 'yyyy-MM-dd');
    
    // Add simple choice via prompt/confirm
    const action = window.prompt(t('calendar.slotAction', 'この日に追加する項目を選んでください:\n1: 休日\n2: イベント\n3: 実験ノート\n(1〜3を入力)'), '2');
    
    if (action === '1') {
      const label = window.prompt(t('calendar.addHolidayPrompt', '休日名を入力してください（任意）:'));
      if (label !== null) {
        try {
          await api.post('/settings/holidays', { date: dateStr, label, recurring: false });
          addToast('success', t('common.savedSuccessfully', '保存しました'));
          fetchData();
        } catch (e) {
          addToast('error', t('common.errorOccurred'));
        }
      }
    } else if (action === '2') {
      setEditingEvent(null);
      setEventForm({
        title: '',
        description: '',
        date: dateStr,
        start_time: '',
        end_time: '',
        color: '#3B82F6'
      });
      setShowEventModal(true);
    } else if (action === '3') {
      navigate('/notebook?date=' + dateStr);
    }
  };
  
  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title || !eventForm.date) return;
    try {
      let result;
      if (editingEvent) {
        result = await api.put<any>(`/events/${editingEvent.id}`, eventForm);
      } else {
        result = await api.post<any>('/events', eventForm);
      }
      
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((w: string) => addToast('warning', w));
      } else {
        addToast('success', t('common.savedSuccessfully', '保存しました'));
      }
      
      setShowEventModal(false);
      fetchData();
    } catch (err: any) {
      addToast('error', err.message || t('common.errorOccurred'));
    }
  };
  
  const handleDeleteEvent = async () => {
    if (!editingEvent || !window.confirm(t('common.confirmDelete', '削除しますか？'))) return;
    try {
      const result = await api.delete<any>(`/events/${editingEvent.id}`);
      
      if (result && result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((w: string) => addToast('warning', w));
      } else {
        addToast('success', t('common.deletedSuccessfully', '削除しました'));
      }
      
      setShowEventModal(false);
      fetchData();
    } catch (err: any) {
      addToast('error', err.message || t('common.errorOccurred'));
    }
  };

  const eventStyleGetter = (event: any) => {
    if (event.type === 'milestone') {
      return { style: { backgroundColor: 'var(--color-warning)', color: 'white', border: 'none' } };
    }
    if (event.type === 'holiday') {
      return { style: { backgroundColor: 'var(--color-danger)', color: 'white', border: 'none' } };
    }
    if (event.color) {
      return {
        style: {
          backgroundColor: event.color,
          border: 'none',
          color: 'white',
          opacity: event.type === 'block' || event.type === 'step' ? 0.8 : 1,
        }
      };
    }
    return {};
  };

  const visibleEvents = useMemo(() => {
    let filtered = events;
    if (currentView === 'month') {
      filtered = events.filter(e => e.type !== 'step');
    } else {
      // Show steps, milestones, holidays, notes in week/day/agenda views, but HIDE blocks
      filtered = events.filter(e => e.type !== 'block');
      // Hide notes in agenda view
      if (currentView === 'agenda') {
        filtered = filtered.filter(e => e.type !== 'note');
      }
    }

    return filtered.map(e => {
      if (e.type === 'block') {
        if (currentView === 'month') {
          return {
            ...e,
            allDay: true,
            start: new Date(`${e.resource.scheduled_date}T00:00:00`),
            end: e._allDayEnd
          };
        } else {
          return {
            ...e,
            allDay: false
          };
        }
      }
      return e;
    });
  }, [events, currentView]);

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 'var(--space-md)' }}>
        <div>
          <h1 className="page-title">{t('calendar.title', 'カレンダー')}</h1>
          <p className="page-description">{t('calendar.subtitle', 'スケジュールされた実験やイベントの確認')}</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <button className="btn btn-secondary" onClick={() => {
            setEditingEvent(null);
            setEventForm({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), start_time: '', end_time: '', color: '#3B82F6' });
            setShowEventModal(true);
          }}>
            <Plus size={18} />
            イベントを追加
          </button>
          <button className="btn btn-primary" onClick={() => setShowScheduleModal(true)}>
            <Plus size={18} />
            {t('calendar.scheduleExperiment', '実験をスケジュール')}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-md)', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <BigCalendar
          localizer={localizer}
          events={visibleEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ flex: 1 }}
          views={{ month: true, week: true, day: true, agenda: CustomAgendaView }}
          view={currentView}
          showMultiDayTimes={true}
          onView={setCurrentView}
          date={currentDate}
          onNavigate={setCurrentDate}
          selectable={true}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          culture={i18n.language.startsWith('ja') ? 'ja' : 'en'}
          step={10}
          timeslots={6}
          dayLayoutAlgorithm="no-overlap"
          popup
        />
      </div>

      {showScheduleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 500, margin: 'var(--space-md)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <h2 className="card-title">{t('calendar.scheduleExperimentTitle', '実験をカレンダーに追加')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowScheduleModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSchedule} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', padding: 'var(--space-md)', overflowY: 'auto' }}>
              <div>
                <label className="form-label">{t('calendar.protocol', 'プロトコル')}</label>
                <select 
                  className="form-input" 
                  value={scheduleForm.protocol_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const p = protocols.find(x => x.id === Number(id));
                    setScheduleForm({...scheduleForm, protocol_id: id, color: p?.color || p?.experiment_type_color || '#3B82F6'});
                    if (p && p.blocks) {
                      const initialTimes: Record<number, string> = {};
                      p.blocks.forEach((blk: any) => initialTimes[blk.id] = '09:00');
                      setBlockStartTimes(initialTimes);
                    }
                  }}
                  required
                >
                  <option value="">{t('calendar.selectProtocol', '-- プロトコルを選択 --')}</option>
                  {protocols.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.experiment_type_name ? `(${p.experiment_type_name})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('calendar.startDate', '開始日')}</label>
                  <input 
                    type="date" 
                    className="form-input"
                    value={scheduleForm.start_date}
                    onChange={(e) => setScheduleForm({...scheduleForm, start_date: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              {selectedProtocol?.has_sample_dependent_steps && (
                <div className="form-group">
                  <label className="form-label">サンプル数 (Sample Count)</label>
                  <input type="number" min="1" className="form-input" value={scheduleForm.sample_count} onChange={(e) => setScheduleForm({...scheduleForm, sample_count: parseInt(e.target.value) || 1})} />
                </div>
              )}
              
              {selectedProtocol && selectedProtocol.blocks && selectedProtocol.blocks.length > 0 && (
                <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-md)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)' }}>
                  <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>{t('calendar.blockStartTimes', '各ブロックの開始時刻')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {selectedProtocol.blocks.map((blk: any, i: number) => (
                      <div key={blk.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <span style={{ width: '80px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Day {blk.day_offset}</span>
                        <input 
                          type="time" 
                          className="form-input"
                          style={{ flex: 1 }}
                          value={blockStartTimes[blk.id] || '09:00'}
                          onChange={(e) => setBlockStartTimes({...blockStartTimes, [blk.id]: e.target.value})}
                          required
                        />
                        <span style={{ flex: 2, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{blk.block_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">{t('calendar.mode', 'モード')}</label>
                <select 
                  className="form-input"
                  value={scheduleForm.mode}
                  onChange={(e) => setScheduleForm({...scheduleForm, mode: e.target.value})}
                >
                  <option value="management">{t('calendar.modeManagement', 'タスク管理モード (進捗管理あり)')}</option>
                  <option value="silent">{t('calendar.modeSilent', 'サイレントモード (カレンダー表示のみ)')}</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">{t('calendar.labelOptional', 'ラベル (任意)')}</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder={t('calendar.labelPlaceholder', '例: Sample A')}
                    value={scheduleForm.label}
                    onChange={(e) => setScheduleForm({...scheduleForm, label: e.target.value})}
                  />
                </div>
                <div>
                  <label className="form-label">{t('common.color', '色')}</label>
                  <input 
                    type="color" 
                    value={scheduleForm.color}
                    onChange={(e) => setScheduleForm({...scheduleForm, color: e.target.value})}
                    style={{ width: '60px', height: '40px', padding: 0, border: 'none', borderRadius: '4px' }}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">{t('calendar.notesOptional', 'メモ (任意)')}</label>
                <textarea 
                  className="form-input"
                  rows={2}
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowScheduleModal(false)}>
                  {t('common.cancel', 'キャンセル')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save', '追加する')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedBlock && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 500, margin: 'var(--space-md)' }}>
            <div className="card-header">
              <h2 className="card-title">{t('calendar.blockDetails', 'スケジュール詳細')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedBlock(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{t('experiments.protocolName', 'プロトコル')}</div>
                <div style={{ fontWeight: 'bold' }}>{selectedBlock.protocol_name} {selectedBlock.label ? `(${selectedBlock.label})` : ''}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{t('experiments.blockName', 'ブロック名')}</div>
                <div>{selectedBlock.block_name}</div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{t('common.color', '色設定')}</div>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: '40px', height: '24px', padding: 0, border: 'none' }} />
                <button className="btn btn-secondary btn-sm" onClick={async () => {
                  try {
                    const expId = selectedBlock.scheduled_experiment_id || selectedBlock.experiment_id;
                    await api.put(`/schedule/${expId}/color`, { color: editColor });
                    addToast('success', t('common.savedSuccessfully', '保存しました'));
                    fetchData();
                  } catch(e) {
                    addToast('error', t('common.errorOccurred'));
                  }
                }}>
                  {t('common.save', '保存')}
                </button>
              </div>

              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{t('common.date', '日付')}</div>
                <div>{selectedBlock.scheduled_date} {selectedBlock.start_time} - {selectedBlock.end_time}</div>
              </div>

              <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <CalendarDays size={16} /> {t('calendar.rescheduleBlock', '遅延して再割り当て')}
                </div>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-sm)' }}>
                  {t('calendar.delayWarning', 'このブロック以降の全ブロックが自動的に遅延されます')}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <input type="date" className="form-input" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-secondary" onClick={handleRescheduleBlock} disabled={!rescheduleDate || rescheduleDate === selectedBlock.scheduled_date}>
                    {t('common.save', '保存')}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-sm)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--border-default)' }}>
                <button className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={handleDeleteExperiment}>
                  <Trash2 size={16} style={{ marginRight: 4 }} />
                  {t('calendar.deleteExperiment', '実験計画全体を削除')}
                </button>
                <button className="btn btn-primary" onClick={() => setSelectedBlock(null)}>
                  {t('common.close', '閉じる')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showStepModal && selectedStep && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 500, margin: 'var(--space-md)' }}>
            <div className="card-header">
              <h2 className="card-title">{selectedStep.step_name}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowStepModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 'var(--space-md)' }}>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                {selectedStep.status === 'completed' 
                  ? 'このステップの完了を取り消しますか？' 
                  : t('dashboard.stepActionPrompt', 'このステップを完了にするか、延期しますか？')}
              </p>
              
              {selectedStep.status !== 'completed' && (
                <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)', backgroundColor: 'var(--color-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--border-radius-md)' }}>
                <label className="form-label">{t('calendar.rescheduleDate', '延期先の日付')}</label>
                <input
                  type="date"
                  className="form-input"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  style={{ marginBottom: 'var(--space-sm)' }}
                />
                
                <label className="form-label">{t('calendar.rescheduleTime', '延期先の時刻')}</label>
                <input
                  type="time"
                  className="form-input"
                  value={postponeTime}
                  onChange={e => setPostponeTime(e.target.value)}
                />
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowStepModal(false)}>
                  {t('common.cancel', 'キャンセル')}
                </button>
                {selectedStep.status !== 'completed' && (
                  <button className="btn btn-warning" onClick={async () => {
                    try {
                      if (rescheduleDate === selectedStep.scheduled_date) {
                        await api.put(`/schedule/steps/${selectedStep.id}/time`, {
                          start_time: postponeTime,
                          end_time: postponeTime
                        });
                      } else {
                        await api.post(`/schedule/${selectedStep.experiment_id}/postpone`, {
                           step_id: selectedStep.id,
                           target_date: rescheduleDate,
                           target_time: postponeTime
                        });
                      }
                      addToast('success', t('common.savedSuccessfully', '保存しました'));
                      setShowStepModal(false);
                      fetchData();
                    } catch (e) {
                      addToast('error', t('common.errorOccurred'));
                    }
                  }}>
                    {t('common.postpone', '延期')}
                  </button>
                )}
                <button className="btn btn-success" onClick={async () => {
                  try {
                    if (selectedStep.status === 'completed') {
                      await api.put(`/schedule/steps/${selectedStep.id}/incomplete`);
                    } else {
                      await api.put(`/schedule/steps/${selectedStep.id}/complete`);
                    }
                    addToast('success', t('common.savedSuccessfully', '保存しました'));
                    setShowStepModal(false);
                    fetchData();
                  } catch (e) {
                    addToast('error', t('common.errorOccurred'));
                  }
                }}>
                  {selectedStep.status === 'completed' ? '未完了に戻す' : t('common.done', '完了')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {showEventModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 500, margin: 'var(--space-md)' }}>
            <div className="card-header">
              <h2 className="card-title">{editingEvent ? 'イベントを編集' : 'イベントを追加'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowEventModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 'var(--space-md)' }}>
              <form onSubmit={handleEventSubmit}>
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <label className="form-label">タイトル</label>
                  <input type="text" className="form-input" required value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} />
                </div>
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <label className="form-label">日付</label>
                  <input type="date" className="form-input" required value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">開始時刻 (任意)</label>
                    <input type="time" className="form-input" value={eventForm.start_time} onChange={e => setEventForm({ ...eventForm, start_time: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">終了時刻 (任意)</label>
                    <input type="time" className="form-input" value={eventForm.end_time} onChange={e => setEventForm({ ...eventForm, end_time: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <label className="form-label">メモ</label>
                  <textarea className="form-input" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} />
                </div>
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <label className="form-label">カラー</label>
                  <input type="color" value={eventForm.color} onChange={e => setEventForm({ ...eventForm, color: e.target.value })} style={{ width: '100%', height: 40, padding: 0, border: 'none', borderRadius: 4 }} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {editingEvent ? (
                    <button type="button" className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={handleDeleteEvent}>
                      削除
                    </button>
                  ) : <div></div>}
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowEventModal(false)}>キャンセル</button>
                    <button type="submit" className="btn btn-primary">保存</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
