import React, { useState, useEffect, useMemo, useRef, useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Book, Plus, Trash2, Calendar as CalendarIcon, FileText, Check, X, Search, Tag, FlaskConical, FileTerminal, Printer, ChevronDown, ChevronRight, Clock, History, BookOpen, Sparkles, Quote, Target, CheckSquare, ListTree, Grid2X2, Columns2, WrapText, PenLine, Eye } from 'lucide-react';
import { ToastContext } from '../App';
import { api } from '../api/client';
import MDEditor from '@uiw/react-md-editor';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format, subDays, isSameDay } from 'date-fns';
import { CustomDatabaseManager } from '../components/notebook/CustomDatabaseManager';
import { DocumentManager } from '../components/notebook/DocumentManager';
import { PrintNotesModal } from '../components/notebook/PrintNotesModal';
import { CitationPickerModal } from '../components/notebook/CitationPickerModal';
import { MilestonePickerModal, type MilestoneLinkSelection } from '../components/notebook/MilestonePickerModal';
import {
  CITATION_STYLES,
  type CitationStyleId,
  processCitations
} from '../utils/citationEngine';
import type { LiteratureItem, Milestone } from '../types';
import {
  mdPreviewOptions,
  mdRemarkPlugins,
  mdRehypePlugins,
  getCustomMdCommands,
  handleMarkdownDragOver,
  handleMarkdownPasteWithCrop,
  handleMarkdownDropWithCrop,
  uploadImageFile,
  insertTextAtCursor,
  ImageCropModal,
  ImageGridModal
} from '../utils/markdownConfig';

interface Note {
  id: number;
  title: string;
  content: string;
  date: string;
  scheduled_experiment_id?: number | null;
  tags?: string;
  created_at?: string;
  updated_at?: string;
}

