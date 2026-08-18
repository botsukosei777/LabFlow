import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Plus, Trash2, Edit, CalendarDays, Share2, Users } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';
import type { Poll } from '../types';
import { ShareModal } from '../components/ShareModal';
import { format, addDays, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { supabasePost, supabaseGet, supabaseDelete } from '../api/supabaseClient';
export default function Polls() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addToast } = useContext(ToastContext);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ 
    title: '', 
    description: '', 
    type: 'survey' as const, 
    deadline: '',
    timeStart: '09:00',
    timeEnd: '18:00',
    intervalMin: 15,
    surveyOptions: [''],
    scheduleDates: [] as string[]
  });
  
  // Share modal state
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);

  const fetchPolls = async () => {
    try {
      const data = await api.get<Poll[]>('/polls');
      setPolls(data);
    } catch (e) {
      console.error('Failed to fetch polls:', e);
      addToast('error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const syncTeamPolls = async () => {
    try {
      // Fetch all teams the user belongs to
      const teams = await supabaseGet<any[]>('/teams').catch(() => []);
      let totalUpdated = 0;
      
      for (const team of teams) {
        if (team && team.id) {
          const res = await supabasePost<{updatedCount: number}>('/shared/polls/sync-all', { team_id: team.id }).catch(() => null);
          if (res && res.updatedCount > 0) {
            totalUpdated += res.updatedCount;
          }
        }
      }

      if (totalUpdated > 0) {
        fetchPolls();
        addToast('info', 'チームの新しい投票データを受信しました');
      }
    } catch (e) {
      console.error('Poll auto-sync error:', e);
    }
  };

  useEffect(() => {
    fetchPolls();
    
    // Initial sync
    syncTeamPolls();

    // Auto-sync polling every 5 minutes (for incoming team polls)
    const syncInterval = setInterval(syncTeamPolls, 5 * 60 * 1000);
    
    return () => clearInterval(syncInterval);
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    
    // Schedule options
    const options = form.type === 'schedule' 
      ? form.scheduleDates.map(text => ({ text }))
      : []; // For surveys, we don't use poll_options anymore. Questions go into settings.

    if (form.type === 'schedule' && options.length === 0) {
      addToast('error', '少なくとも1つの候補日を選択してください');
      return;
    }

    try {
      const settings = form.type === 'schedule' ? {
        timeStart: form.timeStart,
        timeEnd: form.timeEnd,
        intervalMin: form.intervalMin
      } : { questions: [] };
      
      const res = await api.post<{id: number}>('/polls', {
        title: form.title,
        description: form.description,
        type: form.type,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : '',
        settings,
        options
      });
      addToast('success', t('common.savedSuccessfully'));
      setShowCreateModal(false);
      navigate(`/polls/${res.id}`);
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('common.confirmDelete', { defaultValue: '本当に削除しますか？' }))) return;
    try {
      const poll = polls.find(p => p.id === id);
      if (poll?.shared_id) {
        try {
          // 共有済みの場合、クラウドからも削除（作成者のみ成功する）
          await supabaseDelete(`/shared/polls/local/${id}`);
        } catch (e) {
          // 作成者でない場合はエラーになるが、ローカル削除は続行する
          console.warn('Failed to delete from cloud', e);
        }
      }
      await api.delete(`/polls/${id}`);
      setPolls(polls.filter(p => p.id !== id));
      addToast('success', t('common.deletedSuccessfully'));
    } catch (e) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleShare = async (teamId: string) => {
    if (!shareTarget) return;
    try {
      await supabasePost(`/shared/polls/${shareTarget.id}/share`, { team_id: teamId });
      addToast('success', t('common.shareSuccess', { defaultValue: 'チームに共有しました' }));
      setShareTarget(null);
      fetchPolls();
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div className="polls-page p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
            <CheckSquare className="text-indigo-600" />
            {t('nav.polls', '投票・日程調整')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }} className="text-sm">
            チーム内でのアンケートやスケジュール調整を行います。
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => { 
            setForm({ 
              title: '', description: '', type: 'survey', deadline: '',
              timeStart: '09:00', timeEnd: '18:00', intervalMin: 15,
              surveyOptions: [''], scheduleDates: []
            }); 
            setShowCreateModal(true); 
          }}
        >
          <Plus size={18} />
          {t('common.add', '新規作成')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {polls.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <CheckSquare size={48} className="mx-auto text-gray-400 mb-3" />
            <p style={{ color: 'var(--text-secondary)' }}>投票はまだありません。</p>
          </div>
        ) : (
          polls.map(poll => (
            <div 
              key={poll.id} 
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col"
              onClick={() => navigate(`/polls/${poll.id}`)}
            >
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 ${
                  poll.type === 'schedule' 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                }`}>
                  {poll.type === 'schedule' ? <CalendarDays size={12} /> : <CheckSquare size={12} />}
                  {poll.type === 'schedule' ? '日程調整' : 'アンケート'}
                </span>
                
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  {poll.shared_id ? (
                    <span className="p-1.5 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-md" title="チームに共有済み">
                      <Users size={16} />
                    </span>
                  ) : (
                    <button 
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                      onClick={() => setShareTarget({ id: poll.id, name: poll.title })}
                      title="チームへ共有"
                    >
                      <Share2 size={16} />
                    </button>
                  )}
                  
                  <button 
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => handleDelete(poll.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <h3 className="font-semibold text-lg mb-1 line-clamp-1">{poll.title}</h3>
              {poll.description && (
                <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {poll.description}
                </p>
              )}
              
              <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className={poll.status === 'closed' ? 'text-red-500 font-medium' : 'text-green-500 font-medium'}>
                  {poll.status === 'closed' ? '終了' : '受付中'}
                </span>
                {poll.deadline && (
                  <span className="flex items-center gap-1">
                    〆 {format(new Date(poll.deadline), 'MM/dd HH:mm', { locale: ja })}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <h2 className="modal-title">新規作成</h2>
            <div className="space-y-4">
              <div className="form-group">
                <label>タイトル</label>
                <input 
                  type="text" 
                  className="input-field"
                  value={form.title} 
                  onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="例: 月例ミーティングの日程"
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label>タイプ</label>
                <div className="flex gap-3 mt-1">
                  <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer flex-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: form.type === 'survey' ? 'var(--primary-color)' : 'var(--border-color)' }}>
                    <input 
                      type="radio" 
                      name="pollType" 
                      checked={form.type === 'survey'} 
                      onChange={() => setForm({...form, type: 'survey'})} 
                    />
                    <div className="flex items-center gap-2">
                      <CheckSquare size={18} className={form.type === 'survey' ? 'text-indigo-600' : 'text-gray-400'} />
                      <span className="font-medium">アンケート</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer flex-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: form.type === 'schedule' ? 'var(--primary-color)' : 'var(--border-color)' }}>
                    <input 
                      type="radio" 
                      name="pollType" 
                      checked={form.type === 'schedule'} 
                      onChange={() => setForm({...form, type: 'schedule'})} 
                    />
                    <div className="flex items-center gap-2">
                      <CalendarDays size={18} className={form.type === 'schedule' ? 'text-indigo-600' : 'text-gray-400'} />
                      <span className="font-medium">日程調整</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>回答期限 (任意)</label>
                <input 
                  type="datetime-local" 
                  className="input-field"
                  value={form.deadline} 
                  onChange={e => setForm({...form, deadline: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>説明 (任意)</label>
                <textarea 
                  className="input-field"
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})}
                  rows={2}
                />
              </div>

              {/* Type specific inputs */}
              {form.type === 'schedule' ? (
                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300">日程設定</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">開始時間</label>
                      <input type="time" className="input-field py-1.5" value={form.timeStart} onChange={e => setForm({...form, timeStart: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">終了時間</label>
                      <input type="time" className="input-field py-1.5" value={form.timeEnd} onChange={e => setForm({...form, timeEnd: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">間隔</label>
                      <select className="input-field py-1.5" value={form.intervalMin} onChange={e => setForm({...form, intervalMin: Number(e.target.value)})}>
                        <option value={15}>15分</option>
                        <option value={30}>30分</option>
                        <option value={60}>60分</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">候補日を一括追加 (期間指定)</label>
                    <div className="flex items-center gap-2">
                      <input type="date" className="input-field py-1.5 flex-1" id="candidate-start-date" />
                      <span className="text-gray-500">〜</span>
                      <input type="date" className="input-field py-1.5 flex-1" id="candidate-end-date" />
                      <button type="button" className="btn btn-secondary py-1.5 px-3" onClick={() => {
                        const startInput = document.getElementById('candidate-start-date') as HTMLInputElement;
                        const endInput = document.getElementById('candidate-end-date') as HTMLInputElement;
                        
                        if (startInput.value && endInput.value) {
                          const start = parseISO(startInput.value);
                          const end = parseISO(endInput.value);
                          if (start > end) {
                            addToast('error', '終了日は開始日以降にしてください');
                            return;
                          }
                          
                          const newDates = new Set([...form.scheduleDates]);
                          let current = start;
                          while (current <= end) {
                            newDates.add(format(current, 'yyyy-MM-dd'));
                            current = addDays(current, 1);
                          }
                          
                          setForm({...form, scheduleDates: Array.from(newDates).sort()});
                          startInput.value = '';
                          endInput.value = '';
                        } else if (startInput.value) {
                           // Allow single day add if only start is provided
                           const newDates = new Set([...form.scheduleDates, startInput.value]);
                           setForm({...form, scheduleDates: Array.from(newDates).sort()});
                           startInput.value = '';
                        }
                      }}>追加</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.scheduleDates.map(date => (
                        <span key={date} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium rounded">
                          {date}
                          <button type="button" onClick={() => setForm({...form, scheduleDates: form.scheduleDates.filter(d => d !== date)})} className="hover:text-red-500"><Trash2 size={12} /></button>
                        </span>
                      ))}
                      {form.scheduleDates.length === 0 && <span className="text-xs text-gray-400">候補日がありません</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500">
                  <p>アンケートの設問（フォームの内容）は、作成後の詳細画面で自由に編集できます。</p>
                </div>
              )}
            </div>
            
            <div className="modal-actions mt-6">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!form.title.trim()}>
                作成して次へ
              </button>
            </div>
          </div>
        </div>
      )}

      {shareTarget && (
        <ShareModal
          itemType="polls"
          itemName={shareTarget.name}
          onClose={() => setShareTarget(null)}
          onShare={handleShare}
        />
      )}
    </div>
  );
}
