import { useState, useEffect, useContext } from 'react';
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

export default function SubProtocols() {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
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
      addToast('success', t('common.syncSuccess', { defaultValue: 'チームへ更新内容を送信しました' }));
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const unshareSharedSubProtocol = async (id: number) => {
    if (!window.confirm(t('common.confirmUnshare', { defaultValue: 'すべてのチームから共有を解除しますか？' }))) return;
    try {
      await supabaseDelete(`/shared/sub-protocols/local/${id}`);
      addToast('success', t('common.unshareSuccess', { defaultValue: '共有を解除しました' }));
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
    if (!confirm(t('common.confirmDelete', { defaultValue: '本当に削除しますか？' }))) return;
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
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>サブプロトコル</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>再利用可能な手順や試薬表を管理します。ここで登録したサブプロトコルは、各実験種のステップに割り当てることができます。</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Download size={20} /> チームからインポート
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={20} /> 新規作成
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
                  title={t('common.syncToTeam', { defaultValue: 'チームへ更新内容を送信' })}
                  style={{ color: 'var(--color-primary)' }}
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => unshareSharedSubProtocol(sp.id)}
                  title={t('common.unshare', { defaultValue: 'チーム共有解除' })}
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sp.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {subProtocols.length === 0 && (
          <div className="empty-state">
            <p>サブプロトコルがありません。「新規作成」から追加してください。</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSubProtocol ? 'サブプロトコルを編集' : 'サブプロトコルを作成'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">名前 *</label>
                <input className="form-input" value={subProtocolForm.name} onChange={e => setSubProtocolForm({ ...subProtocolForm, name: e.target.value })} placeholder="サブプロトコル名 (例: PCR反応液の調製)" autoFocus />
              </div>
              <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label">内容 (Markdown)</label>
                <div style={{ flex: 1, border: '1px solid var(--border-default)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
                  <MDEditor
                    value={subProtocolForm.content}
                    onChange={val => setSubProtocolForm({ ...subProtocolForm, content: val || '' })}
                    preview="edit"
                    height="100%"
                    visibleDragbar={false}
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
    </div>
  );
}
