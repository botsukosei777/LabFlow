import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Book, Plus, Trash2, Calendar as CalendarIcon, FileText, Check, X, Search, Tag, FlaskConical, FileTerminal } from 'lucide-react';
import { api } from '../api/client';
import MDEditor from '@uiw/react-md-editor';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format, subDays, isSameDay } from 'date-fns';

interface Note {
  id: number;
  title: string;
  content: string;
  date: string;
  scheduled_experiment_id?: number | null;
  tags?: string;
  updated_at: string;
}

const TEMPLATES = [
  {
    name: '標準実験記録',
    title: '実験記録: ',
    content: '## 目的\n\n## 準備・使用機器\n\n## 手順\n\n## 結果\n\n## 考察\n\n## 次のステップ\n'
  },
  {
    name: 'ミーティング議事録',
    title: 'MTG: ',
    content: '## 日時・参加者\n\n## アジェンダ\n\n## 決定事項\n\n## Next Action (TODO)\n'
  },
  {
    name: 'トラブルシューティング',
    title: 'トラブル: ',
    content: '## 発生した問題\n\n## 原因の仮説\n\n## 試した解決策\n\n## 結果・今後の対策\n'
  }
];

const parseTags = (tagsStr?: string) => {
  if (!tagsStr) return [];
  try { return JSON.parse(tagsStr); } catch (e) { return []; }
};

