import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, FileText, Share2, RefreshCw, Unlink, Download } from 'lucide-react';
import { api } from '../api/client';
import { supabasePost, supabaseDelete } from '../api/supabaseClient';
import { ToastContext } from '../App';
import type { SubProtocol } from '../types';
import MDEditor from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';
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
  ImageCropModal
} from '../utils/markdownConfig';

export default function SubProtocols() {
  const { t } = useTranslation();
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
      addToast('error', err.message || '画像のアップロードに失敗しました');
    }
  };

  const customCommands = useMemo(() => {
    return getCustomMdCommands(
      t('notebook.mathInline', '数式 (インライン): $...$'),
      t('notebook.mathBlock', '数式ブロック: $$...$$'),
      t('notebook.insertImage', '画像を挿入 (PC内の画像ファイルを選択)'),
      (file, api) => handleOpenCrop(file, api),
      t('notebook.superscript', '上付き文字: <sup>...</sup>'),
      t('notebook.subscript', '下付き文字: <sub>...</sub>')
    );
  }, [t, handleOpenCrop]);
  const [subProtocols, setSubProtocols] = useState<SubProtocol[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingSubProtocol, setEditingSubProtocol] = useState<SubProtocol | null>(null);
  const [subProtocolForm, setSubProtocolForm] = useState({ name: '', content: '' });
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const syncSharedSubProtocol = async (id: number) => {
    try {
      await supabasePost(`/shared/sub-protocols/${id}/sync`, {});
      addToast('success', t('common.syncSuccess'));
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const unshareSharedSubProtocol = async (id: number) => {
    if (!window.confirm(t('common.confirmUnshare'))) return;
    try {
      await supabaseDelete(`/shared/sub-protocols/local/${id}`);
      addToast('success', t('common.unshareSuccess'));
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  useEffect(() => {
    fetchSubProtocols();
  }, []);

  const fetchSubProtocols = async () => {
    try {
      const data = await api.get<SubProtocol[]>('/sub_protocols');
      setSubProtocols(data || []);
    } catch (error) {
      console.error('Failed to fetch sub-protocols:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubProtocolSubmit = async () => {
    if (!subProtocolForm.name.trim()) return;
    try {
      if (editingSubProtocol) {
        await api.put(`/sub_protocols/${editingSubProtocol.id}`, subProtocolForm);
      } else {
        await api.post(`/sub_protocols`, subProtocolForm);
      }
      setShowModal(false);
      fetchSubProtocols();
    } catch (error) {
      console.error('Failed to save sub-protocol:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/sub_protocols/${id}`);
      fetchSubProtocols();
    } catch (error) {
      console.error('Failed to delete sub-protocol:', error);
    }
  };

  const openAddModal = () => {
    setEditingSubProtocol(null);
    setSubProtocolForm({ name: '', content: '' });
    setShowModal(true);
  };

  const openEditModal = (sp: SubProtocol) => {
    setEditingSubProtocol(sp);
    setSubProtocolForm({ name: sp.name, content: sp.content });
    setShowModal(true);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ marginTop: 'var(--space-2xl)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>{t('subProtocols.title')}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{t('subProtocols.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Download size={20} /> {t('common.importFromTeam')}
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={20} /> {t('subProtocols.createNew')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {subProtocols.map(sp => (
          <div key={sp.id} className="card" style={{ padding: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>{sp.name}</h3>
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => syncSharedSubProtocol(sp.id)}
                  title={t('common.syncToTeam')}
                  style={{ color: 'var(--color-primary)' }}
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => unshareSharedSubProtocol(sp.id)}
                  title={t('common.unshare')}
                  style={{ color: 'var(--color-warning)' }}
                >
                  <Unlink size={16} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setShareTarget({ id: sp.id, name: sp.name })}
                  title={t('common.share', 'Share')}
                  style={{ color: 'var(--color-info)' }}
                >
                  <Share2 size={16} />
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditModal(sp)}><Edit2 size={16} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(sp.id)}><Trash2 size={16} /></button>
              </div>
            </div>
            {sp.content && (
              <div className="markdown-preview" data-color-mode="light" style={{ padding: 'var(--space-md)', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-md)' }}>
                <ReactMarkdown remarkPlugins={mdRemarkPlugins} rehypePlugins={mdRehypePlugins}>{sp.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {subProtocols.length === 0 && (
          <div className="empty-state">
            <p>{t('subProtocols.noSubProtocols')}</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSubProtocol ? t('subProtocols.editTitle') : t('subProtocols.createTitle')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">{t('subProtocols.name')} *</label>
                <input className="form-input" value={subProtocolForm.name} onChange={e => setSubProtocolForm({ ...subProtocolForm, name: e.target.value })} placeholder={t('subProtocols.namePlaceholder')} autoFocus />
              </div>
              <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label">{t('subProtocols.content')}</label>
                <div 
                  style={{ flex: 1, border: '1px solid var(--border-default)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}
                  onDrop={(e) => handleMarkdownDropWithCrop(e, handleOpenCrop)}
                  onDragOver={handleMarkdownDragOver}
                >
                  <MDEditor
                    value={subProtocolForm.content}
                    onChange={val => setSubProtocolForm({ ...subProtocolForm, content: val || '' })}
                    preview="edit"
                    highlightEnable={false}
                    height="100%"
                    visibleDragbar={false}
                    commands={customCommands}
                    previewOptions={mdPreviewOptions}
                    textareaProps={{
                      onPaste: (e) => handleMarkdownPasteWithCrop(e, handleOpenCrop),
                      onDrop: (e) => handleMarkdownDropWithCrop(e, handleOpenCrop),
                      onDragOver: handleMarkdownDragOver,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSubProtocolSubmit} disabled={!subProtocolForm.name.trim()}>
                {editingSubProtocol ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareTarget && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareTarget(null)}
          itemType="sub-protocols"
          localItemId={shareTarget.id}
          itemName={shareTarget.name}
          onSuccess={() => {
            setShareTarget(null);
            fetchSubProtocols();
          }}
        />
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        itemType="sub-protocols"
        onSuccess={() => { setShowImport(false); fetchSubProtocols(); }}
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
    </div>
  );
}
