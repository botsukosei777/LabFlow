import { useState, useEffect, useContext, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckSquare, CalendarDays, ArrowLeft, Save, Plus, Trash2, Users, Share2 } from 'lucide-react';
import { api } from '../api/client';
import { supabaseGet, supabasePost } from '../api/supabaseClient';
import { ToastContext } from '../App';
import { useAuth } from '../contexts/AuthContext';
import type { Poll, PollOption, PollVote } from '../types';
import { format, parse, addMinutes, isSameDay, addDays, parseISO, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function PollDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  const { user } = useAuth();
  
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Voting State
  const [myVote, setMyVote] = useState<Record<string, any>>({});
  const [viewMode, setViewMode] = useState<'edit' | 'vote' | 'results'>(poll?.type === 'survey' ? 'edit' : 'vote');
  
  // Team Sharing State
  const [showShareModal, setShowShareModal] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [shareTeamId, setShareTeamId] = useState<string>('');
  const [teamFetchError, setTeamFetchError] = useState<string | null>(null);

  const fetchTeams = async () => {
    setTeamFetchError(null);
    try {
      const data = await supabaseGet<any[]>('/teams');
      setTeams(data || []);
    } catch (e: any) {
      console.error('Failed to fetch teams', e);
      setTeamFetchError(e.message || 'チームの取得に失敗しました');
    }
  };
  
  const fetchPoll = async () => {
    try {
      const data = await api.get<Poll>(`/polls/${id}`);
      setPoll(data);
      
      const existingVote = data.votes?.find(v => v.user_id === user?.id);
      if (existingVote) {
        setMyVote(existingVote.answers || {});
      }
    } catch (e) {
      addToast('error', 'Failed to fetch poll');
      navigate('/polls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchPoll();
  }, [id]);

  const handleVoteSubmit = async () => {
    if (!poll) return;
    try {
      await api.post(`/polls/${poll.id}/vote`, {
        voter_name: user?.username || 'Unknown',
        answers: myVote
      });
      addToast('success', '回答を送信しました');
      fetchPoll();
    } catch (e) {
      addToast('error', 'Failed to submit vote');
    }
  };

  if (loading || !poll) return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  const handleTeamShare = async () => {
    if (!shareTeamId || !poll) return;
    try {
      await supabasePost(`/shared/polls/${poll.id}/share`, { team_id: shareTeamId });
      addToast('success', 'チームに共有しました');
      setShowShareModal(false);
      fetchPoll();
    } catch (error: any) {
      addToast('error', error.message || '共有に失敗しました');
    }
  };

  const isCreator = poll.user_id === user?.id;

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => addToast('success', 'URLをクリップボードにコピーしました'))
      .catch(() => addToast('error', 'URLのコピーに失敗しました'));
  };

  return (
    <div className="poll-detail-page p-6 max-w-7xl mx-auto">
      <button 
        onClick={() => navigate('/polls')}
        className="mb-4 flex items-center gap-2 text-sm font-medium hover:text-indigo-600 transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ArrowLeft size={16} /> 戻る
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 ${
              poll.type === 'schedule' 
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
            }`}>
              {poll.type === 'schedule' ? <CalendarDays size={12} /> : <CheckSquare size={12} />}
              {poll.type === 'schedule' ? '日程調整' : 'アンケート'}
            </span>
            {poll.shared_id && (
              <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-md flex items-center gap-1">
                <Users size={12} /> チーム共有
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{poll.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3 md:mt-0">
            <button 
              onClick={() => {
                fetchTeams();
                setShowShareModal(true);
              }}
              className="text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Users size={16} />
              チームに共有
            </button>
            <button 
              onClick={handleShare}
              className="text-sm font-medium text-gray-600 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-indigo-900/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
              title="このページのURLをコピー"
            >
              <Share2 size={16} />
              URLコピー
            </button>
          </div>
        </div>
        {poll.description && (
          <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{poll.description}</p>
        )}
        </div>
        
        {poll.deadline && (
          <div className="md:text-right shrink-0">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">回答期限</div>
            <div className="font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/50">
              {format(new Date(poll.deadline), 'yyyy/MM/dd HH:mm')}
            </div>
          </div>
        )}
      </div>
      
      {isCreator && (
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          {poll.type === 'survey' && (
            <button 
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'edit' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setViewMode('edit')}
            >
              フォームを編集
            </button>
          )}
          <button 
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'vote' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setViewMode('vote')}
          >
            自分の回答
          </button>
          <button 
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'results' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setViewMode('results')}
          >
            みんなの回答 (集計結果)
          </button>
        </div>
      )}

      {poll.type === 'schedule' ? (
        <ScheduleMatrix poll={poll} myVote={myVote} setMyVote={setMyVote} isCreator={isCreator} onRefresh={fetchPoll} viewMode={viewMode} />
      ) : (
        <SurveyForm poll={poll} myVote={myVote} setMyVote={setMyVote} isCreator={isCreator} onRefresh={fetchPoll} viewMode={viewMode} />
      )}

      {viewMode === 'vote' && (
        <div className="mt-8 flex justify-end">
          <button 
            className="btn btn-primary"
            onClick={handleVoteSubmit}
            disabled={poll.status === 'closed'}
          >
            <Save size={18} />
            回答を保存する
          </button>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">チームに共有</h2>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              「{poll.title}」を共有するチームを選択してください。
            </p>
            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              {teamFetchError ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm text-center border border-red-100 dark:border-red-900/50">
                  <p className="font-semibold mb-2">{teamFetchError}</p>
                  <p>チーム共有機能を利用するには、Supabaseアカウント連携が必要です。</p>
                  <button 
                    onClick={() => navigate('/settings')}
                    className="mt-3 px-4 py-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    設定画面へ
                  </button>
                </div>
              ) : teams.length === 0 ? (
                <p className="text-sm text-center text-gray-500 py-4">参加しているチームがありません</p>
              ) : (
                teams.map(team => (
                  <button
                    key={team.id}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      shareTeamId === team.id 
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setShareTeamId(team.id)}
                  >
                    <div className="font-medium">{team.name}</div>
                    {team.description && <div className="text-xs text-gray-500 mt-1">{team.description}</div>}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={() => setShowShareModal(false)}>キャンセル</button>
              <button 
                className="btn btn-primary" 
                disabled={!shareTeamId}
                onClick={handleTeamShare}
              >
                共有する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Survey Component ---
function SurveyForm({ poll, myVote, setMyVote, isCreator, onRefresh, viewMode }: any) {
  const { addToast } = useContext(ToastContext);
  const questions = poll.settings?.questions || [];
  
  // Edit mode state
  const [editingQuestions, setEditingQuestions] = useState<any[]>(JSON.parse(JSON.stringify(questions)));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (viewMode === 'edit') {
      setEditingQuestions(JSON.parse(JSON.stringify(poll.settings?.questions || [])));
    }
  }, [viewMode, poll.settings?.questions]);

  const saveFormSchema = async () => {
    setIsSaving(true);
    try {
      const newSettings = { ...poll.settings, questions: editingQuestions };
      await api.put(`/polls/${poll.id}/settings`, { settings: newSettings });
      addToast('success', 'フォームを保存しました');
      onRefresh();
    } catch (err) {
      addToast('error', 'フォームの保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const addQuestion = (type: string) => {
    const newQ = {
      id: 'q_' + Math.random().toString(36).substr(2, 9),
      type,
      text: '',
      options: type === 'text' ? undefined : ['']
    };
    setEditingQuestions([...editingQuestions, newQ]);
  };

  const updateQuestion = (id: string, updates: any) => {
    setEditingQuestions(qs => qs.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setEditingQuestions(qs => qs.filter(q => q.id !== id));
  };

  if (viewMode === 'edit') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">フォームビルダー</h2>
          <button 
            className="btn btn-primary"
            onClick={saveFormSchema}
            disabled={isSaving}
          >
            <Save size={16} /> 保存
          </button>
        </div>

        <div className="space-y-6">
          {editingQuestions.length === 0 && (
            <div className="text-center p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-gray-500">
              まだ設問がありません。下のボタンから追加してください。
            </div>
          )}
          
          {editingQuestions.map((q, qIndex) => (
            <div key={q.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
              <div className="flex gap-3 mb-4">
                <input 
                  type="text" 
                  className="input-field flex-1 font-medium" 
                  placeholder="質問文を入力..." 
                  value={q.text}
                  onChange={e => updateQuestion(q.id, { text: e.target.value })}
                />
                <select 
                  className="input-field w-40"
                  value={q.type}
                  onChange={e => updateQuestion(q.id, { type: e.target.value, options: e.target.value === 'text' ? undefined : (q.options || ['']) })}
                >
                  <option value="single_choice">択一式 (ラジオ)</option>
                  <option value="multiple_choice">複数選択 (チェック)</option>
                  <option value="text">自由記述</option>
                </select>
                <button 
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  onClick={() => removeQuestion(q.id)}
                  title="削除"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                <div className="space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                  {q.options?.map((opt: string, oIndex: number) => (
                    <div key={oIndex} className="flex gap-2 items-center">
                      <div className="w-4 h-4 rounded-full border border-gray-400"></div>
                      <input 
                        type="text" 
                        className="input-field py-1 text-sm flex-1"
                        value={opt}
                        placeholder={`選択肢 ${oIndex + 1}`}
                        onChange={e => {
                          const newOpts = [...q.options];
                          newOpts[oIndex] = e.target.value;
                          updateQuestion(q.id, { options: newOpts });
                        }}
                      />
                      <button 
                        className="text-gray-400 hover:text-red-500 p-1"
                        onClick={() => {
                          const newOpts = q.options.filter((_: any, i: number) => i !== oIndex);
                          updateQuestion(q.id, { options: newOpts });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button 
                    className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-2"
                    onClick={() => updateQuestion(q.id, { options: [...(q.options || []), ''] })}
                  >
                    <Plus size={14} /> 選択肢を追加
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-3 justify-center pt-4 border-t border-gray-200 dark:border-gray-700">
            <button className="btn btn-secondary text-sm py-1.5" onClick={() => addQuestion('single_choice')}>+ 択一式</button>
            <button className="btn btn-secondary text-sm py-1.5" onClick={() => addQuestion('multiple_choice')}>+ 複数選択</button>
            <button className="btn btn-secondary text-sm py-1.5" onClick={() => addQuestion('text')}>+ 自由記述</button>
          </div>
        </div>
      </div>
    );
  }

  // Common UI for 'vote' and 'results'
  return (
    <div className="space-y-6">
      {questions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-200 dark:border-gray-700 text-gray-500">
          まだアンケートの設問が作成されていません。
        </div>
      ) : (
        questions.map((q: any, index: number) => {
          // Results Aggregation
          const textAnswers: { user: string, text: string }[] = [];
          const optionCounts: Record<string, { count: number, users: string[] }> = {};
          
          if (q.options) {
            q.options.forEach((opt: string) => optionCounts[opt] = { count: 0, users: [] });
          }

          if (viewMode === 'results') {
            poll.votes?.forEach((v: any) => {
              const answer = v.answers?.[q.id];
              if (answer) {
                if (q.type === 'text') {
                  textAnswers.push({ user: v.voter_name, text: answer });
                } else if (Array.isArray(answer)) {
                  answer.forEach(a => {
                    if (optionCounts[a]) {
                      optionCounts[a].count++;
                      optionCounts[a].users.push(v.voter_name);
                    }
                  });
                } else {
                  if (optionCounts[answer]) {
                    optionCounts[answer].count++;
                    optionCounts[answer].users.push(v.voter_name);
                  }
                }
              }
            });
          }

          return (
            <div key={q.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-lg mb-4">
                <span className="text-gray-400 mr-2">Q{index + 1}.</span> 
                {q.text}
                {q.type === 'multiple_choice' && <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">複数選択可</span>}
              </h3>

              {viewMode === 'vote' ? (
                <div className="space-y-3">
                  {q.type === 'text' ? (
                    <textarea 
                      className="input-field w-full" 
                      rows={3} 
                      placeholder="回答を入力..."
                      value={myVote[q.id] || ''}
                      onChange={e => setMyVote({ ...myVote, [q.id]: e.target.value })}
                    />
                  ) : (
                    q.options?.map((opt: string, i: number) => (
                      <label key={i} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <input 
                          type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
                          name={`q_${q.id}`}
                          className={`w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500 ${q.type === 'single_choice' ? 'rounded-full' : 'rounded'}`}
                          checked={q.type === 'single_choice' ? myVote[q.id] === opt : (myVote[q.id] || []).includes(opt)}
                          onChange={e => {
                            if (q.type === 'single_choice') {
                              setMyVote({ ...myVote, [q.id]: opt });
                            } else {
                              const current = myVote[q.id] || [];
                              if (e.target.checked) {
                                setMyVote({ ...myVote, [q.id]: [...current, opt] });
                              } else {
                                setMyVote({ ...myVote, [q.id]: current.filter((v: string) => v !== opt) });
                              }
                            }
                          }}
                        />
                        <span className="font-medium">{opt}</span>
                      </label>
                    ))
                  )}
                </div>
              ) : (
                // Results View
                <div className="space-y-3">
                  {q.type === 'text' ? (
                    textAnswers.length === 0 ? (
                      <p className="text-gray-500 text-sm">回答はありません</p>
                    ) : (
                      <div className="space-y-2">
                        {textAnswers.map((ta, i) => (
                          <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                            <div className="text-xs font-medium text-gray-500 mb-1">{ta.user}</div>
                            <div className="text-sm whitespace-pre-wrap">{ta.text}</div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    q.options?.map((opt: string, i: number) => {
                      const data = optionCounts[opt];
                      const totalVotes = poll.votes?.length || 0;
                      const percentage = totalVotes > 0 ? Math.round((data.count / totalVotes) * 100) : 0;
                      
                      return (
                        <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium">{opt}</span>
                            <span className="text-sm font-semibold">{data.count} 票 ({percentage}%)</span>
                          </div>
                          
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mb-2">
                            <div 
                              className="bg-indigo-500 h-2 rounded-full transition-all" 
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          
                          {data.users.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {data.users.map((u, ui) => (
                                <span key={ui} className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-1 rounded">
                                  {u}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// --- Schedule Component ---
function ScheduleMatrix({ poll, myVote, setMyVote, isCreator, onRefresh, viewMode }: any) {
  const { addToast } = useContext(ToastContext);
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newDateEnd, setNewDateEnd] = useState('');
  
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState({
    timeStart: poll.settings?.timeStart || '09:00',
    timeEnd: poll.settings?.timeEnd || '18:00',
    intervalMin: poll.settings?.intervalMin || 15
  });

  // Drag-to-paint states
  const [currentBrush, setCurrentBrush] = useState('◯');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleAddDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;
    
    try {
      const datesToAdd = [];
      if (newDate && newDateEnd) {
        const start = parseISO(newDate);
        const end = parseISO(newDateEnd);
        if (start > end) {
          addToast('error', '終了日は開始日以降にしてください');
          return;
        }
        let current = start;
        while (current <= end) {
          datesToAdd.push({ text: format(current, 'yyyy-MM-dd') });
          current = addDays(current, 1);
        }
      } else {
        datesToAdd.push({ text: newDate });
      }

      // Filter out dates that already exist
      const existingDates = new Set(dateOptions.map((o: any) => o.text));
      const uniqueDatesToAdd = datesToAdd.filter(d => !existingDates.has(d.text));
      
      if (uniqueDatesToAdd.length === 0) {
        addToast('error', '選択された候補日はすでに追加されています');
        return;
      }

      await api.post(`/polls/${poll.id}/options`, { options: uniqueDatesToAdd });
      addToast('success', `${uniqueDatesToAdd.length}件の候補日を追加しました`);
      setNewDate('');
      setNewDateEnd('');
      setShowAddDate(false);
      onRefresh();
    } catch(err) {
      addToast('error', '追加に失敗しました');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/polls/${poll.id}/settings`, { settings: tempSettings });
      addToast('success', '設定を保存しました');
      setShowSettings(false);
      onRefresh();
    } catch(err) {
      addToast('error', '設定の保存に失敗しました');
    }
  };
  
  const settings = poll.settings || { timeStart: '09:00', timeEnd: '18:00', intervalMin: 15 };
  
  const timeSlots = useMemo(() => {
    const slots = [];
    const start = parse(settings.timeStart || '09:00', 'HH:mm', new Date());
    const end = parse(settings.timeEnd || '18:00', 'HH:mm', new Date());
    let current = start;
    
    while (current <= end) {
      slots.push(format(current, 'HH:mm'));
      current = addMinutes(current, settings.intervalMin || 15);
    }
    return slots;
  }, [settings]);

  const dateOptions = poll.options || [];
  const dates = dateOptions.map((o: any) => o.text);
  
  const handleVoteChange = (date: string, time: string, status: string) => {
    if (myVote[`_daily_${date}`] === '✕') return; // Locked if daily status is unavailable
    const newVote = { ...myVote };
    if (!newVote[date]) newVote[date] = {};
    newVote[date][time] = status;
    setMyVote(newVote);
  };

  const handleDailyStatusChange = (date: string, status: string) => {
    const newVote = { ...myVote };
    newVote[`_daily_${date}`] = status;
    
    if (!newVote[date]) newVote[date] = {};
    if (status === '✕') {
      timeSlots.forEach(time => newVote[date][time] = '✕');
    } else if (status === '◎' || status === '◯') {
      timeSlots.forEach(time => newVote[date][time] = '◯');
    }
    setMyVote(newVote);
  };

  const handleMouseDown = (date: string, time: string) => {
    setIsDragging(true);
    handleVoteChange(date, time, currentBrush);
  };

  const handleMouseEnter = (date: string, time: string) => {
    if (isDragging) {
      handleVoteChange(date, time, currentBrush);
    }
  };

  const handleDailyMouseDown = (date: string) => {
    setIsDragging(true);
    handleDailyStatusChange(date, currentBrush);
  };

  const handleDailyMouseEnter = (date: string) => {
    if (isDragging) {
      handleDailyStatusChange(date, currentBrush);
    }
  };

  const canAttend = myVote['_attendance'] !== false; // defaults to true if undefined

  const brushOptions = [
    { v: '◎', label: '優先度高', c: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700' },
    { v: '◯', label: '参加可能', c: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' },
    { v: '△', label: '未定/条件付', c: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' },
    { v: '✕', label: '参加不可', c: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700' },
  ];

  const getCellClass = (status: string, date: string) => {
    const isLocked = myVote[`_daily_${date}`] === '✕';
    const base = "w-full h-8 flex items-center justify-center font-medium text-sm transition-colors border select-none ";
    
    if (isLocked) return base + "bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:border-gray-700 cursor-not-allowed";
    
    const style = brushOptions.find(b => b.v === status);
    if (style) return base + style.c + " cursor-crosshair hover:opacity-80";
    
    return base + "bg-white text-gray-300 border-gray-100 dark:bg-gray-800/50 dark:border-gray-700 cursor-crosshair hover:bg-gray-50 dark:hover:bg-gray-800";
  };

  const getAggregatedCell = (date: string, time: string) => {
    const counts: Record<string, number> = { '◎': 0, '◯': 0, '△': 0, '✕': 0 };
    const votersByStatus: Record<string, string[]> = { '◎': [], '◯': [], '△': [], '✕': [] };
    
    poll.votes?.forEach((v: any) => {
      const isAttending = v.answers['_attendance'] !== false;
      let status = '';
      if (!isAttending) {
        status = '✕';
      } else {
        status = v.answers[date]?.[time] || '';
        if (!status) {
           const daily = v.answers[`_daily_${date}`];
           if (daily === '✕') status = '✕';
           else if (daily === '◎' || daily === '◯') status = '◯';
        }
      }
      if (status && counts[status] !== undefined) {
        counts[status]++;
        votersByStatus[status].push(v.voter_name);
      }
    });
    return { counts, votersByStatus };
  };

  const renderResultCell = (date: string, time: string) => {
    const { counts, votersByStatus } = getAggregatedCell(date, time);
    const total = counts['◎'] + counts['◯'] + counts['△'] + counts['✕'];
    if (total === 0) return <div className="w-full h-8 flex items-center justify-center border bg-gray-50 dark:bg-gray-800/20 text-gray-400">-</div>;

    // Simple scoring for heatmapping
    const score = (counts['◎'] * 3) + (counts['◯'] * 2) + (counts['△'] * 1);
    const maxScore = total * 3;
    const ratio = maxScore > 0 ? score / maxScore : 0;
    
    let bgClass = "bg-white dark:bg-gray-800";
    if (ratio > 0.8) bgClass = "bg-emerald-100 dark:bg-emerald-900/40";
    else if (ratio > 0.5) bgClass = "bg-emerald-50 dark:bg-emerald-900/20";
    else if (ratio > 0) bgClass = "bg-amber-50 dark:bg-amber-900/20";
    if (counts['✕'] > 0 && counts['◎'] === 0 && counts['◯'] === 0) bgClass = "bg-rose-50 dark:bg-rose-900/20";

    const tooltipText = brushOptions.map(b => {
      if (counts[b.v] > 0) return `${b.v}: ${votersByStatus[b.v].join(', ')}`;
      return '';
    }).filter(Boolean).join('\n');

    return (
      <div 
        className={`w-full h-8 flex items-center justify-center text-[10px] font-medium border ${bgClass} hover:opacity-80 transition-colors`}
        title={tooltipText || '回答なし'}
      >
        {counts['◎'] > 0 && <span className="text-emerald-600 dark:text-emerald-400 mx-0.5">{counts['◎']}</span>}
        {counts['◯'] > 0 && <span className="text-blue-600 dark:text-blue-400 mx-0.5">{counts['◯']}</span>}
        {counts['△'] > 0 && <span className="text-amber-600 dark:text-amber-400 mx-0.5">{counts['△']}</span>}
        {counts['✕'] > 0 && <span className="text-rose-600 dark:text-rose-400 mx-0.5">{counts['✕']}</span>}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-w-0">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold flex flex-wrap items-center gap-2">
          日程マトリクス 
          <span className="text-xs font-normal text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
            {settings.intervalMin}分刻み ({settings.timeStart}〜{settings.timeEnd})
          </span>
          {isCreator && viewMode === 'vote' && (
            <div className="flex gap-2 ml-auto">
              {!showSettings && (
                <button 
                  className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 px-2 py-1 rounded transition-colors"
                  onClick={() => setShowSettings(true)}
                >
                  時間帯設定
                </button>
              )}
              {!showAddDate && (
                <button 
                  className="text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-colors"
                  onClick={() => setShowAddDate(true)}
                >
                  + 候補日を追加
                </button>
              )}
            </div>
          )}
        </h2>

        {showSettings && viewMode === 'vote' && (
          <form onSubmit={handleSaveSettings} className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium mb-2">時間帯の変更</h3>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-xs text-gray-500 block">開始時間</label>
                <input type="time" className="input-field py-1 px-2 text-sm" value={tempSettings.timeStart} onChange={e => setTempSettings({...tempSettings, timeStart: e.target.value})} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">終了時間</label>
                <input type="time" className="input-field py-1 px-2 text-sm" value={tempSettings.timeEnd} onChange={e => setTempSettings({...tempSettings, timeEnd: e.target.value})} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">間隔</label>
                <select className="input-field py-1 px-2 text-sm" value={tempSettings.intervalMin} onChange={e => setTempSettings({...tempSettings, intervalMin: Number(e.target.value)})}>
                  <option value={15}>15分</option>
                  <option value={30}>30分</option>
                  <option value={60}>60分</option>
                </select>
              </div>
              <div className="flex gap-2 ml-auto">
                <button type="submit" className="btn btn-primary py-1 px-3 text-sm">保存</button>
                <button type="button" className="btn btn-secondary py-1 px-3 text-sm" onClick={() => setShowSettings(false)}>キャンセル</button>
              </div>
            </div>
          </form>
        )}

        {showAddDate && viewMode === 'vote' && (
          <form onSubmit={handleAddDate} className="mt-4 flex gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">候補日を一括追加:</label>
              <input 
                type="date" 
                className="input-field py-1.5 flex-1" 
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                required
                autoFocus
              />
              <span className="text-gray-500">〜</span>
              <input 
                type="date" 
                className="input-field py-1.5 flex-1" 
                value={newDateEnd}
                onChange={e => setNewDateEnd(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary py-1.5 px-3">追加</button>
            <button type="button" className="btn btn-secondary py-1.5 px-3" onClick={() => setShowAddDate(false)}>キャンセル</button>
          </form>
        )}

        {/* Global Attendance Toggle */}
        {viewMode === 'vote' && (
          <div className="mt-6 p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="font-medium text-indigo-900 dark:text-indigo-300">このイベントに参加可能ですか？</h3>
              <p className="text-xs text-indigo-700/70 dark:text-indigo-400/70 mt-1">参加不可を選択すると入力がスキップされます</p>
            </div>
            <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 shadow-sm">
              <button 
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${canAttend ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                onClick={() => setMyVote({...myVote, _attendance: true})}
              >
                参加可能
              </button>
              <button 
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${!canAttend ? 'bg-rose-500 text-white shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                onClick={() => setMyVote({...myVote, _attendance: false})}
              >
                参加不可
              </button>
            </div>
          </div>
        )}
      </div>
      
      {canAttend || viewMode === 'results' ? (
        <div className="flex flex-col min-w-0">
          {/* Toolbox for Drag-to-paint */}
          {viewMode === 'vote' && (
            <div className="p-3 bg-gray-50/80 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 sticky top-0 z-20 backdrop-blur-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ブラシを選択してドラッグで塗る</span>
              <div className="flex gap-2">
                {brushOptions.map(brush => (
                  <button
                    key={brush.v}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      currentBrush === brush.v 
                        ? brush.c + ' ring-2 ring-indigo-500 ring-offset-1 transform scale-105 shadow-md' 
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                    }`}
                    onClick={() => setCurrentBrush(brush.v)}
                  >
                    <span className="text-base">{brush.v}</span>
                    <span className="hidden sm:inline">{brush.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 pb-6 w-full">
            <div className="overflow-x-auto shadow-inner rounded-xl border border-gray-200 dark:border-gray-700 w-full relative">
            {dates.length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg m-4">
                候補日がありません。
              </div>
            ) : (
              <table className="w-full text-sm text-left border-collapse select-none min-w-max table-fixed">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-500 border-b border-r dark:border-gray-700 sticky left-0 bg-gray-50 dark:bg-gray-900 z-20 w-24 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">時間</th>
                    {dateOptions.map((opt: any) => {
                      const dailyStatus = myVote[`_daily_${opt.text}`] || '';
                      
                      let displayDate = opt.text;
                      const parsedDate = parseISO(opt.text);
                      if (isValid(parsedDate)) {
                        displayDate = format(parsedDate, 'M/d (E)', { locale: ja });
                      }

                      return (
                        <th key={opt.id} className="p-2 font-normal text-center border-b border-r dark:border-gray-700 min-w-[120px] whitespace-nowrap">
                          <div className="flex items-center justify-between mb-2 px-1 gap-2">
                            <span className="font-semibold text-gray-700 dark:text-gray-200">{displayDate}</span>
                            {isCreator && (
                              <button 
                                className="text-gray-400 hover:text-red-500 transition-colors"
                                onClick={async () => {
                                  if (confirm('この候補日を削除しますか？')) {
                                    try {
                                      await api.delete(`/polls/${poll.id}/options/${opt.id}`);
                                      addToast('success', '削除しました');
                                      onRefresh();
                                    } catch(err) {
                                      addToast('error', '削除に失敗しました');
                                    }
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          
                          {viewMode === 'vote' ? (
                            /* Daily Status Selector (Paintable) */
                            <div 
                              className="mt-2 group relative"
                              onMouseDown={() => handleDailyMouseDown(opt.text)}
                              onMouseEnter={() => handleDailyMouseEnter(opt.text)}
                            >
                              <div className={`w-full h-8 flex items-center justify-center font-medium text-sm transition-colors border select-none cursor-crosshair rounded-md shadow-sm ${
                                dailyStatus === '✕' ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700' :
                                dailyStatus === '◎' ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700' :
                                dailyStatus === '◯' ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' :
                                dailyStatus === '△' ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' :
                                'bg-white text-gray-400 border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}>
                                {dailyStatus || '日ごとの可否...'}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-gray-500 font-medium h-8 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-200 dark:border-gray-700">
                              集計結果
                            </div>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody onMouseLeave={() => setIsDragging(false)}>
                  {timeSlots.map(time => (
                    <tr key={time} className="border-b dark:border-gray-700 group/row">
                      <td className="px-4 py-1.5 font-medium text-gray-500 border-r dark:border-gray-700 sticky left-0 bg-white dark:bg-gray-800 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover/row:bg-gray-50 dark:group-hover/row:bg-gray-700/50">{time}</td>
                      {dates.map((date: string) => {
                        const status = myVote[date]?.[time] || '';
                        return (
                          <td 
                            key={date} 
                            className="p-0 border-r dark:border-gray-700 text-center relative group"
                            onMouseDown={() => viewMode === 'vote' && handleMouseDown(date, time)}
                            onMouseEnter={() => viewMode === 'vote' && handleMouseEnter(date, time)}
                          >
                            {viewMode === 'vote' ? (
                              <div className={getCellClass(status, date)}>
                                {status || ' '}
                              </div>
                            ) : (
                              renderResultCell(date, time)
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-900/20 rounded-b-xl">
          <CalendarDays size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="font-medium text-lg text-gray-700 dark:text-gray-300">今回は参加不可ですね</p>
          <p className="text-sm mt-2">入力は不要です。「保存する」ボタンで確定してください。</p>
        </div>
      )}
    </div>
  );
}
