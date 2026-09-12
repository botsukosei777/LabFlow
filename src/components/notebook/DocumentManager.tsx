import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText, Plus, Search, Trash2, Edit3, Download,
  X, Tag, FlaskConical, BookOpen,
  Calendar, Eye, ExternalLink, Link2, Check, Filter,
  Columns, Maximize2, Minimize2
} from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { api } from '../../api/client';
import { ToastContext } from '../../App';
import type { ResearchDocument, ExperimentType, LiteratureItem } from '../../types';

export const DocumentManager: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);

  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [experimentTypes, setExperimentTypes] = useState<ExperimentType[]>([]);
  const [literatures, setLiteratures] = useState<LiteratureItem[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');

  // Search & Filter state inside Modal
  const [expSearchQuery, setExpSearchQuery] = useState('');
  const [litSearchQuery, setLitSearchQuery] = useState('');
  const [litSelectedTag, setLitSelectedTag] = useState('');

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeDoc, setActiveDoc] = useState<ResearchDocument | null>(null);

  // PDF Preview side-by-side state in Edit modal
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    id?: number;
    title: string;
    content: string;
    tags: string[];
    linked_experiment_type_ids: number[];
    linked_literature_ids: number[];
  }>({
    title: '',
    content: '',
    tags: [],
    linked_experiment_type_ids: [],
    linked_literature_ids: []
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  // Fetch documents and tags
  const loadDocuments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedTag) params.append('tag', selectedTag);

      const [docs, tags] = await Promise.all([
        api.get<ResearchDocument[]>(`/documents?${params.toString()}`),
        api.get<string[]>('/documents/tags')
      ]);

      setDocuments(docs || []);
      setAllTags(tags || []);
    } catch (err: any) {
      console.error(err);
      addToast('error', t('common.errorOccurred', 'ドキュメントの取得に失敗しました'));
    } finally {
      setLoading(false);
    }
  };

  // Fetch available experiment types and literature for linking
  const loadMetadata = async () => {
    try {
      const [expTypes, lits] = await Promise.all([
        api.get<any>('/experiments'),
        api.get<any>('/literature')
      ]);
      setExperimentTypes(Array.isArray(expTypes) ? expTypes : (expTypes?.data || []));
      setLiteratures(Array.isArray(lits) ? lits : (lits?.items || lits?.data || []));
    } catch (err) {
      console.error('Failed to load experiment types or literature for documents:', err);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDocuments();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedTag]);

  // Unique literature tags extraction
  const allLiteratureTags = useMemo(() => {
    const set = new Set<string>();
    literatures.forEach(lit => {
      if (Array.isArray(lit.keywords)) {
        lit.keywords.forEach(k => {
          if (k && typeof k === 'string' && k.trim()) set.add(k.trim());
        });
      } else if (typeof (lit as any).keywords === 'string') {
        try {
          const parsed = JSON.parse((lit as any).keywords);
          if (Array.isArray(parsed)) parsed.forEach(k => { if (k && typeof k === 'string' && k.trim()) set.add(k.trim()); });
        } catch {
          // ignore
        }
      }
    });
    return Array.from(set).sort();
  }, [literatures]);

  // Filtered experiments in modal
  const filteredExperiments = useMemo(() => {
    if (!expSearchQuery.trim()) return experimentTypes;
    const q = expSearchQuery.trim().toLowerCase();
    return experimentTypes.filter(exp => 
      (exp.name && exp.name.toLowerCase().includes(q)) ||
      (exp.description && exp.description.toLowerCase().includes(q))
    );
  }, [experimentTypes, expSearchQuery]);

  // Filtered literature in modal
  const filteredLiteratures = useMemo(() => {
    return literatures.filter(lit => {
      // Keyword/tag filter
      if (litSelectedTag) {
        let kws: string[] = [];
        if (Array.isArray(lit.keywords)) kws = lit.keywords;
        else if (typeof (lit as any).keywords === 'string') {
          try { kws = JSON.parse((lit as any).keywords); } catch { kws = []; }
        }
        if (!kws.some(k => k.toLowerCase() === litSelectedTag.toLowerCase())) {
          return false;
        }
      }

      // Text search query
      if (litSearchQuery.trim()) {
        const q = litSearchQuery.trim().toLowerCase();
        const inTitle = (lit.title || '').toLowerCase().includes(q);
        const inAuthors = (lit.authors || '').toLowerCase().includes(q);
        const inJournal = (lit.journal || '').toLowerCase().includes(q);
        const inYear = lit.year ? String(lit.year).includes(q) : false;
        let inTags = false;
        if (Array.isArray(lit.keywords)) {
          inTags = lit.keywords.some(k => k.toLowerCase().includes(q));
        }
        if (!inTitle && !inAuthors && !inJournal && !inYear && !inTags) {
          return false;
        }
      }

      return true;
    });
  }, [literatures, litSearchQuery, litSelectedTag]);

  // Filtered document tags for the toolbar filter
  const filteredDocumentTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return allTags;
    const q = tagSearchQuery.trim().toLowerCase();
    return allTags.filter(t => t.toLowerCase().includes(q));
  }, [allTags, tagSearchQuery]);

  // Open Create
  const handleOpenCreate = () => {
    loadMetadata();
    setExpSearchQuery('');
    setLitSearchQuery('');
    setLitSelectedTag('');
    setActivePdfUrl(null);
    setActivePdfTitle(null);
    setActiveDoc(null);
    setFormData({
      title: '',
      content: '',
      tags: [],
      linked_experiment_type_ids: [],
      linked_literature_ids: []
    });
    setTagInput('');
    setShowEditModal(true);
  };

  // Open Edit
  const handleOpenEdit = (doc: ResearchDocument) => {
    loadMetadata();
    setExpSearchQuery('');
    setLitSearchQuery('');
    setLitSelectedTag('');
    setActivePdfUrl(null);
    setActivePdfTitle(null);
    setActiveDoc(doc);
    setFormData({
      id: doc.id,
      title: doc.title,
      content: doc.content || '',
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      linked_experiment_type_ids: Array.isArray(doc.linked_experiment_type_ids) ? doc.linked_experiment_type_ids : [],
      linked_literature_ids: Array.isArray(doc.linked_literature_ids) ? doc.linked_literature_ids : []
    });
    setTagInput('');
    setShowEditModal(true);
  };

  // Open Detail
  const handleOpenDetail = (doc: ResearchDocument) => {
    setActiveDoc(doc);
    setShowDetailModal(true);
  };

  // Save Document (closeOnSuccess: false => 一時保存)
  const handleSaveDocument = async (closeOnSuccess = true) => {
    if (!formData.title.trim()) {
      addToast('warning', t('documents.documentTitlePlaceholder', 'ドキュメント名を入力してください'));
      return;
    }

    if (closeOnSuccess) {
      setSaving(true);
    } else {
      setDraftSaving(true);
    }

    try {
      if (formData.id) {
        const res = await api.put<ResearchDocument>(`/documents/${formData.id}`, formData);
        setFormData(prev => ({ ...prev, id: res.id }));
        addToast('success', closeOnSuccess ? t('documents.saveSuccess', 'ドキュメントを保存しました') : t('documents.draftSaved', '一時保存しました'));
      } else {
        const res = await api.post<ResearchDocument>('/documents', formData);
        setFormData(prev => ({ ...prev, id: res.id }));
        addToast('success', closeOnSuccess ? t('documents.saveSuccess', 'ドキュメントを作成しました') : t('documents.draftSaved', '一時保存しました'));
      }

      if (closeOnSuccess) {
        setShowEditModal(false);
      }
      loadDocuments();
    } catch (err: any) {
      addToast('error', err.message || t('common.errorOccurred', '保存に失敗しました'));
    } finally {
      setSaving(false);
      setDraftSaving(false);
    }
  };

  // Delete Document
  const handleDeleteDocument = async (id: number) => {
    if (!window.confirm(t('documents.confirmDelete', 'このドキュメントを削除してもよろしいですか？'))) return;
    try {
      await api.delete(`/documents/${id}`);
      addToast('success', t('documents.deleteSuccess', 'ドキュメントを削除しました'));
      if (showDetailModal && activeDoc?.id === id) setShowDetailModal(false);
      loadDocuments();
    } catch (err: any) {
      addToast('error', err.message || t('common.errorOccurred', '削除に失敗しました'));
    }
  };

  // Tag Helpers
  const addTag = (tagToAdd?: string) => {
    const target = (tagToAdd || tagInput).trim();
    if (target && !formData.tags.includes(target)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, target] }));
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
  };

  // Link / Unlink Helpers
  const toggleLinkExp = (id: number) => {
    setFormData(prev => ({
      ...prev,
      linked_experiment_type_ids: prev.linked_experiment_type_ids.includes(id)
        ? prev.linked_experiment_type_ids.filter(x => x !== id)
        : [...prev.linked_experiment_type_ids, id]
    }));
  };

  const toggleLinkLit = (id: number) => {
    setFormData(prev => ({
      ...prev,
      linked_literature_ids: prev.linked_literature_ids.includes(id)
        ? prev.linked_literature_ids.filter(x => x !== id)
        : [...prev.linked_literature_ids, id]
    }));
  };

  // Insert snippets into Markdown content
  const insertExpSummary = (exp: ExperimentType) => {
    const text = `\n### 🔬 ${t('documents.expSnippetTitle', '実験種')}: ${exp.name}\n- **${t('documents.expSnippetDesc', '説明')}**: ${exp.description || t('documents.none', 'なし')}\n`;
    setFormData(prev => ({ ...prev, content: prev.content + text }));
    addToast('info', t('documents.expInserted', { name: exp.name }));
  };

  const insertLitCitation = (lit: LiteratureItem) => {
    const citation = `\n> 📖 **${lit.title}** (${lit.authors || t('documents.unknownAuthor', '著者不明')}, ${lit.year || t('documents.unknownYear', '年不明')})\n> *${lit.journal || 'Journal'}* ${lit.doi ? `[DOI: ${lit.doi}](https://doi.org/${lit.doi})` : ''}\n`;
    setFormData(prev => ({ ...prev, content: prev.content + citation }));
    addToast('info', t('documents.litInserted', '文献の引用を本文に挿入しました'));
  };

  // Export Markdown file
  const handleExportMarkdown = (doc: ResearchDocument) => {
    const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[\/\\?%*:|"<>]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('success', t('documents.exportMarkdown', 'Markdownをエクスポートしました'));
  };

  return (
    <div className="bg-[#161b22] border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-lg mt-8">
      {/* ─── Top Header ─── */}
      <div className="p-4 border-b border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-100 flex items-center gap-2 text-base">
              {t('documents.title', '研究ドキュメント / リポート')}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                {t('documents.docCount', { count: documents.length })}
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('documents.subtitle', '登録済みの実験種や文献を紐づけ、研究レポートやプロトコルレビューとして文章にまとめることができます。')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>{t('documents.newDocument', '新規ドキュメント作成')}</span>
          </button>
        </div>
      </div>

      {/* ─── Search & Tags Toolbar ─── */}
      <div className="p-3 border-b border-white/10 bg-[#0d1117] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-[500px]">
          {/* Document Content / Title search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('documents.searchPlaceholder', 'タイトルや内容を検索...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input text-xs pl-9 pr-3 py-1.5 w-full bg-white/5 border-white/10 focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Document Tag text filter */}
          <div className="relative w-[160px] flex-shrink-0">
            <Tag className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('documents.searchByTag', 'タグで検索...')}
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              className="form-input text-xs pl-8 pr-2.5 py-1.5 w-full bg-white/5 border-white/10 focus:border-emerald-500"
            />
            {tagSearchQuery && (
              <button
                onClick={() => setTagSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tag Filters list */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar max-w-full">
          <button
            onClick={() => setSelectedTag('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
              !selectedTag
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t('documents.filterByTag', 'すべてのタグ')}
          </button>
          {filteredDocumentTags.map((tag, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 flex-shrink-0 ${
                selectedTag === tag
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              <Tag className="w-3 h-3" />
              <span>#{tag}</span>
            </button>
          ))}
          {filteredDocumentTags.length === 0 && tagSearchQuery && (
            <span className="text-xs text-gray-500 italic px-2">{t('documents.noTagsFound', '一致するタグがありません')}</span>
          )}
        </div>
      </div>

      {/* ─── Document Cards Grid ─── */}
      <div className="p-4 bg-[#0d1117] min-h-[160px]">
        {loading ? (
          <div className="py-12 flex justify-center items-center text-gray-400 text-sm">
            <span className="animate-spin mr-2">⏳</span> {t('common.loading', '読み込み中...')}
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-gray-500">
            <FileText className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium text-gray-400">
              {t('documents.noDocuments', '作成されたドキュメントはまだありません。「新規ドキュメント作成」から作成してみましょう。')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-[#161b22] border border-white/10 hover:border-emerald-500/40 rounded-xl p-4 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4
                      onClick={() => handleOpenDetail(doc)}
                      className="font-semibold text-gray-100 group-hover:text-emerald-300 cursor-pointer line-clamp-2 text-sm leading-snug"
                    >
                      {doc.title}
                    </h4>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEdit(doc)}
                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                        title={t('common.edit', '編集')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportMarkdown(doc)}
                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                        title={t('documents.exportMarkdown', 'Markdownエクスポート')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400"
                        title={t('common.delete', '削除')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-3 mb-3 leading-relaxed">
                    {doc.content.replace(/[#*`_~>]/g, '').trim().substring(0, 150) || t('documents.noContent', '(本文なし)')}
                  </p>
                </div>

                <div>
                  {/* Linked Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    {doc.linked_experiment_types && doc.linked_experiment_types.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 text-[11px]">
                        <FlaskConical className="w-3 h-3" />
                        {t('documents.expCount', '{{count}} 実験種', { count: doc.linked_experiment_types.length })}
                      </span>
                    )}
                    {doc.linked_literatures && doc.linked_literatures.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 text-[11px]">
                        <BookOpen className="w-3 h-3" />
                        {t('documents.litCount', '{{count}} 文献', { count: doc.linked_literatures.length })}
                      </span>
                    )}
                  </div>

                  {/* Tags */}
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mb-3">
                      {doc.tags.map((tg, idx) => (
                        <span
                          key={idx}
                          onClick={() => setSelectedTag(tg)}
                          className="px-2 py-0.5 rounded text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer"
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer date & view */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {doc.updated_at ? doc.updated_at.substring(0, 10) : ''}
                    </span>
                    <button
                      onClick={() => handleOpenDetail(doc)}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                    >
                      <span>{t('documents.viewDocument', 'ドキュメント詳細')}</span>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── CREATE / EDIT MODAL ─── */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div
            className="modal modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: activePdfUrl ? '96vw' : '100%',
              maxWidth: activePdfUrl ? '1400px' : '980px',
              maxHeight: '94vh',
              transition: 'all 0.2s ease'
            }}
          >
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span>
                  {formData.id
                    ? t('documents.editDocument', 'ドキュメントを編集')
                    : t('documents.newDocument', '新規ドキュメント作成')}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={draftSaving || saving}
                  onClick={() => handleSaveDocument(false)}
                  className="btn btn-secondary btn-sm flex items-center gap-1 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                  title="Ctrl+S"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{draftSaving ? t('common.loading', '保存中...') : t('documents.saveDraft', '一時保存')}</span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setShowEditModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveDocument(true); }}>
              <div className="modal-body overflow-y-auto max-h-[calc(92vh-140px)] custom-scrollbar space-y-4">
                {/* Title */}
                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">
                    {t('documents.documentTitle', 'ドキュメント名')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input text-sm"
                    placeholder={t('documents.documentTitlePlaceholder', '例: CRISPR-Cas9を用いた遺伝子ノックアウトプロトコルと参考文献まとめ')}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* Tags */}
                <div className="form-group">
                  <label className="form-label font-bold text-gray-200">
                    {t('documents.tags', 'タグ')}
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      list="doc-tags-list"
                      className="form-input text-xs flex-1"
                      placeholder={t('documents.tagsPlaceholder', 'タグを追加 (Enterで確定)')}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                    />
                    <datalist id="doc-tags-list">
                      {allTags.map((tg, idx) => (
                        <option key={idx} value={tg} />
                      ))}
                    </datalist>
                    {allTags.length > 0 && (
                      <select
                        className="form-select text-xs"
                        style={{ maxWidth: '160px' }}
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            addTag(e.target.value);
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">{t('documents.selectFromTags', 'タグから選ぶ...')}</option>
                        {allTags.filter(tg => !formData.tags.includes(tg)).map((tg, idx) => (
                          <option key={idx} value={tg}>{tg}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => addTag()}>
                      {t('common.add', '追加')}
                    </button>
                  </div>

                  {/* Active tags badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {formData.tags.map((tg, idx) => (
                      <span key={idx} className="tag active text-xs flex items-center gap-1">
                        #{tg}
                        <X size={12} className="cursor-pointer" onClick={() => removeTag(tg)} />
                      </span>
                    ))}
                  </div>

                  {/* Quick-add suggestions from existing tags */}
                  {allTags.filter(tg => !formData.tags.includes(tg)).length > 0 && (
                    <div className="mt-2 text-[11px] text-gray-400">
                      <span className="mr-1.5">{t('documents.existingTags', '既存のタグから選択:')}</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {allTags.filter(tg => !formData.tags.includes(tg)).slice(0, 10).map((tg, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="tag text-[11px] py-0.5 px-2"
                            onClick={() => addTag(tg)}
                          >
                            + {tg}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Linking Experiment Types & Literature with Search & Tag Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-white/[0.02] border border-white/10 rounded-lg">
                  {/* Experiments Section */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="form-label font-bold text-gray-200 flex items-center gap-1.5 text-xs m-0">
                        <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{t('documents.linkedExperiments', '紐付けられた実験種')}</span>
                        <span className="text-[10px] text-gray-500 font-normal">
                          {t('documents.selectedCount', '({{selected}}件選択中 / 全{{total}}件)', { selected: formData.linked_experiment_type_ids.length, total: experimentTypes.length })}
                        </span>
                      </label>
                    </div>

                    {/* Experiment search bar */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder={t('documents.searchExperiments', '実験種を検索...')}
                        value={expSearchQuery}
                        onChange={(e) => setExpSearchQuery(e.target.value)}
                        className="form-input text-xs pl-8 pr-6 py-1 w-full bg-[#0d1117] border-white/10 focus:border-indigo-500"
                      />
                      {expSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setExpSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-[160px] overflow-y-auto custom-scrollbar space-y-1 p-1 bg-[#0d1117] rounded border border-white/5 flex-1">
                      {experimentTypes.length === 0 ? (
                        <div className="text-xs text-gray-500 p-2">{t('documents.noExperiments', '実験種がまだ登録されていません')}</div>
                      ) : filteredExperiments.length === 0 ? (
                        <div className="text-xs text-gray-500 p-2 italic">{t('documents.noMatchingExperiments', '一致する実験種が見つかりません')}</div>
                      ) : (
                        filteredExperiments.map(exp => {
                          const isLinked = formData.linked_experiment_type_ids.includes(exp.id);
                          return (
                            <div
                              key={exp.id}
                              className={`flex items-center justify-between p-1.5 rounded text-xs transition-colors ${
                                isLinked ? 'bg-indigo-500/20 text-indigo-200' : 'text-gray-300 hover:bg-white/5'
                              }`}
                            >
                              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isLinked}
                                  onChange={() => toggleLinkExp(exp.id)}
                                  className="rounded"
                                />
                                <span className="truncate">{exp.name}</span>
                              </label>
                              {isLinked && (
                                <button
                                  type="button"
                                  onClick={() => insertExpSummary(exp)}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 ml-2 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 flex-shrink-0"
                                  title={t('documents.insertExperimentSummary', '本文に実験情報を挿入')}
                                >
                                  {t('documents.insertContent', '+ 本文挿入')}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Literature Section */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="form-label font-bold text-gray-200 flex items-center gap-1.5 text-xs m-0">
                        <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t('documents.linkedLiterature', '紐付けられた文献')}</span>
                        <span className="text-[10px] text-gray-500 font-normal">
                          {t('documents.selectedCount', '({{selected}}件選択中 / 全{{total}}件)', { selected: formData.linked_literature_ids.length, total: literatures.length })}
                        </span>
                      </label>
                    </div>

                    {/* Literature search & tag filters */}
                    <div className="flex flex-col sm:flex-row gap-1.5 mb-2">
                      <div className="relative flex-1 min-w-0">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder={t('documents.searchLiterature', '文献を検索 (タイトル・著者・ジャーナル)...')}
                          value={litSearchQuery}
                          onChange={(e) => setLitSearchQuery(e.target.value)}
                          className="form-input text-xs pl-8 pr-6 py-1 w-full bg-[#0d1117] border-white/10 focus:border-emerald-500"
                        />
                        {litSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setLitSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {allLiteratureTags.length > 0 && (
                        <div className="relative w-full sm:w-[150px] flex-shrink-0">
                          <select
                            value={litSelectedTag}
                            onChange={(e) => setLitSelectedTag(e.target.value)}
                            className="form-select text-xs py-1 px-2.5 w-full bg-[#0d1117] border-white/10 text-gray-300 focus:border-emerald-500 truncate"
                            title={t('documents.filterLiteratureByTag', '文献タグで絞り込み...')}
                          >
                            <option value="">{t('documents.allLiteratureTags', 'すべての文献タグ')}</option>
                            {allLiteratureTags.map((tag, idx) => (
                              <option key={idx} value={tag}>#{tag}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="max-h-[160px] overflow-y-auto custom-scrollbar space-y-1 p-1 bg-[#0d1117] rounded border border-white/5 flex-1">
                      {literatures.length === 0 ? (
                        <div className="text-xs text-gray-500 p-2">{t('documents.noLiterature', '文献がまだ登録されていません')}</div>
                      ) : filteredLiteratures.length === 0 ? (
                        <div className="text-xs text-gray-500 p-2 italic">{t('documents.noMatchingLiterature', '一致する文献が見つかりません')}</div>
                      ) : (
                        filteredLiteratures.map(lit => {
                          const isLinked = formData.linked_literature_ids.includes(lit.id);
                          return (
                            <div
                              key={lit.id}
                              className={`flex items-center justify-between p-1.5 rounded text-xs transition-colors ${
                                isLinked ? 'bg-emerald-500/20 text-emerald-200' : 'text-gray-300 hover:bg-white/5'
                              }`}
                            >
                              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isLinked}
                                  onChange={() => toggleLinkLit(lit.id)}
                                  className="rounded"
                                />
                                <div className="truncate min-w-0" title={lit.title}>
                                  <span className="font-medium">{lit.title}</span>
                                  <span className="text-[11px] text-gray-400 ml-1.5">
                                    ({lit.authors || t('documents.unknownAuthor', '著者不明')}, {lit.year || t('documents.unknownYear', '年不明')})
                                  </span>
                                </div>
                              </label>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {lit.pdf_path && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const url = `/api/literature/files/${lit.pdf_path}`;
                                      if (activePdfUrl === url) {
                                        setActivePdfUrl(null);
                                        setActivePdfTitle(null);
                                      } else {
                                        setActivePdfUrl(url);
                                        setActivePdfTitle(lit.title);
                                      }
                                    }}
                                    className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                      activePdfUrl === `/api/literature/files/${lit.pdf_path}`
                                        ? 'bg-emerald-500 text-white font-bold shadow-sm'
                                        : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40'
                                    }`}
                                    title={t('documents.openPdfSplit', 'PDFを横に開いて編集')}
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span>{activePdfUrl === `/api/literature/files/${lit.pdf_path}` ? t('documents.viewingPdf', 'PDF表示中') : t('documents.openPdf', 'PDFを開く')}</span>
                                  </button>
                                )}
                                {isLinked && (
                                  <button
                                    type="button"
                                    onClick={() => insertLitCitation(lit)}
                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30"
                                    title={t('documents.insertLiteratureCitation', '本文に引用を挿入')}
                                  >
                                    {t('documents.insertCitation', '+ 引用')}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Markdown Editor & PDF Side-by-Side Split View */}
                <div className="form-group">
                  <div className="flex items-center justify-between mb-1">
                    <label className="form-label font-bold text-gray-200 m-0">
                      {t('documents.content', '本文 (Markdown対応)')}
                    </label>
                    {activePdfUrl && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <Columns className="w-3.5 h-3.5" />
                          <span>{t('documents.viewingPdfSplit', 'PDFスプリット閲覧中: {{title}}', { title: activePdfTitle || t('documents.literaturePdf', '文献PDF') })}</span>
                        </span>
                        <a
                          href={activePdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gray-400 hover:text-white flex items-center gap-0.5"
                          title={t('documents.openInNewTab', '別タブで開く')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePdfUrl(null);
                            setActivePdfTitle(null);
                          }}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-0.5 ml-1"
                          title={t('documents.closePdf', 'PDFを閉じる')}
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{t('common.close', '閉じる')}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {activePdfUrl ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ minHeight: '520px' }}>
                      {/* Left: PDF Viewer */}
                      <div className="rounded-lg overflow-hidden border border-emerald-500/30 bg-[#0d1117] flex flex-col h-[520px]">
                        <div className="p-2 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-200 font-medium truncate">
                            <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="truncate">{activePdfTitle || t('documents.literaturePdf', '文献PDF')}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <a
                              href={activePdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200 text-[11px] flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>{t('documents.openInNewTab', '別タブ')}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                setActivePdfUrl(null);
                                setActivePdfTitle(null);
                              }}
                              className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                              title={t('documents.closePdf', 'PDFを閉じる')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <iframe
                          src={activePdfUrl}
                          className="w-full flex-1 border-none bg-slate-900"
                          title="Literature PDF Viewer"
                        />
                      </div>

                      {/* Right: Markdown Editor */}
                      <div 
                        data-color-mode="dark" 
                        className="rounded-lg overflow-hidden border border-white/10 flex flex-col h-[520px]"
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                            e.preventDefault();
                            handleSaveDocument(false);
                          }
                        }}
                      >
                        <MDEditor
                          value={formData.content}
                          onChange={(val) => setFormData({ ...formData, content: val || '' })}
                          height={470}
                          preview="edit"
                        />
                      </div>
                    </div>
                  ) : (
                    <div 
                      data-color-mode="dark" 
                      className="rounded-lg overflow-hidden border border-white/10"
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                          e.preventDefault();
                          handleSaveDocument(false);
                        }
                      }}
                    >
                      <MDEditor
                        value={formData.content}
                        onChange={(val) => setFormData({ ...formData, content: val || '' })}
                        height={340}
                        preview="edit"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  {t('common.cancel', 'キャンセル')}
                </button>
                <button
                  type="button"
                  disabled={draftSaving || saving}
                  onClick={() => handleSaveDocument(false)}
                  className="btn btn-secondary border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                  title="Ctrl+S"
                >
                  <Check className="w-4 h-4" />
                  <span>{draftSaving ? t('common.loading', '保存中...') : t('documents.saveDraft', '一時保存')}</span>
                </button>
                <button
                  type="submit"
                  disabled={saving || draftSaving}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {saving ? (
                    <span>{t('common.loading', '保存中...')}</span>
                  ) : (
                    <span>{t('documents.closeAndSave', '保存して閉じる')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DETAIL VIEW MODAL ─── */}
      {showDetailModal && activeDoc && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div
            className="modal modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '900px', maxHeight: '90vh' }}
          >
            <div className="modal-header">
              <div className="flex-1 pr-4">
                <h3 className="modal-title font-bold text-lg text-gray-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <span>{activeDoc.title}</span>
                </h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {t('documents.updatedAt', '更新日: {{date}}', { date: activeDoc.updated_at ? activeDoc.updated_at.substring(0, 16) : '' })}
                  </span>
                  {activeDoc.tags && activeDoc.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {activeDoc.tags.map((tg, idx) => (
                        <span key={idx} className="tag text-[10px] py-0 px-2">#{tg}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleOpenEdit(activeDoc);
                  }}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t('common.edit', '編集')}</span>
                </button>
                <button
                  onClick={() => handleExportMarkdown(activeDoc)}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('documents.exportMarkdown', 'エクスポート')}</span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setShowDetailModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body overflow-y-auto max-h-[calc(90vh-140px)] custom-scrollbar space-y-6">
              {/* Linked Metadata Highlights */}
              {((activeDoc.linked_experiment_types && activeDoc.linked_experiment_types.length > 0) ||
                (activeDoc.linked_literatures && activeDoc.linked_literatures.length > 0)) && (
                <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-emerald-400" />
                    <span>{t('documents.linkedInfo', '紐付け情報')}</span>
                  </h4>

                  {/* Experiments list */}
                  {activeDoc.linked_experiment_types && activeDoc.linked_experiment_types.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-1.5">{t('documents.experiments', '実験種:')}</span>
                      <div className="flex flex-wrap gap-2">
                        {activeDoc.linked_experiment_types.map(exp => (
                          <div
                            key={exp.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                            <span className="font-medium">{exp.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Literature list */}
                  {activeDoc.linked_literatures && activeDoc.linked_literatures.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-1.5">{t('documents.literature', '文献:')}</span>
                      <div className="flex flex-col gap-1.5">
                        {activeDoc.linked_literatures.map(lit => (
                          <div
                            key={lit.id}
                            className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-emerald-200 block truncate">{lit.title}</span>
                              <span className="text-gray-400 text-[11px] block">
                                {lit.authors} {lit.year ? `(${lit.year})` : ''} - {lit.journal}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {lit.pdf_path && (
                                <a
                                  href={`/api/literature/files/${lit.pdf_path}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20"
                                  title={t('documents.openPdf', 'PDFを開く')}
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>PDF</span>
                                </a>
                              )}
                              {lit.doi && (
                                <a
                                  href={`https://doi.org/${lit.doi}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px]"
                                >
                                  <span>DOI</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Markdown Content */}
              <div
                className="p-6 bg-[#0d1117] rounded-xl border border-white/10 custom-scrollbar"
                data-color-mode="dark"
              >
                <MDEditor.Markdown
                  source={activeDoc.content || t('documents.noContentMarkdown', '*本文はありません*')}
                  style={{ backgroundColor: 'transparent' }}
                />
              </div>
            </div>

            <div className="modal-footer flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDeleteDocument(activeDoc.id)}
                className="btn btn-danger btn-sm flex items-center gap-1 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('documents.deleteDocument', 'ドキュメント削除')}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDetailModal(false)}
              >
                {t('common.close', '閉じる')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
