import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { ToastContext } from '../App';
import type { LiteratureItem, PaperType } from '../types';
import {
  Library,
  Plus,
  Upload,
  Search,
  Filter,
  FileText,
  Paperclip,
  ExternalLink,
  CheckSquare,
  Square,
  Edit2,
  Trash2,
  Eye,
  Download,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Clock,
  X,
  Tag,
  Building,
  Calendar,
  Layers,
  Share2
} from 'lucide-react';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';

const PAPER_TYPE_LABELS: Record<PaperType, { label: string; color: string }> = {
  original: { label: 'Original Article', color: 'var(--color-primary, #6366F1)' },
  review: { label: 'Review', color: '#10B981' },
  letter: { label: 'Letter / Communication', color: '#F59E0B' },
  conference: { label: 'Conference Paper', color: '#8B5CF6' },
  preprint: { label: 'Preprint', color: '#EC4899' },
  book_chapter: { label: 'Book Chapter', color: '#3B82F6' },
  other: { label: 'Other', color: '#64748B' }
};

export default function Literature() {
  const { t, i18n } = useTranslation();
  const { addToast } = useContext(ToastContext);

  const getPaperTypeLabel = (type: PaperType) => {
    return t(`literature.types.${type}`, { defaultValue: PAPER_TYPE_LABELS[type]?.label || type });
  };

  const [items, setItems] = useState<LiteratureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedPaperType, setSelectedPaperType] = useState('');
  const [selectedReadStatus, setSelectedReadStatus] = useState('all');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const [projects, setProjects] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeamImportModal, setShowTeamImportModal] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<LiteratureItem | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    authors: '',
    lab_name: '',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    year: '' as string | number,
    doi: '',
    paper_type: 'original' as PaperType,
    project_name: '',
    abstract: '',
    notes: '',
    keywords: [] as string[],
    read_abstract: false,
    read_body: false
  });
  const [tagInput, setTagInput] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);

  // Selected PDF file for Add/Edit modal
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);

  // File Upload State in Edit/Detail
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingSupp, setUploadingSupp] = useState(false);

  // Zotero Import State
  const [importContent, setImportContent] = useState('');
  const [importProject, setImportProject] = useState('');
  const [importType, setImportType] = useState<PaperType | ''>('');
  const [importLoading, setImportLoading] = useState(false);

  // Load items
  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedProject) params.append('project_name', selectedProject);
      if (selectedPaperType) params.append('paper_type', selectedPaperType);
      if (selectedReadStatus !== 'all') params.append('read_status', selectedReadStatus);
      if (selectedTag) params.append('tag', selectedTag);
      params.append('sort_by', sortBy);
      params.append('order', sortOrder);

      const [resItems, resProjects, resTags] = await Promise.all([
        api.get(`/literature?${params.toString()}`),
        api.get('/literature/projects'),
        api.get('/literature/tags')
      ]);

      setItems(resItems);
      setProjects(resProjects);
      setAllTags(resTags);
    } catch (err: any) {
      console.error(err);
      addToast('error', t('common.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProject, selectedPaperType, selectedReadStatus, selectedTag, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Quick toggle read status directly from table
  const handleToggleStatus = async (item: LiteratureItem, field: 'read_abstract' | 'read_body') => {
    const updatedVal = !item[field];
    try {
      await api.put(`/literature/${item.id}/status`, {
        [field]: updatedVal
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, [field]: updatedVal } : i));
      if (activeItem && activeItem.id === item.id) {
        setActiveItem({ ...activeItem, [field]: updatedVal });
      }
      addToast('success', t('common.savedSuccessfully'));
    } catch (err) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  // DOI Lookup
  const handleDoiLookup = async (doiValue?: string) => {
    const targetDoi = (doiValue || formData.doi).trim();
    if (!targetDoi) {
      addToast('warning', t('literature.enterDoi'));
      return;
    }
    setDoiLoading(true);
    try {
      const data = await api.get(`/literature/doi-lookup?doi=${encodeURIComponent(targetDoi)}`);
      setFormData(prev => ({
        ...prev,
        title: data.title || prev.title,
        authors: data.authors || prev.authors,
        journal: data.journal || prev.journal,
        volume: data.volume || prev.volume,
        issue: data.issue || prev.issue,
        pages: data.pages || prev.pages,
        year: data.year || prev.year,
        abstract: data.abstract || prev.abstract,
        lab_name: data.lab_name || prev.lab_name,
        paper_type: (data.paper_type as PaperType) || prev.paper_type,
        doi: data.doi || prev.doi
      }));
      addToast('success', t('literature.doiSuccess'));
    } catch (err: any) {
      addToast('error', err.message || t('literature.doiError', { message: '' }));
    } finally {
      setDoiLoading(false);
    }
  };

  // Open Edit modal
  const openEdit = (item: LiteratureItem) => {
    setActiveItem(item);
    setSelectedPdfFile(null);
    setFormData({
      title: item.title,
      authors: item.authors,
      lab_name: item.lab_name,
      journal: item.journal,
      volume: item.volume,
      issue: item.issue,
      pages: item.pages,
      year: item.year || '',
      doi: item.doi,
      paper_type: item.paper_type,
      project_name: item.project_name,
      abstract: item.abstract,
      notes: item.notes,
      keywords: item.keywords || [],
      read_abstract: Boolean(item.read_abstract),
      read_body: Boolean(item.read_body)
    });
    setTagInput('');
    setShowEditModal(true);
  };

  // Open Detail modal
  const openDetail = (item: LiteratureItem) => {
    setActiveItem(item);
    setShowDetailModal(true);
  };

  // Save new / updated
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      addToast('warning', t('literature.enterTitle'));
      return;
    }

    try {
      let targetId: number;
      if (showEditModal && activeItem) {
        const res = await api.put(`/literature/${activeItem.id}`, formData);
        targetId = activeItem.id;
        setItems(prev => prev.map(i => i.id === activeItem.id ? res : i));
        setActiveItem(res);
        addToast('success', t('literature.updatedSuccess'));
        setShowEditModal(false);
      } else {
        const res = await api.post<LiteratureItem>('/literature', formData);
        targetId = res.id;
        setItems(prev => [res, ...prev]);
        addToast('success', t('literature.addedSuccess'));
        setShowAddModal(false);
      }

      // If a PDF file was selected in the form, upload it now
      if (selectedPdfFile && targetId) {
        await handleFileUpload(targetId, selectedPdfFile, 'pdf');
        setSelectedPdfFile(null);
      }

      loadData();
    } catch (err: any) {
      addToast('error', t('literature.saveError'));
    }
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (!window.confirm(t('literature.confirmDeleteLiterature'))) return;
    try {
      await api.delete(`/literature/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      if (showDetailModal) setShowDetailModal(false);
      if (showEditModal) setShowEditModal(false);
      addToast('success', t('common.deletedSuccessfully'));
    } catch (err) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  // File Upload
  const handleFileUpload = async (itemId: number, file: File, type: 'pdf' | 'supplemental') => {
    const uploadForm = new FormData();
    uploadForm.append(type, file);

    if (type === 'pdf') setUploadingPdf(true);
    else setUploadingSupp(true);

    try {
      const token = localStorage.getItem('labflow-auth-token') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/literature/${itemId}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: uploadForm
      });
      if (!res.ok) throw new Error('Upload failed');
      const updated = await res.json();
      setItems(prev => prev.map(i => i.id === itemId ? updated : i));
      if (activeItem && activeItem.id === itemId) setActiveItem(updated);
      addToast('success', t('literature.uploadedFileSuccess', { type: type === 'pdf' ? 'PDF' : t('literature.supplementalData') }));
    } catch (err: any) {
      addToast('error', err.message || t('literature.uploadFileError'));
    } finally {
      if (type === 'pdf') setUploadingPdf(false);
      else setUploadingSupp(false);
    }
  };

  // Delete file
  const handleDeleteFile = async (itemId: number, type: 'pdf' | 'supplemental') => {
    if (!window.confirm(t('literature.confirmDeleteFile', { type: type === 'pdf' ? 'PDF' : t('literature.supplementalData') }))) return;
    try {
      const updated = await api.delete(`/literature/${itemId}/files/${type}`);
      setItems(prev => prev.map(i => i.id === itemId ? updated : i));
      if (activeItem && activeItem.id === itemId) setActiveItem(updated);
      addToast('success', t('literature.deleteFileSuccess'));
    } catch (err) {
      addToast('error', t('literature.deleteFileError'));
    }
  };

  // Zotero Import submit
  const handleZoteroImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importContent.trim()) {
      addToast('warning', t('literature.inputImportContent'));
      return;
    }
    setImportLoading(true);
    try {
      const res = await api.post('/literature/import-zotero', {
        content: importContent,
        project_name: importProject,
        default_paper_type: importType || undefined
      });
      addToast('success', t('literature.importSuccess', { count: res.imported_count }));
      setShowImportModal(false);
      setImportContent('');
      setImportProject('');
      setImportType('');
      loadData();
    } catch (err: any) {
      addToast('error', err.message || t('literature.importError'));
    } finally {
      setImportLoading(false);
    }
  };

  // File drop / select for Zotero
  const handleZoteroFileRead = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImportContent(e.target?.result as string || '');
    };
    reader.readAsText(file);
  };

  // Tag helper
  const addTag = () => {
    const tVal = tagInput.trim();
    if (tVal && !formData.keywords.includes(tVal)) {
      setFormData(prev => ({ ...prev, keywords: [...prev.keywords, tVal] }));
      setTagInput('');
    }
  };
  const removeTag = (tToRemove: string) => {
    setFormData(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== tToRemove) }));
  };

  // KPI Stats
  const stats = useMemo(() => {
    const total = items.length;
    const readAbstract = items.filter(i => i.read_abstract).length;
    const readBody = items.filter(i => i.read_body).length;
    const unread = items.filter(i => !i.read_abstract && !i.read_body).length;
    return { total, readAbstract, readBody, unread };
  }, [items]);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 'var(--space-3xl)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
            <Library size={28} style={{ color: 'var(--color-primary)' }} />
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
              {t('literature.title')}
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {t('literature.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowTeamImportModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
          >
            <Download size={16} />
            <span>{t('common.importFromTeam', 'チームからインポート')}</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowImportModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
          >
            <Upload size={16} />
            <span>{t('literature.importZotero')}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSelectedPdfFile(null);
              setFormData({
                title: '',
                authors: '',
                lab_name: '',
                journal: '',
                volume: '',
                issue: '',
                pages: '',
                year: new Date().getFullYear(),
                doi: '',
                paper_type: 'original',
                project_name: selectedProject || '',
                abstract: '',
                notes: '',
                keywords: [],
                read_abstract: false,
                read_body: false
              });
              setTagInput('');
              setShowAddModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
          >
            <Plus size={16} />
            <span>{t('literature.add')}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>
            {t('literature.totalCount')}
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {stats.total}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <BookOpen size={14} />
            {t('literature.readAbstractCount')}
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
            {stats.readAbstract}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: '#10B981', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={14} />
            {t('literature.readBodyCount')}
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: '#10B981' }}>
            {stats.readBody}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={14} />
            {t('literature.unreadCount')}
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
            {stats.unread}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', alignItems: 'center' }}>
          {/* Search */}
          <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36 }}
              placeholder={t('common.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          {/* Project Filter */}
          <div style={{ minWidth: 160 }}>
            <select
              className="form-select"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">{t('common.allProjects')}</option>
              {projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Paper Type Filter */}
          <div style={{ minWidth: 140 }}>
            <select
              className="form-select"
              value={selectedPaperType}
              onChange={(e) => setSelectedPaperType(e.target.value)}
            >
              <option value="">{t('common.allTypes')}</option>
              {Object.entries(PAPER_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{getPaperTypeLabel(k as PaperType)}</option>
              ))}
            </select>
          </div>

          {/* Read Status Filter */}
          <div style={{ minWidth: 140 }}>
            <select
              className="form-select"
              value={selectedReadStatus}
              onChange={(e) => setSelectedReadStatus(e.target.value)}
            >
              <option value="all">{t('common.allStatus')}</option>
              <option value="unread">{t('literature.unreadCount')}</option>
              <option value="read_abstract">{t('literature.readAbstractCount')}</option>
              <option value="read_body">{t('literature.readBodyCount')}</option>
            </select>
          </div>

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <div style={{ minWidth: 130 }}>
              <select
                className="form-select"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
              >
                <option value="">{t('literature.allTags')}</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reset button if filters active */}
          {(search || selectedProject || selectedPaperType || selectedReadStatus !== 'all' || selectedTag) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('');
                setSelectedProject('');
                setSelectedPaperType('');
                setSelectedReadStatus('all');
                setSelectedTag('');
              }}
            >
              {t('common.reset')}
            </button>
          )}
        </div>
      </div>

      {/* Literature List Table */}
      {loading ? (
        <div className="card" style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>{t('common.loading')}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Library size={48} style={{ margin: '0 auto var(--space-md)', opacity: 0.3 }} />
          <p>{t('literature.noLiterature')}</p>
        </div>
      ) : (
        <div className="table-container card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110, textAlign: 'center' }}>{t('literature.readingStatus')}</th>
                <th style={{ width: 100 }}>{t('literature.paperType')}</th>
                <th>{t('literature.titleAuthorsLab')}</th>
                <th style={{ width: 180 }}>{t('literature.journalYear')}</th>
                <th style={{ width: 140 }}>{t('literature.projectTags')}</th>
                <th style={{ width: 80, textAlign: 'center' }}>{t('literature.attachmentsCol')}</th>
                <th style={{ width: 90, textAlign: 'center' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const typeInfo = PAPER_TYPE_LABELS[item.paper_type] || PAPER_TYPE_LABELS.other;
                return (
                  <tr key={item.id}>
                    {/* Read Status Checkboxes */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', paddingLeft: 6 }}>
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', cursor: 'pointer', color: item.read_abstract ? 'var(--color-primary)' : 'var(--text-secondary)' }}
                          title={t('literature.toggleReadAbstract')}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item.read_abstract)}
                            onChange={() => handleToggleStatus(item, 'read_abstract')}
                          />
                          <span>Abst</span>
                        </label>
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', cursor: 'pointer', color: item.read_body ? '#10B981' : 'var(--text-secondary)' }}
                          title={t('literature.toggleReadBody')}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item.read_body)}
                            onChange={() => handleToggleStatus(item, 'read_body')}
                          />
                          <span>{t('literature.body')}</span>
                        </label>
                      </div>
                    </td>

                    {/* Paper Type */}
                    <td style={{ verticalAlign: 'middle' }}>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: `${typeInfo.color}20`,
                          color: typeInfo.color,
                          border: `1px solid ${typeInfo.color}40`,
                          fontSize: '11px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {getPaperTypeLabel(item.paper_type)}
                      </span>
                    </td>

                    {/* Title, Authors, Lab */}
                    <td>
                      <div
                        style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: 2 }}
                        onClick={() => openDetail(item)}
                        className="hover-underline"
                      >
                        {item.title}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 2 }}>
                        {item.authors || '—'}
                      </div>
                      {item.lab_name && (
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Building size={11} />
                          <span>{item.lab_name}</span>
                        </div>
                      )}
                    </td>

                    {/* Journal, Year, Volume */}
                    <td style={{ fontSize: 'var(--font-size-xs)', verticalAlign: 'middle' }}>
                      <div style={{ fontStyle: 'italic', color: 'var(--text-primary)' }}>
                        {item.journal || '—'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                        {item.year ? (i18n.language === 'en' ? item.year : `${item.year}年`) : ''}
                        {item.volume ? ` Vol.${item.volume}` : ''}
                        {item.issue ? `(${item.issue})` : ''}
                        {item.pages ? ` pp.${item.pages}` : ''}
                      </div>
                      {item.doi && (
                        <a
                          href={`https://doi.org/${item.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '10px', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2 }}
                        >
                          DOI <ExternalLink size={10} />
                        </a>
                      )}
                    </td>

                    {/* Project & Tags */}
                    <td style={{ verticalAlign: 'middle' }}>
                      {item.project_name && (
                        <div style={{ marginBottom: 4 }}>
                          <span className="badge badge-info" style={{ fontSize: '11px' }}>
                            {item.project_name}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {item.keywords?.slice(0, 3).map((kw, kIdx) => (
                          <span
                            key={kIdx}
                            className="tag"
                            style={{ fontSize: '10px', padding: '1px 6px', cursor: 'pointer' }}
                            onClick={() => setSelectedTag(kw)}
                          >
                            #{kw}
                          </span>
                        ))}
                        {item.keywords?.length > 3 && (
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            +{item.keywords.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Attachments (PDF / Supp) */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                        {item.pdf_path ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 4, color: 'var(--color-primary)' }}
                            title={`PDF: ${item.pdf_filename || t('literature.viewPdf')}`}
                            onClick={() => setShowPdfViewer(`/api/literature/files/${item.pdf_path}`)}
                          >
                            <FileText size={16} />
                          </button>
                        ) : null}
                        {item.supplemental_path ? (
                          <a
                            href={`/api/literature/files/${item.supplemental_path}`}
                            download
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 4, color: '#10B981' }}
                            title={`${t('literature.supplementalData')}: ${item.supplemental_filename || t('literature.downloadSupplemental')}`}
                          >
                            <Paperclip size={16} />
                          </a>
                        ) : null}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 4, color: 'var(--color-primary)' }}
                          onClick={() => setShareTarget({ id: item.id, name: item.title })}
                          title={t('common.share', 'チームへ共有')}
                        >
                          <Share2 size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 4 }}
                          onClick={() => openEdit(item)}
                          title={t('common.edit')}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 4, color: 'var(--color-danger)' }}
                          onClick={() => handleDelete(item.id)}
                          title={t('common.delete')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── ADD / EDIT MODAL ─── */}
      {(showAddModal || showEditModal) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setShowEditModal(false); }}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {showEditModal ? t('literature.edit') : t('literature.add')}
              </h2>
              <button className="btn btn-ghost btn-icon" onClick={() => { setShowAddModal(false); setShowEditModal(false); }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                {/* DOI Lookup Helper */}
                <div style={{ background: 'var(--bg-base)', padding: 'var(--space-md)', borderRadius: 'var(--border-radius-md)', border: '1px dashed var(--border-default)', marginBottom: 'var(--space-md)' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
                    <span>{t('literature.doiAutoFill')}</span>
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 4 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('literature.doiLookupPlaceholder')}
                      value={formData.doi}
                      onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDoiLookup()}
                      disabled={doiLoading}
                    >
                      {doiLoading ? t('literature.doiSearching') : t('literature.doiLookupBtn')}
                    </button>
                  </div>
                </div>

                {/* Title */}
                <div className="form-group">
                  <label className="form-label">{t('literature.formTitle')} <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* Authors & Lab */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('literature.authors')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('literature.authorsPlaceholder')}
                      value={formData.authors}
                      onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.labName')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('literature.labNamePlaceholder')}
                      value={formData.lab_name}
                      onChange={(e) => setFormData({ ...formData, lab_name: e.target.value })}
                    />
                  </div>
                </div>

                {/* Journal, Year, Vol, Issue, Pages */}
                <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">{t('literature.journal')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Nature, Science..."
                      value={formData.journal}
                      onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.publishYear')}</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="2026"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.volume')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.volume}
                      onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.issue')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.issue}
                      onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.pages')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="100-112"
                      value={formData.pages}
                      onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
                    />
                  </div>
                </div>

                {/* Paper Type & Project */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('literature.paperType')}</label>
                    <select
                      className="form-select"
                      value={formData.paper_type}
                      onChange={(e) => setFormData({ ...formData, paper_type: e.target.value as PaperType })}
                    >
                      {Object.entries(PAPER_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{getPaperTypeLabel(k as PaperType)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.projectName')}</label>
                    <input
                      type="text"
                      className="form-input"
                      list="project-suggestions"
                      placeholder={t('literature.projectPlaceholder')}
                      value={formData.project_name}
                      onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                    />
                    <datalist id="project-suggestions">
                      {projects.map(p => <option key={p} value={p} />)}
                    </datalist>
                  </div>
                </div>

                {/* Abstract */}
                <div className="form-group">
                  <label className="form-label">Abstract</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={formData.abstract}
                    onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
                  />
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label className="form-label">{t('literature.notesMarkdown')}</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder={t('literature.notesPlaceholder')}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                {/* Keywords / Tags */}
                <div className="form-group">
                  <label className="form-label">{t('literature.keywords')}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                    <input
                      type="text"
                      list="available-tags-list"
                      className="form-input"
                      placeholder={t('literature.keywordsPlaceholder')}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                    />
                    <datalist id="available-tags-list">
                      {allTags.map((t, idx) => (
                        <option key={idx} value={t} />
                      ))}
                    </datalist>
                    {allTags.length > 0 && (
                      <select
                        className="form-select"
                        style={{ maxWidth: '160px' }}
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            const val = e.target.value;
                            if (!formData.keywords.includes(val)) {
                              setFormData(prev => ({ ...prev, keywords: [...prev.keywords, val] }));
                            }
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">{t('literature.selectFromTags')}</option>
                        {allTags.filter(t => !formData.keywords.includes(t)).map((t, idx) => (
                          <option key={idx} value={t}>{t}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={addTag}>
                      {t('common.add')}
                    </button>
                  </div>

                  {/* Registered tags for this item */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', marginBottom: allTags.length > 0 ? 'var(--space-xs)' : 0 }}>
                    {formData.keywords.map((kw, idx) => (
                      <span key={idx} className="tag active" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        #{kw}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeTag(kw)} />
                      </span>
                    ))}
                  </div>

                  {/* Quick-add chips from existing tags */}
                  {allTags.filter(t => !formData.keywords.includes(t)).length > 0 && (
                    <div style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                      <span style={{ marginRight: 6 }}>{t('literature.clickTagToAdd')}</span>
                      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {allTags.filter(t => !formData.keywords.includes(t)).slice(0, 15).map((t, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="tag"
                            style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
                            onClick={() => setFormData(prev => ({ ...prev, keywords: [...prev.keywords, t] }))}
                          >
                            + {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reading Status Checkboxes */}
                <div style={{ display: 'flex', gap: 'var(--space-xl)', padding: 'var(--space-sm) 0' }}>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.read_abstract}
                      onChange={(e) => setFormData({ ...formData, read_abstract: e.target.checked })}
                    />
                    <span>{t('literature.readAbstractCount')}</span>
                  </label>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.read_body}
                      onChange={(e) => setFormData({ ...formData, read_body: e.target.checked })}
                    />
                    <span>{t('literature.readBodyCount')}</span>
                  </label>
                </div>

                {/* PDF File Attachment (New or Replace) */}
                <div className="form-group" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 'var(--space-md)' }}>
                  <label className="form-label font-bold flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={15} style={{ color: 'var(--color-primary)' }} />
                    <span>{t('literature.attachPdf')}</span>
                  </label>
                  
                  {/* If editing and has existing PDF */}
                  {showEditModal && activeItem?.pdf_path && !selectedPdfFile && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg-base)',
                      borderRadius: 'var(--border-radius-md)',
                      marginBottom: 8,
                      border: '1px solid var(--border-default)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <FileText size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {t('literature.currentAttached', { filename: activeItem.pdf_filename || 'paper.pdf' })}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--color-primary)', fontSize: '11px', flexShrink: 0 }}
                        onClick={() => setShowPdfViewer(`/api/literature/files/${activeItem.pdf_path}`)}
                      >
                        <Eye size={13} />
                        <span>{t('literature.check')}</span>
                      </button>
                    </div>
                  )}

                  {/* Selected new PDF file badge */}
                  {selectedPdfFile ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      borderRadius: 'var(--border-radius-md)',
                      border: '1px solid rgba(99, 102, 241, 0.3)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <FileText size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                        <div style={{ fontSize: 'var(--font-size-xs)' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>{t('literature.selectedPdf', { filename: '' })}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{selectedPdfFile.name}</span>
                          <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
                            ({(selectedPdfFile.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: 4, color: 'var(--color-danger)' }}
                        onClick={() => setSelectedPdfFile(null)}
                        title={t('literature.clearSelection')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label
                        className="btn btn-secondary btn-sm"
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Upload size={14} />
                        <span>{showEditModal && activeItem?.pdf_path ? t('literature.changePdf') : t('literature.selectPdf')}</span>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setSelectedPdfFile(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginLeft: 8 }}>
                        {t('literature.pdfSupportNotice')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DETAIL MODAL ─── */}
      {showDetailModal && activeItem && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <span
                  className="badge"
                  style={{
                    backgroundColor: `${(PAPER_TYPE_LABELS[activeItem.paper_type] || PAPER_TYPE_LABELS.other).color}20`,
                    color: (PAPER_TYPE_LABELS[activeItem.paper_type] || PAPER_TYPE_LABELS.other).color
                  }}
                >
                  {getPaperTypeLabel(activeItem.paper_type)}
                </span>
                {activeItem.project_name && (
                  <span className="badge badge-info">{activeItem.project_name}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShareTarget({ id: activeItem.id, name: activeItem.title })}
                >
                  <Share2 size={14} />
                  <span>{t('common.share', 'チームへ共有')}</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowDetailModal(false); openEdit(activeItem); }}>
                  <Edit2 size={14} />
                  <span>{t('common.edit')}</span>
                </button>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowDetailModal(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {/* Title */}
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 'var(--space-xs)' }}>
                {activeItem.title}
              </h2>

              {/* Authors & Lab */}
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-xs)' }}>
                {activeItem.authors || t('literature.noAuthors')}
              </div>
              {activeItem.lab_name && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 'var(--space-sm)' }}>
                  <Building size={13} />
                  <span>{activeItem.lab_name}</span>
                </div>
              )}

              {/* Citation & DOI */}
              <div style={{ background: 'var(--bg-base)', padding: 'var(--space-md)', borderRadius: 'var(--border-radius-md)', marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
                <div>
                  <span style={{ fontStyle: 'italic', fontWeight: 600 }}>{activeItem.journal || t('literature.noJournal')}</span>
                  {activeItem.year && ` (${activeItem.year})`}
                  {activeItem.volume && ` Vol.${activeItem.volume}`}
                  {activeItem.issue && `(${activeItem.issue})`}
                  {activeItem.pages && ` pp.${activeItem.pages}`}
                </div>
                {activeItem.doi && (
                  <div style={{ marginTop: 6 }}>
                    <a
                      href={`https://doi.org/${activeItem.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>https://doi.org/{activeItem.doi}</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </div>

              {/* Read Status Quick Toggle */}
              <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--bg-surface-hover)', borderRadius: 'var(--border-radius-md)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(activeItem.read_abstract)}
                    onChange={() => handleToggleStatus(activeItem, 'read_abstract')}
                  />
                  <span style={{ fontWeight: activeItem.read_abstract ? 'bold' : 'normal', color: activeItem.read_abstract ? 'var(--color-primary)' : 'inherit' }}>
                    {t('literature.abstractRead')}
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(activeItem.read_body)}
                    onChange={() => handleToggleStatus(activeItem, 'read_body')}
                  />
                  <span style={{ fontWeight: activeItem.read_body ? 'bold' : 'normal', color: activeItem.read_body ? '#10B981' : 'inherit' }}>
                    {t('literature.bodyRead')}
                  </span>
                </label>
              </div>

              {/* Tags */}
              {activeItem.keywords && activeItem.keywords.length > 0 && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>{t('literature.keywordsAndTags')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {activeItem.keywords.map((kw, idx) => (
                      <span key={idx} className="tag">#{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Abstract */}
              {activeItem.abstract && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 4 }}>Abstract</h4>
                  <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: 'var(--space-md)', borderRadius: 'var(--border-radius-md)', whiteSpace: 'pre-wrap' }}>
                    {activeItem.abstract}
                  </div>
                </div>
              )}

              {/* Notes */}
              {activeItem.notes && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 4 }}>{t('literature.notesHeading')}</h4>
                  <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.6, color: 'var(--text-primary)', background: 'var(--bg-base)', padding: 'var(--space-md)', borderRadius: 'var(--border-radius-md)', whiteSpace: 'pre-wrap' }}>
                    {activeItem.notes}
                  </div>
                </div>
              )}

              {/* Attachments Section */}
              <div style={{ marginTop: 'var(--space-lg)', borderTop: '1px solid var(--border-default)', paddingTop: 'var(--space-md)' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 'var(--space-sm)' }}>{t('literature.attachmentsHeading')}</h4>

                <div className="grid grid-2" style={{ gap: 'var(--space-md)' }}>
                  {/* Main PDF / Capture */}
                  <div className="card" style={{ padding: 'var(--space-md)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileText size={14} style={{ color: 'var(--color-primary)' }} />
                      <span>{t('literature.bodyPdfOrCapture')}</span>
                    </div>

                    {activeItem.pdf_path ? (
                      <div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 8, wordBreak: 'break-all' }}>
                          {activeItem.pdf_filename || 'paper.pdf'}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setShowPdfViewer(`/api/literature/files/${activeItem.pdf_path}`)}
                          >
                            <Eye size={13} />
                            <span>{t('literature.preview')}</span>
                          </button>
                          <a
                            href={`/api/literature/files/${activeItem.pdf_path}`}
                            download={activeItem.pdf_filename || 'paper.pdf'}
                            className="btn btn-secondary btn-sm"
                          >
                            <Download size={13} />
                            <span>{t('literature.downloadSupplemental')}</span>
                          </a>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteFile(activeItem.id, 'pdf')}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                          {t('literature.noPdfAttached')}
                        </p>
                        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                          <Upload size={13} />
                          <span>{uploadingPdf ? t('literature.uploading') : t('literature.selectFile')}</span>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              if (e.target.files?.[0]) handleFileUpload(activeItem.id, e.target.files[0], 'pdf');
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Supplemental Data */}
                  <div className="card" style={{ padding: 'var(--space-md)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Paperclip size={14} style={{ color: '#10B981' }} />
                      <span>{t('literature.supplementalData')}</span>
                    </div>

                    {activeItem.supplemental_path ? (
                      <div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 8, wordBreak: 'break-all' }}>
                          {activeItem.supplemental_filename || 'supplemental_data'}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                          <a
                            href={`/api/literature/files/${activeItem.supplemental_path}`}
                            download={activeItem.supplemental_filename || 'supplemental_data'}
                            className="btn btn-secondary btn-sm"
                          >
                            <Download size={13} />
                            <span>{t('literature.downloadSupplemental')}</span>
                          </a>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteFile(activeItem.id, 'supplemental')}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                          {t('literature.noSupplementalAttached')}
                        </p>
                        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                          <Upload size={13} />
                          <span>{uploadingSupp ? t('literature.uploading') : t('literature.selectFile')}</span>
                          <input
                            type="file"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              if (e.target.files?.[0]) handleFileUpload(activeItem.id, e.target.files[0], 'supplemental');
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ZOTERO IMPORT MODAL ─── */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Upload size={20} style={{ color: 'var(--color-primary)' }} />
                <h2 className="modal-title">{t('literature.importZotero')}</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowImportModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleZoteroImport}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  {t('literature.importModalDesc')}
                </p>

                {/* File Drop Area */}
                <div
                  style={{
                    border: '2px dashed var(--border-default)',
                    borderRadius: 'var(--border-radius-lg)',
                    padding: 'var(--space-lg)',
                    textAlign: 'center',
                    background: 'var(--bg-base)',
                    cursor: 'pointer'
                  }}
                  onClick={() => document.getElementById('zotero-file-input')?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) handleZoteroFileRead(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload size={28} style={{ color: 'var(--color-primary)', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold' }}>
                    {t('literature.dragDropOrClick')}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {t('literature.supportedImportFormats')}
                  </div>
                  <input
                    id="zotero-file-input"
                    type="file"
                    accept=".bib,.ris,.json,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleZoteroFileRead(e.target.files[0]);
                    }}
                  />
                </div>

                {/* Paste Area */}
                <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                  <label className="form-label">{t('literature.orPasteText')}</label>
                  <textarea
                    className="form-textarea"
                    rows={6}
                    placeholder={t('literature.pastePlaceholder')}
                    value={importContent}
                    onChange={(e) => setImportContent(e.target.value)}
                  />
                </div>

                {/* Batch Options */}
                <div className="form-row" style={{ marginTop: 'var(--space-sm)' }}>
                  <div className="form-group">
                    <label className="form-label">{t('literature.batchProject')}</label>
                    <input
                      type="text"
                      className="form-input"
                      list="import-project-suggestions"
                      placeholder={t('literature.projectPlaceholder')}
                      value={importProject}
                      onChange={(e) => setImportProject(e.target.value)}
                    />
                    <datalist id="import-project-suggestions">
                      {projects.map(p => <option key={p} value={p} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('literature.overridePaperType')}</label>
                    <select
                      className="form-select"
                      value={importType}
                      onChange={(e) => setImportType(e.target.value as PaperType)}
                    >
                      <option value="">{t('literature.autoDetect')}</option>
                      {Object.entries(PAPER_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{getPaperTypeLabel(k as PaperType)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={importLoading || !importContent.trim()}>
                  {importLoading ? t('literature.importing') : t('literature.executeImport')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── PDF / ATTACHMENT VIEWER MODAL ─── */}
      {showPdfViewer && (
        <div className="modal-overlay" onClick={() => setShowPdfViewer(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '92vw', maxWidth: '1200px', height: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <FileText size={18} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'bold' }}>{t('literature.documentViewer')}</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <a href={showPdfViewer} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  <ExternalLink size={13} />
                  <span>{t('literature.openInNewTab')}</span>
                </a>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowPdfViewer(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, background: '#1e293b' }}>
              <iframe
                src={showPdfViewer}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="PDF Document"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── TEAM SHARE MODAL ─── */}
      {shareTarget && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareTarget(null)}
          itemType="literature"
          localItemId={shareTarget.id}
          itemName={shareTarget.name}
          onSuccess={() => {
            setShareTarget(null);
            loadData();
          }}
        />
      )}

      {/* ─── TEAM IMPORT MODAL ─── */}
      {showTeamImportModal && (
        <ImportModal
          isOpen={true}
          onClose={() => setShowTeamImportModal(false)}
          itemType="literature"
          onSuccess={() => {
            setShowTeamImportModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
