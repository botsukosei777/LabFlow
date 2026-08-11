import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Plus, Trash2, ChevronRight, Beaker, Share2, Download } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';
import type { ExperimentType } from '../types';
import SubProtocols from './SubProtocols';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';

const COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
  '#10B981', '#06B6D4', '#3B82F6', '#F97316', '#84CC16',
];

export default function ExperimentTypes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addToast } = useContext(ToastContext);
  const [experiments, setExperiments] = useState<ExperimentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExperiment, setEditingExperiment] = useState<ExperimentType | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#6366F1' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fetchExperiments = async () => {
    try {
      const data = await api.get<ExperimentType[]>('/experiments');
      setExperiments(data);
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExperiments(); }, []);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      if (editingExperiment) {
        await api.put(`/experiments/${editingExperiment.id}`, form);
      } else {
        await api.post('/experiments', form);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowModal(false);
      setEditingExperiment(null);
      setForm({ name: '', description: '', color: '#6366F1' });
      fetchExperiments();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/experiments/${id}`);
      addToast('success', t('common.deletedSuccessfully'));
      setDeleteConfirm(null);
      fetchExperiments();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const openEdit = (exp: ExperimentType) => {
    setEditingExperiment(exp);
    setForm({ name: exp.name, description: exp.description, color: exp.color });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingExperiment(null);
    setForm({ name: '', description: '', color: '#6366F1' });
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 300, height: 20 }} />
          </div>
        </div>
        <div className="grid grid-auto">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: 'var(--border-radius-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('experiments.title')}</h1>
          <p className="page-description">{t('experiments.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Download size={16} />
            {t('common.importFromTeam', 'Import from Team')}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            {t('experiments.addExperiment')}
          </button>
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="empty-state">
          <Beaker size={64} />
          <h3 className="empty-state-title">{t('experiments.noExperiments')}</h3>
          <p className="empty-state-description">{t('experiments.noExperimentsDesc')}</p>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            {t('experiments.addExperiment')}
          </button>
        </div>
      ) : (
        <div className="grid grid-auto">
          {experiments.map((exp, index) => (
            <div
              key={exp.id}
              className="card animate-slide-up"
              style={{ cursor: 'pointer', animationDelay: `${index * 50}ms`, position: 'relative' }}
              onClick={() => navigate(`/experiments/${exp.id}`)}
            >
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div className="color-dot" style={{ backgroundColor: exp.color, width: 16, height: 16 }} />
                  <h3 className="card-title">{exp.name}</h3>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={(e) => { e.stopPropagation(); setShareTarget({ id: exp.id, name: exp.name }); }}
                    title={t('common.share', 'Share')}
                    style={{ color: 'var(--color-info)' }}
                  >
                    <Share2 size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={(e) => { e.stopPropagation(); openEdit(exp); }}
                    title={t('common.edit')}
                  >
                    <FlaskConical size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(exp.id); }}
                    title={t('common.delete')}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {exp.description && (
                <p className="card-body" style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
                  {exp.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                <span className="badge badge-primary">
                  {t('experiments.stepsCount', { count: exp.steps_count || 0 })}
                </span>
                <span className="badge badge-info">
                  {t('experiments.blocksCount', { count: exp.blocks_count || 0 })}
                </span>
                <span className="badge badge-success">
                  {t('experiments.protocolsCount', { count: exp.protocols_count || 0 })}
                </span>
              </div>
              <div style={{ position: 'absolute', right: 16, bottom: 16, color: 'var(--text-tertiary)' }}>
                <ChevronRight size={20} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingExperiment ? t('experiments.editExperiment') : t('experiments.addExperiment')}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('experiments.experimentName')} *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={t('experiments.experimentNamePlaceholder')}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={t('common.description')}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('experiments.experimentColor')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      style={{
                        width: 32, height: 32, borderRadius: 'var(--border-radius-md)',
                        backgroundColor: color, border: form.color === color ? '3px solid white' : '3px solid transparent',
                        cursor: 'pointer', transition: 'transform var(--transition-fast)',
                        transform: form.color === color ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim()}>
                {editingExperiment ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm !== null && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
              <Trash2 size={48} style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-md)' }} />
              <p>{t('common.confirmDelete')}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      <hr style={{ margin: 'var(--space-2xl) 0', border: 'none', borderTop: '1px solid var(--border-default)' }} />
      <SubProtocols />

      {/* Share Modal */}
      {shareTarget && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareTarget(null)}
          itemType="experiment-types"
          localItemId={shareTarget.id}
          itemName={shareTarget.name}
          onSuccess={() => setShareTarget(null)}
        />
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        itemType="experiment-types"
        onSuccess={() => { setShowImport(false); fetchExperiments(); }}
      />
    </div>
  );
}
