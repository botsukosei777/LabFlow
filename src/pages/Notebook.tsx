import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Book, Plus, Trash2, Calendar, FileText, Check, X } from 'lucide-react';
import { api } from '../api/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MDEditor from '@uiw/react-md-editor';

interface Note {
  id: number;
  title: string;
  content: string;
  date: string;
  scheduled_experiment_id?: number;
  updated_at: string;
}

export default function Notebook() {
  const { t } = useTranslation();
  const location = useLocation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  
  useEffect(() => {
    fetchNotes();
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

  const handleNewNoteWithDate = (date: string) => {
    setSelectedNote(null);
    setEditTitle(t('notebook.newTitle', '新しいノート'));
    setEditContent('');
    setEditDate(date);
    setIsEditing(true);
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditing(false);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setEditTitle(t('notebook.newTitle', '新しいノート'));
    setEditContent('');
    setEditDate(new Date().toISOString().split('T')[0]);
    setIsEditing(true);
  };

  const handleEditNote = () => {
    if (!selectedNote) return;
    setEditTitle(selectedNote.title);
    setEditContent(selectedNote.content);
    setEditDate(selectedNote.date);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (!selectedNote && notes.length > 0) {
      setSelectedNote(notes[0]);
    }
  };

  const handleSaveNote = async () => {
    if (!editTitle || !editDate) return;
    
    try {
      if (selectedNote) {
        const updated = await api.put<Note>(`/notebook/${selectedNote.id}`, {
          title: editTitle,
          content: editContent,
          date: editDate
        });
        setNotes(notes.map(n => n.id === updated.id ? updated : n));
        setSelectedNote(updated);
      } else {
        const created = await api.post<Note>('/notebook', {
          title: editTitle,
          content: editContent,
          date: editDate
        });
        setNotes([created, ...notes]);
        setSelectedNote(created);
      }
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!window.confirm(t('common.confirmDelete', '本当に削除しますか？'))) return;
    try {
      await api.delete(`/notebook/${id}`);
      setNotes(notes.filter(n => n.id !== id));
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setIsEditing(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6 animate-fade-in">
      {/* Sidebar List */}
      <div className="w-1/3 min-w-[300px] flex flex-col glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-glass">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Book className="w-5 h-5 text-indigo-400" />
            {t('notebook.title', '実験ノート')}
          </h1>
          <button 
            onClick={handleNewNote}
            className="p-2 rounded-full hover:bg-white/10 text-indigo-300 transition-colors"
            title={t('notebook.add', 'ノートを追加')}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {notes.length === 0 ? (
            <div className="text-center p-8 text-gray-500 text-sm">
              {t('notebook.noNotes', 'ノートがありません。新しいノートを作成してください。')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notes.map(note => (
                <div 
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  className={`p-4 rounded-xl cursor-pointer transition-all border ${selectedNote?.id === note.id ? 'bg-indigo-500/10 border-indigo-500/30 shadow-[inset_0_0_15px_rgba(99,102,241,0.1)]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
                >
                  <h3 className="font-medium truncate">{note.title}</h3>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {note.date}</span>
                    <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/10 shadow-glass overflow-hidden">
        {isEditing ? (
          <div className="flex-1 flex flex-col p-6 gap-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-medium">{selectedNote ? t('notebook.edit', 'ノートを編集') : t('notebook.new', '新しいノートを作成')}</h2>
              <div className="flex gap-2">
                <button onClick={handleCancelEdit} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm">
                  <X className="w-4 h-4" /> {t('common.cancel', 'キャンセル')}
                </button>
                <button onClick={handleSaveNote} className="btn-primary py-1.5 px-3 flex items-center gap-1 text-sm">
                  <Check className="w-4 h-4" /> {t('common.save', '保存')}
                </button>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-1">{t('notebook.noteTitle', 'タイトル')}</label>
                <input 
                  type="text" 
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="w-1/3">
                <label className="block text-sm text-gray-400 mb-1">{t('notebook.date', '日付')}</label>
                <input 
                  type="date" 
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col mt-2" data-color-mode="dark">
              <label className="block text-sm text-gray-400 mb-1">{t('notebook.content', '内容 (Markdown)')}</label>
              <div className="flex-1 overflow-hidden" style={{ minHeight: '400px' }}>
                <MDEditor
                  value={editContent}
                  onChange={(val) => setEditContent(val || '')}
                  height="100%"
                  preview="live"
                  hideToolbar={false}
                  textareaProps={{
                    placeholder: t('notebook.placeholder', '実験の記録やメモをMarkdown形式で記述してください...')
                  }}
                  style={{ borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}
                />
              </div>
            </div>
          </div>
        ) : selectedNote ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-100">{selectedNote.title}</h2>
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {selectedNote.date}</span>
                </div>
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
            
            <div className="flex-1 overflow-y-auto p-8 bg-black/20">
              <div className="prose prose-invert prose-indigo max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedNote.content || t('notebook.emptyContent', '*内容はありません*')}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Book className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p>{t('notebook.selectPrompt', '左のリストからノートを選択するか、新しく作成してください。')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