const TagInput = ({ value, onChange, allTags }: { value: string[], onChange: (tags: string[]) => void, allTags: string[] }) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = allTags.filter(t => t.toLowerCase().includes(inputValue.toLowerCase()) && !value.includes(t));

  const addTag = (tag: string) => {
    if (!value.includes(tag)) onChange([...value, tag]);
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  return (
    <div className="relative">
      <div 
        className="flex flex-wrap gap-2 p-2 bg-white/5 border border-white/10 rounded-lg min-h-[42px] items-center cursor-text transition-colors focus-within:border-indigo-500"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded text-xs border border-indigo-500/30">
            {tag}
            <button 
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }} 
              className="hover:text-white hover:bg-white/10 rounded p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={e => {
            if (e.key === 'Enter' && inputValue.trim()) {
              e.preventDefault();
              addTag(inputValue.trim());
            } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? "タグを追加..." : ""}
          className="bg-transparent border-none outline-none text-sm flex-1 min-w-[100px] text-white"
        />
      </div>
      {isOpen && (inputValue.trim() || filtered.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1f2e] border border-white/10 rounded-lg shadow-xl z-50 max-h-[200px] overflow-y-auto custom-scrollbar">
          {filtered.map(tag => (
            <div 
              key={tag} 
              onMouseDown={(e) => { e.preventDefault(); addTag(tag); }} 
              className="p-2.5 hover:bg-white/10 cursor-pointer text-sm border-b border-white/5 last:border-0"
            >
              <Tag className="w-3 h-3 inline-block mr-2 text-gray-400" />
              {tag}
            </div>
          ))}
          {inputValue.trim() && !allTags.includes(inputValue.trim()) && !value.includes(inputValue.trim()) && (
            <div 
              onMouseDown={(e) => { e.preventDefault(); addTag(inputValue.trim()); }} 
              className="p-2.5 hover:bg-indigo-500/20 cursor-pointer text-sm text-indigo-400 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> "{inputValue.trim()}" を新しく作成
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function Notebook() {
  const { t } = useTranslation();
  const location = useLocation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [scheduledExperiments, setScheduledExperiments] = useState<any[]>([]);
  
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [inlineTitle, setInlineTitle] = useState('');
  const [inlineContent, setInlineContent] = useState('');
  const [inlineTags, setInlineTags] = useState<string[]>([]);
  const [inlineDate, setInlineDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [inlineNoteId, setInlineNoteId] = useState<number | null>(null);
  const [inlineExperimentId, setInlineExperimentId] = useState<number | ''>('');
  
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editExperimentId, setEditExperimentId] = useState<number | ''>('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  
  useEffect(() => {
    fetchNotes();
    fetchExperiments();
  }, []);

  const fetchNotes = async () => {
    try {
      const data = await api.get<Note[]>('/notebook');
      setNotes(data);
      
      const searchParams = new URLSearchParams(location.search);
      const queryId = searchParams.get('id');
      const queryDate = searchParams.get('date');

      if (queryId) {
        const found = data.find(n => n.id === Number(queryId));
        if (found) {
          setSelectedNote(found);
          return;
        }
      } else if (queryDate) {
        handleNewNoteWithDate(queryDate);
        return;
      }

      if (data.length > 0 && !selectedNote) {
        setSelectedNote(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchExperiments = async () => {
    try {
      // Fetch recent scheduled experiments for the dropdown
      const d = new Date();
      const start = format(subDays(d, 30), 'yyyy-MM-dd');
      const data = await api.get<any[]>(`/schedule?start=${start}&end=2099-12-31`);
      setScheduledExperiments(data);
    } catch (e) {
      console.error(e);
    }
  };

  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    notes.forEach(note => {
      const tags = parseTags(note.tags);
      tags.forEach((t: string) => tagsSet.add(t));
    });
    return Array.from(tagsSet).sort();
  }, [notes]);

  const handleNewNoteWithDate = (date: string) => {
    setSelectedNote(null);
    setEditTitle(t('notebook.newTitle', '新しいノート'));
    setEditContent('');
    setEditDate(date);
    setEditTags([]);
    setEditExperimentId('');
    setIsEditing(true);
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditing(false);
    setIsCreatingInline(false);
  };

  const handleNewNoteClick = () => {
    setIsEditing(false);
    setInlineTitle('');
    setInlineContent('');
    setInlineTags([]);
    setInlineDate(format(new Date(), 'yyyy-MM-dd'));
    setInlineExperimentId('');
    setInlineNoteId(null);
    setIsCreatingInline(true);
  };

  const handleCreateInline = async (title: string, content: string, tags: string[], date: string, experimentId: number | '', closeInline = true) => {
    try {
      const payload = {
        title,
        content,
        date,
        tags,
        scheduled_experiment_id: experimentId === '' ? null : Number(experimentId)
      };
      
      let savedNote: Note;
      if (inlineNoteId) {
        savedNote = await api.put<Note>(`/notebook/${inlineNoteId}`, payload);
      } else {
        savedNote = await api.post<Note>('/notebook', payload);
        setInlineNoteId(savedNote.id);
      }
      
      await fetchNotes();
      setSelectedNote(savedNote);
      
      if (closeInline) {
        setIsCreatingInline(false);
        setInlineNoteId(null);
      }
    } catch (e) {
      console.error(e);
      alert('ノートの保存に失敗しました');
    }
  };

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setEditTitle(template.title);
    setEditContent(template.content);
  };

  const handleEditNoteWithNote = (note: Note) => {
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditDate(note.date);
    setEditTags(parseTags(note.tags));
    setEditExperimentId(note.scheduled_experiment_id || '');
    setIsEditing(true);
  };

  const handleEditNote = () => {
    if (!selectedNote) return;
    handleEditNoteWithNote(selectedNote);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (!selectedNote && notes.length > 0) {
      setSelectedNote(notes[0]);
    }
  };

  const handleSaveNote = async (closeEditor = true) => {
    if (!editTitle || !editDate) return;
    
    try {
      const payload = {
        title: editTitle,
        content: editContent,
        date: editDate,
        tags: editTags,
        scheduled_experiment_id: editExperimentId === '' ? null : Number(editExperimentId)
      };

      let savedNote: Note;
      if (selectedNote) {
        savedNote = await api.put<Note>(`/notebook/${selectedNote.id}`, payload);
      } else {
        savedNote = await api.post<Note>('/notebook', payload);
      }
      
      await fetchNotes();
      setSelectedNote(savedNote);
      if (closeEditor) {
        setIsEditing(false);
      }
    } catch (e) {
      console.error(e);
      alert('ノートの保存に失敗しました');
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!window.confirm(t('common.confirmDelete', '本当に削除しますか？'))) return;
    try {
      await api.delete(`/notebook/${id}`);
      setSelectedNote(null);
      setIsEditing(false);
      await fetchNotes();
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました');
    }
  };

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => {
        const titleMatch = n.title.toLowerCase().includes(q);
        const tags = parseTags(n.tags);
        const tagMatch = tags.some((tag: string) => tag.toLowerCase().includes(q));
        const contentMatch = (n.content || '').toLowerCase().includes(q);
        return titleMatch || tagMatch || contentMatch;
      });
    }
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(n => n.date === dateStr);
    }
    return result;
  }, [notes, searchQuery, selectedDate]);

  const recentNotes = useMemo(() => {
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    return notes.filter(n => n.date >= sevenDaysAgo);
  }, [notes]);

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6">
      {/* Sidebar List */}
      <div className="w-[340px] flex flex-col glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-glass">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Book className="w-5 h-5 text-indigo-400" />
            {t('notebook.title', '実験ノート')}
          </h1>
          <button 
            onClick={handleNewNoteClick}
            className="p-2 rounded-full hover:bg-white/10 text-indigo-300 transition-colors"
            title={t('notebook.add', 'ノートを追加')}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {isCreatingInline && (
          <div className="p-4 border-b border-white/10 bg-indigo-500/10 flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={inlineTitle}
                onChange={e => setInlineTitle(e.target.value)}
                placeholder="タイトル..."
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 text-white min-w-0"
              />
              <input
                type="date"
                value={inlineDate}
                onChange={e => setInlineDate(e.target.value)}
                className="w-[130px] flex-shrink-0 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-indigo-500 text-white"
              />
            </div>
            
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
              <span className="text-xs text-gray-400 whitespace-nowrap self-center">テンプレート:</span>
              {TEMPLATES.map((tmpl, idx) => (
                <button 
                  key={idx} 
                  onClick={() => { setInlineTitle(tmpl.title); setInlineContent(tmpl.content); }}
                  className="px-2 py-0.5 text-[10px] rounded border border-indigo-500/30 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 whitespace-nowrap transition-colors"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>

            <div 
              data-color-mode="dark" 
              className="border border-white/10 rounded-lg overflow-hidden"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  if (inlineTitle.trim()) {
                    handleCreateInline(inlineTitle.trim(), inlineContent, inlineTags, inlineDate, inlineExperimentId, false);
                  }
                }
              }}
            >
              <MDEditor
                value={inlineContent}
                onChange={(val) => setInlineContent(val || '')}
                height={200}
                preview="edit"
                hideToolbar={false}
                textareaProps={{
                  placeholder: "内容 (Markdown)..."
                }}
                style={{ borderRadius: '0', border: 'none' }}
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">タグ:</span>
              <TagInput value={inlineTags} onChange={setInlineTags} allTags={allTags} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">関連する実験:</span>
              <select
                value={inlineExperimentId}
                onChange={e => setInlineExperimentId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500 text-white"
              >
                <option value="">-- 指定なし --</option>
                {scheduledExperiments.map(exp => (
                  <option key={exp.id} value={exp.id}>
                    {exp.start_date} | {exp.label ? `${exp.label} - ` : ''}{exp.experiment_type_name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => { setIsCreatingInline(false); setInlineNoteId(null); }} className="text-xs text-gray-400 hover:text-white px-2 py-1">キャンセル</button>
              <button 
                onClick={async () => {
                  if (inlineTitle.trim()) {
                    await handleCreateInline(inlineTitle.trim(), inlineContent, inlineTags, inlineDate, inlineExperimentId, false);
                  }
                }}
                className="text-xs border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 px-3 py-1 rounded transition-colors"
                title="Ctrl+S"
              >
                一時保存
              </button>
              <button 
                onClick={async () => {
                  if (inlineTitle.trim()) {
                    await handleCreateInline(inlineTitle.trim(), inlineContent, inlineTags, inlineDate, inlineExperimentId, true);
                  }
                }}
                className="text-xs bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 transition-colors"
              >
                作成して閉じる
              </button>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-6">
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('notebook.search', '検索...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Calendar Picker */}
          <div className="bg-black/20 rounded-xl p-2 border border-white/5 flex justify-center">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date && selectedDate && isSameDay(date, selectedDate)) {
                  setSelectedDate(undefined);
                } else {
                  setSelectedDate(date);
                }
              }}
              styles={{
                caption: { color: 'var(--text-primary)' },
                head_cell: { color: 'var(--text-tertiary)' },
                day: { color: 'var(--text-secondary)' },
                day_selected: { backgroundColor: 'var(--color-primary)', color: 'white' },
                day_today: { color: 'var(--color-primary)', fontWeight: 'bold' }
              }}
              modifiers={{ hasNote: notes.map(n => new Date(n.date)) }}
              modifiersClassNames={{
                selected: 'bg-indigo-500 text-white rounded-lg',
                today: 'text-indigo-400 font-bold',
                hasNote: 'has-note'
              }}
            />
          </div>

          {/* Note List */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-400">
                {searchQuery || selectedDate ? '検索結果' : '直近1週間のノート'}
              </h3>
              {(searchQuery || selectedDate) && (
                <button 
                  onClick={() => { setSearchQuery(''); setSelectedDate(undefined); }}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  クリア
                </button>
              )}
            </div>
            
            {(searchQuery || selectedDate ? filteredNotes : recentNotes).length === 0 ? (
              <div className="text-center p-4 text-gray-500 text-sm bg-black/10 rounded-lg">
                ノートが見つかりません
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(searchQuery || selectedDate ? filteredNotes : recentNotes).map(note => {
                  const tags = parseTags(note.tags);
                  return (
                    <div 
                      key={note.id}
                      onClick={() => handleSelectNote(note)}
                      className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedNote?.id === note.id ? 'bg-indigo-500/10 border-indigo-500/30 shadow-[inset_0_0_15px_rgba(99,102,241,0.1)]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
                    >
                      <h3 className="font-medium truncate text-sm">{note.title}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="flex items-center gap-1 text-xs text-gray-400"><CalendarIcon className="w-3 h-3" /> {note.date}</span>
                        {note.scheduled_experiment_id && <FlaskConical className="w-3 h-3 text-emerald-400" />}
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tags.slice(0, 3).map((tag: string, i: number) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300">#{tag}</span>
                          ))}
                          {tags.length > 3 && <span className="text-[10px] text-gray-500">+{tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/10 shadow-glass overflow-hidden">
        {isEditing ? (
          <div className="flex-1 flex flex-col p-6 gap-4 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-medium">{t('notebook.edit', 'ノートを編集')}</h2>
              <div className="flex gap-2">
                <button onClick={handleCancelEdit} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm">
                  <X className="w-4 h-4" /> {t('common.cancel', 'キャンセル')}
                </button>
                <button onClick={() => handleSaveNote(false)} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10" title="Ctrl+S">
                  <Check className="w-4 h-4" /> 一時保存
                </button>
                <button onClick={() => handleSaveNote(true)} className="btn-primary py-1.5 px-3 flex items-center gap-1 text-sm">
                  <Check className="w-4 h-4" /> 保存して閉じる
                </button>
              </div>
            </div>

            {(!selectedNote || !selectedNote.content) && (
              <div className="flex gap-2 mb-2 overflow-x-auto pb-2 custom-scrollbar">
                <span className="text-sm text-gray-400 flex items-center mr-2"><FileTerminal className="w-4 h-4 mr-1"/> テンプレート:</span>
                {TEMPLATES.map((tmpl, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => applyTemplate(tmpl)}
                    className="px-3 py-1 text-xs rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 whitespace-nowrap transition-colors"
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('notebook.noteTitle', 'タイトル')}</label>
                <input 
                  type="text" 
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('notebook.date', '日付')}</label>
                <input 
                  type="date" 
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1"><Tag className="w-4 h-4"/> タグ</label>
                <TagInput value={editTags} onChange={setEditTags} allTags={allTags} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1"><FlaskConical className="w-4 h-4"/> 関連する実験</label>
                <select 
                  value={editExperimentId}
                  onChange={e => setEditExperimentId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 transition-colors text-white"
                >
                  <option value="">-- 指定なし --</option>
                  {scheduledExperiments.map(exp => (
                    <option key={exp.id} value={exp.id}>
                      {exp.start_date} | {exp.label ? `${exp.label} - ` : ''}{exp.experiment_type_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col mt-2 h-full min-h-[400px]" data-color-mode="dark">
              <label className="block text-sm text-gray-400 mb-1">{t('notebook.content', '内容 (Markdown)')}</label>
              <div 
                className="flex-1 overflow-hidden h-full rounded-lg border border-white/10"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSaveNote(false);
                  }
                }}
              >
                <MDEditor
                  value={editContent}
                  onChange={(val) => setEditContent(val || '')}
                  height="100%"
                  preview="live"
                  hideToolbar={false}
                  textareaProps={{
                    placeholder: t('notebook.placeholder', '実験の記録やメモをMarkdown形式で記述してください...')
                  }}
                  style={{ borderRadius: '0', border: 'none', height: '100%' }}
                />
              </div>
            </div>
          </div>
        ) : selectedNote ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-6 bg-white/5 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-100">{selectedNote.title}</h2>
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                  <span className="flex items-center gap-1.5"><CalendarIcon className="w-4 h-4" /> {selectedNote.date}</span>
                  {selectedNote.scheduled_experiment_id && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <FlaskConical className="w-4 h-4" /> 関連実験あり
                    </span>
                  )}
                </div>
                {parseTags(selectedNote.tags).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {parseTags(selectedNote.tags).map((tag: string, i: number) => (
                      <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 text-gray-300">
                        <Tag className="w-3 h-3" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleEditNote} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm">
                  <FileText className="w-4 h-4" /> {t('common.edit', '編集')}
                </button>
                <button onClick={() => handleDeleteNote(selectedNote.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="h-px bg-white/10 w-full" />
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0d1117]" data-color-mode="dark">
              <MDEditor.Markdown source={selectedNote.content || '*本文はありません*'} style={{ backgroundColor: 'transparent' }} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <Book className="w-16 h-16 mb-4 opacity-20" />
            <p>{t('notebook.selectOrNew', 'ノートを選択するか、新しく作成してください')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