const TEMPLATES = [
  {
    key: 'standard',
    name: '標準実験記録',
    title: '実験記録: ',
    content: '## 目的\n\n## 準備・使用機器\n\n## 手順\n\n## 結果\n\n## 考察\n\n## 次のステップ\n'
  },
  {
    key: 'meeting',
    name: 'ミーティング議事録',
    title: 'MTG: ',
    content: '## 日時・参加者\n\n## アジェンダ\n\n## 決定事項\n\n## Next Action (TODO)\n'
  },
  {
    key: 'troubleshooting',
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
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = allTags.filter(tag => tag.toLowerCase().includes(inputValue.toLowerCase()) && !value.includes(tag));

  const addTag = (tag: string) => {
    if (!value.includes(tag)) onChange([...value, tag]);
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(v => v !== tag));
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
          placeholder={value.length === 0 ? t('notebook.addTag', 'タグを追加...') : ""}
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
              <Plus className="w-4 h-4" /> {t('notebook.createNewTag', { name: inputValue.trim() })}
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
  const navigate = useNavigate();
  const { addToast } = useContext(ToastContext);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTargetApi, setCropTargetApi] = useState<{
    replaceSelection?: (text: string) => void;
    textarea?: HTMLTextAreaElement;
  } | null>(null);

  const handleOpenCrop = useCallback((file: File, apiOrTextarea: any) => {
    setCropFile(file);
    if (apiOrTextarea && 'replaceSelection' in apiOrTextarea) {
      setCropTargetApi({ replaceSelection: (text: string) => apiOrTextarea.replaceSelection(text) });
    } else if (apiOrTextarea instanceof HTMLTextAreaElement) {
      setCropTargetApi({ textarea: apiOrTextarea });
    }
    setCropModalOpen(true);
  }, []);

  const handleCropConfirm = async (blob: Blob, altText: string) => {
    try {
      const data = await uploadImageFile(blob, `${altText || 'image'}.png`);
      const markdown = `\n![${altText || 'image'}](${data.url})\n`;
      if (cropTargetApi?.replaceSelection) {
        cropTargetApi.replaceSelection(markdown);
      } else if (cropTargetApi?.textarea) {
        insertTextAtCursor(cropTargetApi.textarea, markdown);
      }
    } catch (err: any) {
      console.error('Image upload failed:', err);
      alert(err.message || '画像のアップロードに失敗しました');
    }
  };

  const [citationModalOpen, setCitationModalOpen] = useState(false);
  const [literatures, setLiteratures] = useState<LiteratureItem[]>([]);
  const [citationStyle, setCitationStyle] = useState<CitationStyleId>(() => {
    const saved = localStorage.getItem('labflow_citation_style');
    return (saved as CitationStyleId) || 'nature';
  });
  const [citationTargetApi, setCitationTargetApi] = useState<{
    replaceSelection?: (text: string) => void;
    textarea?: HTMLTextAreaElement;
  } | null>(null);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [milestoneTargetApi, setMilestoneTargetApi] = useState<{
    replaceSelection?: (text: string) => void;
    textarea?: HTMLTextAreaElement;
  } | null>(null);

  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [gridTargetApi, setGridTargetApi] = useState<{
    replaceSelection?: (text: string) => void;
    textarea?: HTMLTextAreaElement;
  } | null>(null);

  const [editorPreviewMode, setEditorPreviewMode] = useState<'live' | 'edit' | 'preview'>(() => {
    return (localStorage.getItem('labflow_editor_preview_mode') as 'live' | 'edit' | 'preview') || 'live';
  });
  const [isWordWrap, setIsWordWrap] = useState<boolean>(() => {
    // Default to false (horizontal scroll enabled) as requested by user
    return localStorage.getItem('labflow_editor_word_wrap') === 'true';
  });

  const handlePreviewModeChange = (mode: 'live' | 'edit' | 'preview') => {
    setEditorPreviewMode(mode);
    localStorage.setItem('labflow_editor_preview_mode', mode);
  };

  const handleToggleWordWrap = () => {
    setIsWordWrap(prev => {
      const next = !prev;
      localStorage.setItem('labflow_editor_word_wrap', String(next));
      return next;
    });
  };

  const handleInsertImageGrid = (markdown: string) => {
    if (gridTargetApi?.replaceSelection) {
      gridTargetApi.replaceSelection(markdown);
    } else if (gridTargetApi?.textarea) {
      insertTextAtCursor(gridTargetApi.textarea, markdown);
    } else if (isEditing) {
      setEditContent(prev => prev ? `${prev}${markdown}` : markdown);
    } else if (isCreatingInline) {
      setInlineContent(prev => prev ? `${prev}${markdown}` : markdown);
    }
  };

  const handleCitationStyleChange = (styleId: CitationStyleId) => {
    setCitationStyle(styleId);
    localStorage.setItem('labflow_citation_style', styleId);
  };

  const literatureMap = useMemo(() => {
    const map = new Map<number, LiteratureItem>();
    literatures.forEach(lit => map.set(lit.id, lit));
    return map;
  }, [literatures]);

  const customCommands = useMemo(() => {
    return getCustomMdCommands(
      t('notebook.mathInline', '数式 (インライン): $...$'),
      t('notebook.mathBlock', '数式ブロック: $$...$$'),
      t('notebook.insertImage', '画像を挿入 (PC内の画像ファイルを選択)'),
      (file, api) => handleOpenCrop(file, api),
      t('notebook.superscript', '上付き文字: <sup>...</sup>'),
      t('notebook.subscript', '下付き文字: <sub>...</sub>'),
      t('citation.insertCitationCommand', '引用番号の挿入: [@lit:ID]'),
      (api) => {
        setCitationTargetApi({ replaceSelection: (text: string) => api.replaceSelection(text) });
        setCitationModalOpen(true);
      },
      t('notebook.insertMilestoneCommand', 'マイルストーンリンクの挿入: [🎯 ...]'),
      (api) => {
        setMilestoneTargetApi({ replaceSelection: (text: string) => api.replaceSelection(text) });
        setMilestoneModalOpen(true);
      },
      t('notebook.insertImageGrid', '画像を行列配置 (2行2列など)'),
      (api) => {
        setGridTargetApi({ replaceSelection: (text: string) => api.replaceSelection(text) });
        setGridModalOpen(true);
      }
    );
  }, [t, handleOpenCrop]);

  const handleSelectMilestone = (ms: Milestone) => {
    const link = `[🎯 ${ms.name}](/milestones?id=${ms.id})`;
    if (milestoneTargetApi?.replaceSelection) {
      milestoneTargetApi.replaceSelection(link);
    } else if (milestoneTargetApi?.textarea) {
      insertTextAtCursor(milestoneTargetApi.textarea, link);
    } else if (isEditing) {
      setEditContent(prev => prev ? `${prev} ${link}` : link);
    } else if (isCreatingInline) {
      setInlineContent(prev => prev ? `${prev} ${link}` : link);
    }
    addToast('info', t('notebook.milestoneLinkInserted', 'マイルストーンへのリンクを挿入しました'));
  };

  const handleSelectMilestoneLink = (selection: MilestoneLinkSelection) => {
    const link = selection.markdown;
    if (milestoneTargetApi?.replaceSelection) {
      milestoneTargetApi.replaceSelection(link);
    } else if (milestoneTargetApi?.textarea) {
      insertTextAtCursor(milestoneTargetApi.textarea, link);
    } else if (isEditing) {
      setEditContent(prev => prev ? `${prev} ${link}` : link);
    } else if (isCreatingInline) {
      setInlineContent(prev => prev ? `${prev} ${link}` : link);
    }
    const msg = selection.type === 'task'
      ? t('notebook.taskLinkInserted', 'タスクへのリンクを挿入しました')
      : selection.type === 'subtask'
        ? t('notebook.subtaskLinkInserted', 'サブタスクへのリンクを挿入しました')
        : t('notebook.milestoneLinkInserted', 'マイルストーンへのリンクを挿入しました');
    addToast('info', msg);
  };

  const handleInsertCitations = (litIds: number[]) => {
    if (litIds.length === 0) return;
    const tag = `[@lit:${litIds.join(', @lit:')}]`;
    if (citationTargetApi?.replaceSelection) {
      citationTargetApi.replaceSelection(tag);
    } else if (citationTargetApi?.textarea) {
      insertTextAtCursor(citationTargetApi.textarea, tag);
    } else if (isEditing) {
      setEditContent(prev => prev ? `${prev} ${tag}` : tag);
    } else if (isCreatingInline) {
      setInlineContent(prev => prev ? `${prev} ${tag}` : tag);
    }
  };

  const handleSyncBibliography = (isInline: boolean = false) => {
    const content = isInline ? inlineContent : editContent;
    const result = processCitations(content, literatureMap, citationStyle);
    if (result.citedItems.length === 0) {
      alert(t('citation.noCitationsInText', '本文中に [@lit:ID] 形式の引用が見つかりません。先に引用番号を挿入してください。'));
      return;
    }

    const bibHeader = t('citation.bibliographyHeader', '## 参考文献');
    const bibBlock = `\n\n---\n${bibHeader}\n\n${result.bibliographyMarkdown}\n`;

    const bibRegex = /\n*---\n+##\s*(?:参考文献|References)[\s\S]*$/i;
    let newContent = content;
    if (bibRegex.test(content)) {
      newContent = content.replace(bibRegex, bibBlock);
    } else {
      newContent = content.trimEnd() + bibBlock;
    }

    if (isInline) {
      setInlineContent(newContent);
    } else {
      setEditContent(newContent);
    }
  };

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
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt?: string } | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showTemplates, setShowTemplates] = useState(false);
  
  useEffect(() => {
    fetchNotes();
    fetchExperiments();
    fetchLiteratures();
  }, []);

  const fetchLiteratures = async () => {
    try {
      const data = await api.get<any>('/literature');
      setLiteratures(Array.isArray(data) ? data : (data?.items || data?.data || []));
    } catch (e) {
      console.error('Failed to load literatures in Notebook:', e);
    }
  };

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

  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const editorArea = textarea.closest('.w-md-editor');
    if (editorArea) {
      const preview = editorArea.querySelector('.w-md-editor-preview') as HTMLElement | null;
      if (preview && textarea.scrollHeight > textarea.clientHeight) {
        const scrollRatio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
        preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
      }
    }
  };

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
      alert(t('notebook.saveFailed', 'ノートの保存に失敗しました'));
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
      alert(t('notebook.saveFailed', 'ノートの保存に失敗しました'));
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
      alert(t('notebook.deleteFailed', '削除に失敗しました'));
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

  const normalizeGridMarkdown = useCallback((text: string): string => {
    if (!text) return text;
    // Converts legacy/broken `![alt | 200px](url)` inside GFM tables to `![alt](url "200px")`
    return text.replace(/!\[(.*?)\s*(?:\||\\\|)\s*(\d+(?:px|%))\s*\]\((.*?)\)/g, '![$1]($3 "$2")');
  }, []);

  const processedNoteContent = useMemo(() => {
    if (!selectedNote?.content) return '';
    const normalized = normalizeGridMarkdown(selectedNote.content);
    const result = processCitations(normalized, literatureMap, citationStyle);
    const hasManualBib = /##\s*(?:参考文献|References)/i.test(selectedNote.content);
    if (!hasManualBib && result.citedItems.length > 0) {
      return `${result.processedText}\n\n---\n### ${t('citation.references', '参考文献')}\n\n${result.bibliographyMarkdown}`;
    }
    return result.processedText;
  }, [selectedNote?.content, literatureMap, citationStyle, normalizeGridMarkdown, t]);

  const handleMilestoneLinkClick = useCallback(async (href: string) => {
    if (isEditing) {
      try {
        const titleToSave = editTitle.trim() || selectedNote?.title || t('notebook.untitledNote', '無題のノート');
        const dateToSave = editDate || selectedNote?.date || format(new Date(), 'yyyy-MM-dd');
        const payload = {
          title: titleToSave,
          content: editContent,
          date: dateToSave,
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
        setIsEditing(false);
        addToast('success', t('notebook.savedAndNavigated', 'ノートを保存してマイルストーンへ移動しました'));
      } catch (e) {
        console.error('Failed to auto-save note on milestone link click:', e);
        addToast('warning', t('notebook.saveFailedNavigating', '保存に失敗しましたが、マイルストーンへ移動します'));
        setIsEditing(false);
      }
      navigate(href);
    } else if (isCreatingInline) {
      try {
        if (inlineTitle.trim()) {
          await handleCreateInline(inlineTitle.trim(), inlineContent, inlineTags, inlineDate, inlineExperimentId, true);
          addToast('success', t('notebook.savedAndNavigated', 'ノートを保存してマイルストーンへ移動しました'));
        } else {
          setIsCreatingInline(false);
          setInlineNoteId(null);
        }
      } catch (e) {
        console.error('Failed to save inline note:', e);
      }
      navigate(href);
    } else {
      navigate(href);
    }
  }, [
    isEditing, isCreatingInline, editTitle, editContent, editDate, editTags, editExperimentId,
    selectedNote, inlineTitle, inlineContent, inlineTags, inlineDate, inlineExperimentId,
    t, addToast, navigate
  ]);

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: any) => {
      const isMilestone = href && (href.startsWith('/milestones') || href.includes('milestones?'));
      if (isMilestone) {
        const isSubtask = href.includes('subItemId=') || href.includes('subtaskId=');
        const isTask = !isSubtask && (href.includes('itemId=') || href.includes('taskId='));
        const tooltip = isSubtask
          ? t('notebook.jumpToSubtask', 'サブタスクへ移動（編集中は保存してジャンプ）')
          : isTask
            ? t('notebook.jumpToTask', 'タスクへ移動（編集中は保存してジャンプ）')
            : t('notebook.jumpToMilestone', 'マイルストーンへ移動（編集中は保存してジャンプ）');

        const badgeStyle = isSubtask
          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/30 hover:text-purple-100 hover:border-purple-400/50'
          : isTask
            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/35 hover:text-indigo-100 hover:border-indigo-400/50'
            : 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/35 hover:text-purple-100 hover:border-purple-400/50';

        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMilestoneLinkClick(href);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 mx-1 rounded-lg border ${badgeStyle} transition-all text-xs font-semibold cursor-pointer shadow-sm align-middle no-underline group`}
            title={tooltip}
            {...props}
          >
            {isSubtask ? (
              <ListTree className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform flex-shrink-0" />
            ) : isTask ? (
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform flex-shrink-0" />
            ) : (
              <Target className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform flex-shrink-0" />
            )}
            <span className="underline decoration-current/40 group-hover:decoration-current">{children}</span>
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline" {...props}>
          {children}
        </a>
      );
    },
    table: ({ node, children, ...props }: any) => {
      const hasImg = JSON.stringify(node).includes('"tagName":"img"');
      return (
        <table className={hasImg ? 'image-matrix-table' : undefined} {...props}>
          {children}
        </table>
      );
    },
    td: ({ node, children, ...props }: any) => {
      const hasImg = JSON.stringify(node).includes('"tagName":"img"');
      return (
        <td className={hasImg ? 'image-matrix-cell' : undefined} {...props}>
          {children}
        </td>
      );
    },
    p: ({ node, children, ...props }: any) => {
      const childArray = React.Children.toArray(children);
      const imgChildren = childArray.filter(
        (c: any) => c?.type === 'img' || c?.props?.src || (c?.props?.node?.tagName === 'img')
      );
      if (
        imgChildren.length >= 2 &&
        imgChildren.length === childArray.filter((c: any) => typeof c !== 'string' || (typeof c === 'string' && c.trim() !== '')).length
      ) {
        return (
          <div
            className="my-3 grid gap-3 items-center justify-items-center"
            style={{
              gridTemplateColumns: `repeat(${Math.min(imgChildren.length, 3)}, minmax(0, 1fr))`
            }}
          >
            {children}
          </div>
        );
      }
      return <p {...props}>{children}</p>;
    },
    img: ({ src, alt, title, style, ...props }: any) => {
      let displayAlt = alt || '';
      let customHeight: string | undefined = undefined;

      // 1. Support title syntax: ![alt](url "200px")
      if (title && /(\d+px|\d+%)/.test(title)) {
        customHeight = title;
      }

      // 2. Also support legacy/escaped alt | 200px syntax
      if (alt && typeof alt === 'string' && (alt.includes('|') || alt.includes('\\|'))) {
        const parts = alt.replace('\\|', '|').split('|').map((s: string) => s.trim());
        displayAlt = parts[0] || '';
        const sizePart = parts[1];
        if (sizePart && /(\d+px|\d+%)/.test(sizePart)) {
          customHeight = sizePart;
        }
      }

      return (
        <img
          src={src}
          alt={displayAlt}
          title={title && !/(\d+px|\d+%)/.test(title) ? title : undefined}
          style={{
            ...(style || {}),
            ...(customHeight ? { maxHeight: customHeight, objectFit: 'contain' } : {})
          }}
          {...props}
        />
      );
    }
  }), [handleMilestoneLinkClick, t]);

  const editorPreviewOptions = useMemo(() => ({
    remarkPlugins: mdRemarkPlugins,
    rehypePlugins: mdRehypePlugins,
    components: markdownComponents
  }), [markdownComponents]);

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      if (img.src) {
        setZoomImage({ src: img.src, alt: img.alt });
      }
      return;
    }
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (href.startsWith('/milestones') || href.includes('milestones?id=')) {
      e.preventDefault();
      e.stopPropagation();
      handleMilestoneLinkClick(href);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 min-h-full">
      {/* ─── Upper Section: Experiment Notebook ─── */}
      <div className="flex h-[620px] 2xl:h-[680px] gap-6 flex-shrink-0">
        {/* Sidebar List */}
        <div className="w-[340px] flex flex-col glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-glass">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Book className="w-5 h-5 text-indigo-400" />
            {t('notebook.title', '実験ノート')}
          </h1>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsPrintModalOpen(true)}
              className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
              title={t('notebook.printWithRange', '期間を指定して印刷')}
            >
              <Printer className="w-4 h-4" />
            </button>
            <button 
              onClick={handleNewNoteClick}
              className="p-2 rounded-full hover:bg-white/10 text-indigo-300 transition-colors"
              title={t('notebook.add', 'ノートを追加')}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isCreatingInline && (
          <div className="p-4 border-b border-white/10 bg-indigo-500/10 flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={inlineTitle}
                onChange={e => setInlineTitle(e.target.value)}
                placeholder={t('notebook.titlePlaceholder', 'タイトル...')}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 text-white min-w-0"
              />
              <input
                type="date"
                value={inlineDate}
                onChange={e => setInlineDate(e.target.value)}
                className="w-[130px] flex-shrink-0 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-indigo-500 text-white"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-300 w-fit transition-colors"
              >
                {showTemplates ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <FileTerminal className="w-3.5 h-3.5" />
                <span>{t('notebook.showTemplates', 'テンプレートを表示')} {showTemplates ? t('notebook.closeTemplates', '(閉じる)') : t('notebook.openTemplates', '(開く)')}</span>
              </button>
              {showTemplates && (
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 pt-0.5">
                  {TEMPLATES.map((tmpl, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => {
                        setInlineTitle(t(`notebook.templates.${tmpl.key}Title`, tmpl.title));
                        setInlineContent(t(`notebook.templates.${tmpl.key}Content`, tmpl.content));
                      }}
                      className="px-2 py-0.5 text-[10px] rounded border border-indigo-500/30 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 whitespace-nowrap transition-colors"
                    >
                      {t(`notebook.templates.${tmpl.key}`, tmpl.name)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div 
              data-color-mode="dark" 
              className={`border border-white/10 rounded-lg overflow-hidden ${
                !isWordWrap ? 'w-md-editor-nowrap' : 'w-md-editor-wrap'
              }`}
              onDrop={(e) => handleMarkdownDropWithCrop(e, handleOpenCrop)}
              onDragOver={handleMarkdownDragOver}
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
                highlightEnable={false}
                hideToolbar={false}
                commands={customCommands}
                previewOptions={editorPreviewOptions}
                textareaProps={{
                  placeholder: t('notebook.contentPlaceholder', '内容 (Markdown)...'),
                  onPaste: (e) => handleMarkdownPasteWithCrop(e, handleOpenCrop),
                  onDrop: (e) => handleMarkdownDropWithCrop(e, handleOpenCrop),
                  onDragOver: handleMarkdownDragOver,
                  wrap: isWordWrap ? 'soft' : 'off',
                }}
                style={{ borderRadius: '0', border: 'none' }}
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">{t('notebook.tags', 'タグ')}:</span>
              <TagInput value={inlineTags} onChange={setInlineTags} allTags={allTags} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">{t('notebook.relatedExperiment', '関連する実験')}:</span>
              <select
                value={inlineExperimentId}
                onChange={e => setInlineExperimentId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500 text-white"
              >
                <option value="">{t('notebook.unspecified', '-- 指定なし --')}</option>
                {scheduledExperiments.map(exp => (
                  <option key={exp.id} value={exp.id}>
                    {exp.start_date} | {exp.label ? `${exp.label} - ` : ''}{exp.experiment_type_name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => { setIsCreatingInline(false); setInlineNoteId(null); }} className="text-xs text-gray-400 hover:text-white px-2 py-1">{t('common.cancel', 'キャンセル')}</button>
              <button 
                onClick={async () => {
                  if (inlineTitle.trim()) {
                    await handleCreateInline(inlineTitle.trim(), inlineContent, inlineTags, inlineDate, inlineExperimentId, false);
                  }
                }}
                className="text-xs border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 px-3 py-1 rounded transition-colors"
                title="Ctrl+S"
              >
                {t('notebook.saveDraft', '一時保存')}
              </button>
              <button 
                onClick={async () => {
                  if (inlineTitle.trim()) {
                    await handleCreateInline(inlineTitle.trim(), inlineContent, inlineTags, inlineDate, inlineExperimentId, true);
                  }
                }}
                className="text-xs bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 transition-colors"
              >
                {t('notebook.createAndClose', '作成して閉じる')}
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
                {searchQuery || selectedDate ? t('notebook.searchResults', '検索結果') : t('notebook.recentNotes', '直近1週間のノート')}
              </h3>
              {(searchQuery || selectedDate) && (
                <button 
                  onClick={() => { setSearchQuery(''); setSelectedDate(undefined); }}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {t('notebook.clear', 'クリア')}
                </button>
              )}
            </div>
            
            {(searchQuery || selectedDate ? filteredNotes : recentNotes).length === 0 ? (
              <div className="text-center p-4 text-gray-500 text-sm bg-black/10 rounded-lg">
                {t('notebook.noNotesFound', 'ノートが見つかりません')}
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
                      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {note.date}</span>
                        <div className="flex items-center gap-2">
                          {note.updated_at && (
                            <span className="text-[10px] text-gray-500 font-mono" title={`${t('notebook.updatedAt', '更新日時')}: ${note.updated_at}`}>
                              {t('notebook.updatedAt', '更新')}: {note.updated_at.replace('T', ' ').substring(0, 10)}
                            </span>
                          )}
                          {note.scheduled_experiment_id && <FlaskConical className="w-3 h-3 text-emerald-400" />}
                        </div>
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
          <div className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-3">
            {/* Top Fixed Section: Actions, Title, Date, Tags, Experiment */}
            <div className="flex-shrink-0 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-medium">{t('notebook.edit', 'ノートを編集')}</h2>
                <div className="flex gap-2">
                  <button onClick={handleCancelEdit} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm">
                    <X className="w-4 h-4" /> {t('common.cancel', 'キャンセル')}
                  </button>
                  <button onClick={() => handleSaveNote(false)} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10" title="Ctrl+S">
                    <Check className="w-4 h-4" /> {t('notebook.saveDraft', '一時保存')}
                  </button>
                  <button onClick={() => handleSaveNote(true)} className="btn-primary py-1.5 px-3 flex items-center gap-1 text-sm">
                    <Check className="w-4 h-4" /> {t('notebook.saveAndClose', '保存して閉じる')}
                  </button>
                </div>
              </div>

              {(!selectedNote || !selectedNote.content) && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-300 w-fit transition-colors"
                  >
                    {showTemplates ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <FileTerminal className="w-3.5 h-3.5" />
                    <span>{t('notebook.showTemplates', 'テンプレートを表示')} {showTemplates ? t('notebook.closeTemplates', '(閉じる)') : t('notebook.openTemplates', '(開く)')}</span>
                  </button>
                  {showTemplates && (
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      {TEMPLATES.map((tmpl, idx) => (
                        <button 
                          key={idx} 
                          onClick={() => applyTemplate(tmpl)}
                          className="px-3 py-1 text-xs rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 whitespace-nowrap transition-colors"
                        >
                          {t(`notebook.templates.${tmpl.key}`, tmpl.name)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('notebook.noteTitle', 'タイトル')}</label>
                  <input 
                    type="text" 
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('notebook.date', '日付')}</label>
                  <input 
                    type="date" 
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><Tag className="w-3.5 h-3.5"/> {t('notebook.tags', 'タグ')}</label>
                  <TagInput value={editTags} onChange={setEditTags} allTags={allTags} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><FlaskConical className="w-3.5 h-3.5"/> {t('notebook.relatedExperiment', '関連する実験')}</label>
                  <select 
                    value={editExperimentId}
                    onChange={e => setEditExperimentId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors text-white"
                  >
                    <option value="">{t('notebook.unspecified', '-- 指定なし --')}</option>
                    {scheduledExperiments.map(exp => (
                      <option key={exp.id} value={exp.id}>
                        {exp.start_date} | {exp.label ? `${exp.label} - ` : ''}{exp.experiment_type_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Editor Section: Stretches to fill remaining height */}
            <div className="flex-1 min-h-0 flex flex-col" data-color-mode="dark">
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <label className="block text-xs text-gray-400 m-0">{t('notebook.content', '内容 (Markdown)')}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCitationTargetApi(null);
                      setCitationModalOpen(true);
                    }}
                    className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 text-[11px] flex items-center gap-1 transition-colors"
                    title={t('citation.insertCitationTooltip', '登録済み文献から引用タグ [@lit:ID] を挿入')}
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>{t('citation.insertCitationBtn', '引用番号の挿入')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSyncBibliography(false)}
                    className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-[11px] flex items-center gap-1 transition-colors"
                    title={t('citation.syncBibTooltip', '本文末尾に文献番号付きの参考文献リスト（末尾引用）を挿入・同期')}
                  >
                    <span>{t('citation.syncBibBtn', '末尾引用を挿入')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMilestoneTargetApi(null);
                      setMilestoneModalOpen(true);
                    }}
                    className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 text-[11px] flex items-center gap-1 transition-colors"
                    title={t('notebook.insertMilestoneTooltip', '特定のマイルストーンへのリンクを挿入')}
                  >
                    <Target className="w-3 h-3 text-purple-400" />
                    <span>{t('notebook.insertMilestoneBtn', 'マイルストーンリンク')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGridTargetApi(null);
                      setGridModalOpen(true);
                    }}
                    className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 text-[11px] flex items-center gap-1 transition-colors"
                    title={t('notebook.insertImageGridTooltip', '画像を2行2列などの行列グリッドで配置')}
                  >
                    <Grid2X2 className="w-3 h-3 text-blue-400" />
                    <span>{t('notebook.imageGridBtn', '画像グリッド')}</span>
                  </button>

                  <div className="h-3 w-px bg-white/20 mx-1" />

                  {/* Word Wrap / Horizontal Scroll Toggle */}
                  <button
                    type="button"
                    onClick={handleToggleWordWrap}
                    className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors border ${
                      !isWordWrap
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                    }`}
                    title={isWordWrap ? t('notebook.enableHScroll', '横スクロールを有効にする (折り返し無効)') : t('notebook.enableWordWrap', '行末で折り返す')}
                  >
                    <WrapText className="w-3 h-3" />
                    <span>{!isWordWrap ? t('notebook.hScroll', '横スクロール') : t('notebook.wordWrap', '折り返し')}</span>
                  </button>

                  {/* Preview Mode Segmented Buttons */}
                  <div className="flex items-center rounded bg-white/5 p-0.5 border border-white/10">
                    <button
                      type="button"
                      onClick={() => handlePreviewModeChange('edit')}
                      className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
                        editorPreviewMode === 'edit'
                          ? 'bg-indigo-600 text-white font-medium shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      title={t('notebook.editorOnlyTooltip', 'プレビューを非表示にして編集欄を全幅化')}
                    >
                      <PenLine className="w-3 h-3" />
                      <span>{t('notebook.editorOnly', '編集のみ')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewModeChange('live')}
                      className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
                        editorPreviewMode === 'live'
                          ? 'bg-indigo-600 text-white font-medium shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      title={t('notebook.liveSplitTooltip', 'エディタとプレビューを左右分割表示')}
                    >
                      <Columns2 className="w-3 h-3" />
                      <span>{t('notebook.liveSplit', '分割')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewModeChange('preview')}
                      className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
                        editorPreviewMode === 'preview'
                          ? 'bg-indigo-600 text-white font-medium shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      title={t('notebook.previewOnlyTooltip', 'プレビューのみ全幅表示')}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{t('notebook.previewOnly', 'プレビュー')}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div 
                className={`flex-1 min-h-0 overflow-hidden rounded-lg border border-white/10 flex flex-col ${
                  !isWordWrap ? 'w-md-editor-nowrap' : 'w-md-editor-wrap'
                }`}
                onClick={handleContainerClick}
                onDrop={(e) => handleMarkdownDropWithCrop(e, handleOpenCrop)}
                onDragOver={handleMarkdownDragOver}
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
                  preview={editorPreviewMode}
                  highlightEnable={false}
                  hideToolbar={false}
                  commands={customCommands}
                  previewOptions={editorPreviewOptions}
                  textareaProps={{
                    placeholder: t('notebook.placeholder', '実験の記録やメモをMarkdown形式で記述してください...'),
                    onPaste: (e) => handleMarkdownPasteWithCrop(e, handleOpenCrop),
                    onDrop: (e) => handleMarkdownDropWithCrop(e, handleOpenCrop),
                    onDragOver: handleMarkdownDragOver,
                    onScroll: handleTextareaScroll,
                    wrap: isWordWrap ? 'soft' : 'off',
                  }}
                  style={{ borderRadius: '0', border: 'none', height: '100%', flex: '1 1 0%', minHeight: 0 }}
                />
              </div>
            </div>
          </div>
        ) : selectedNote ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-6 bg-white/5 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-100">{selectedNote.title}</h2>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                    <CalendarIcon className="w-4 h-4 text-indigo-400" />
                    <span>{t('notebook.experimentDate', '実験日')}: {selectedNote.date}</span>
                  </span>
                  {selectedNote.created_at && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-gray-300">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{t('notebook.createdAt', '作成日時')}: {selectedNote.created_at.replace('T', ' ').substring(0, 16)}</span>
                    </span>
                  )}
                  {selectedNote.updated_at && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-gray-300">
                      <History className="w-3.5 h-3.5 text-gray-400" />
                      <span>{t('notebook.updatedAt', '更新日時')}: {selectedNote.updated_at.replace('T', ' ').substring(0, 16)}</span>
                    </span>
                  )}
                  {selectedNote.scheduled_experiment_id && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <FlaskConical className="w-3.5 h-3.5" /> {t('notebook.hasRelatedExperiment', '関連実験あり')}
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
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsPrintModalOpen(true)}
                  className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm text-gray-300 hover:text-white"
                  title={t('notebook.printWithRange', '期間を指定して印刷')}
                >
                  <Printer className="w-4 h-4" /> {t('notebook.print', '印刷')}
                </button>
                <button onClick={handleEditNote} className="btn-secondary py-1.5 px-3 flex items-center gap-1 text-sm">
                  <FileText className="w-4 h-4" /> {t('common.edit', '編集')}
                </button>
                <button onClick={() => handleDeleteNote(selectedNote.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="h-px bg-white/10 w-full" />
            
            <div 
              className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0d1117]" 
              data-color-mode="dark"
              onClick={handleContainerClick}
            >
              <MDEditor.Markdown
                source={processedNoteContent || t('notebook.emptyContent', '*本文はありません*')}
                style={{ backgroundColor: 'transparent' }}
                remarkPlugins={mdRemarkPlugins}
                rehypePlugins={mdRehypePlugins}
                components={markdownComponents}
              />
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

    {/* ─── Lower Section: Custom Lab Databases (Primers, Transformants, Antibodies, etc.) ─── */}
    <CustomDatabaseManager />

    {/* ─── Bottom Section: Research Documents & Reports ─── */}
    <DocumentManager />

    {/* ─── Print Notes Modal ─── */}
    <PrintNotesModal 
      isOpen={isPrintModalOpen} 
      onClose={() => setIsPrintModalOpen(false)} 
      notes={notes} 
      literatures={literatures}
      citationStyle={citationStyle}
    />

    {/* ─── Citation Picker Modal ─── */}
    <CitationPickerModal
      isOpen={citationModalOpen}
      onClose={() => {
        setCitationModalOpen(false);
        setCitationTargetApi(null);
      }}
      onInsertCitation={handleInsertCitations}
      onInsertBibliography={() => handleSyncBibliography(isCreatingInline)}
      selectedStyle={citationStyle}
      onStyleChange={handleCitationStyleChange}
      literatures={literatures}
    />

    {/* ─── Milestone Picker Modal ─── */}
    <MilestonePickerModal
      isOpen={milestoneModalOpen}
      onClose={() => {
        setMilestoneModalOpen(false);
        setMilestoneTargetApi(null);
      }}
      onSelectMilestone={handleSelectMilestone}
      onSelectLink={handleSelectMilestoneLink}
    />

    {/* ─── Image Crop & Orientation Modal ─── */}
    <ImageCropModal
      isOpen={cropModalOpen}
      file={cropFile}
      onClose={() => {
        setCropModalOpen(false);
        setCropFile(null);
        setCropTargetApi(null);
      }}
      onConfirm={handleCropConfirm}
    />

    {/* ─── Image Grid (Matrix Layout) Modal ─── */}
    <ImageGridModal
      isOpen={gridModalOpen}
      onClose={() => {
        setGridModalOpen(false);
        setGridTargetApi(null);
      }}
      onInsertGrid={handleInsertImageGrid}
    />

    {/* ─── Click-to-Zoom Lightbox for Markdown Images ─── */}
    {zoomImage && (
      <div
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
        onClick={() => setZoomImage(null)}
      >
        <div 
          className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={zoomImage.src}
            alt={zoomImage.alt || 'Enlarged view'}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/20"
          />
          {zoomImage.alt && (
            <p className="text-xs text-gray-300 mt-2 bg-black/60 px-3 py-1 rounded">
              {zoomImage.alt}
            </p>
          )}
          <button
            onClick={() => setZoomImage(null)}
            className="absolute -top-3 -right-3 p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 shadow-lg border border-white/20 cursor-pointer"
            title={t('common.close', '閉じる')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )}
  </div>
);
}
