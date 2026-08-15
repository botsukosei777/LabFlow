import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Plus, Trash2, Edit, AlertTriangle, Search, Filter, Cloud, Share2, Download, RefreshCw, Unlink } from 'lucide-react';
import { api } from '../api/client';
import { supabaseGet, supabasePost, supabaseDelete } from '../api/supabaseClient';
import { ToastContext } from '../App';
import type { Reagent } from '../types';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';

export default function Inventory() {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [editing, setEditing] = useState<Reagent | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', category: '', quantity_trackable: false,
    current_quantity: 0, min_quantity: 0, unit: '', supplier: '', catalog_number: '', location: ''
  });

  const fetchReagents = async () => {
    try {
      const data = await api.get<Reagent[]>('/reagents');
      setReagents(data);
    } catch (e) { addToast('error', t('common.errorOccurred')); }
    finally { setLoading(false); }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      const data = await supabasePost<any>('/shared/reagents/sync-all');
      if (data && data.updatedCount > 0) {
         fetchReagents();
      }
    } catch (e) {
      console.error('Auto-sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { 
    fetchReagents(); 
    handleSyncAll();

    const interval = setInterval(() => {
      handleSyncAll();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleShareReagent = async (teamId: string, reagentId: number) => {
    try {
      await supabasePost(`/shared/reagents/${reagentId}/share`, { team_id: teamId });
      addToast('success', t('common.sharedSuccessfully', { defaultValue: 'チームに共有しました' }));
      setShareTarget(null);
      fetchReagents();
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const unshareReagent = async (id: number) => {
    if (!window.confirm(t('common.confirmUnshare', { defaultValue: 'チーム共有を解除しますか？ (自分が共有したアイテムはチームからも削除されます)' }))) return;
    try {
      await supabaseDelete(`/shared/reagents/local/${id}`);
      addToast('success', t('common.unshareSuccess', { defaultValue: '共有を解除しました' }));
      fetchReagents();
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const categories = [...new Set(reagents.map(r => r.category).filter(Boolean))];

  const filtered = reagents.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || (r.catalog_number && r.catalog_number.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = categoryFilter === 'all' || r.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        await api.put(`/reagents/${editing.id}`, form);
      } else {
        await api.post('/reagents', form);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowModal(false); setEditing(null);
      setForm({ name: '', description: '', category: '', quantity_trackable: false, current_quantity: 0, min_quantity: 0, unit: '', supplier: '', catalog_number: '', location: '' });
      fetchReagents();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const toggleDeplete = async (id: number) => {
    try {
      await api.post(`/reagents/${id}/deplete`);
      fetchReagents();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const deleteReagent = async (id: number) => {
    try {
      await api.delete(`/reagents/${id}`);
      addToast('success', t('common.deletedSuccessfully'));
      fetchReagents();
    } catch (e) { addToast('error', t('common.errorOccurred')); }
  };

  const getStockStatus = (r: Reagent) => {
    if (r.is_depleted) return { label: t('inventory.depleted'), class: 'badge-danger' };
    if (r.quantity_trackable && r.current_quantity <= r.min_quantity) return { label: t('inventory.lowStock'), class: 'badge-warning' };
    return { label: t('inventory.inStock'), class: 'badge-success' };
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('inventory.title')}</h1>
          <p className="page-description">{t('inventory.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Download size={16} />
            {t('common.importFromTeam', 'チームからインポート')}
          </button>
          <button className="btn btn-secondary" onClick={handleSyncAll} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {t('common.syncToTeam', 'チームへ同期')}
          </button>
          <button className="btn btn-primary" onClick={() => {
            setEditing(null); setForm({ name: '', description: '', category: '', quantity_trackable: false, current_quantity: 0, min_quantity: 0, unit: '', supplier: '', catalog_number: '', location: '' });
            setShowModal(true);
          }}><Plus size={16} /> {t('inventory.addReagent')}</button>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="form-input" style={{ paddingLeft: 36 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} />
        </div>
        <select className="form-select" style={{ width: 'auto', minWidth: 150 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">{t('common.all')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 && !loading ? (
        <div className="empty-state">
          <Package size={64} />
          <h3 className="empty-state-title">{t('inventory.noReagents')}</h3>
          <p className="empty-state-description">{t('inventory.noReagentsDesc')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('inventory.category')}</th>
                <th>{t('common.status')}</th>
                <th>{t('inventory.currentQuantity')}</th>
                <th>{t('inventory.location', '場所')}</th>
                <th>{t('inventory.supplier')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const status = getStockStatus(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 'var(--font-weight-medium)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.shared_id && <Cloud size={14} className="text-indigo-500" title="Shared with team" />}
                        {r.name}
                      </div>
                      {r.catalog_number && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{r.catalog_number}</div>}
                    </td>
                    <td>{r.category || '-'}</td>
                    <td><span className={`badge ${status.class}`}>{status.label}</span></td>
                    <td>{r.quantity_trackable ? `${r.current_quantity} ${r.unit}` : '-'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.location || '-'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.supplier || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                        {!r.shared_id ? (
                          <button 
                            className="btn btn-ghost btn-icon btn-sm" 
                            onClick={() => setShareTarget({ id: r.id, name: r.name })}
                            title={t('common.share', 'チームへ共有')}
                          >
                            <Share2 size={14} />
                          </button>
                        ) : (
                          <button 
                            className="btn btn-ghost btn-icon btn-sm" 
                            onClick={() => unshareReagent(r.id)}
                            title={t('common.unshare', { defaultValue: 'チーム共有解除' })}
                            style={{ color: 'var(--color-warning)' }}
                          >
                            <Unlink size={14} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                          setEditing(r); setForm({ name: r.name, description: r.description, category: r.category, quantity_trackable: !!r.quantity_trackable, current_quantity: r.current_quantity, min_quantity: r.min_quantity, unit: r.unit, supplier: r.supplier, catalog_number: r.catalog_number, location: (r as any).location || '' });
                          setShowModal(true);
                        }}><Edit size={14} /></button>
                        <button className={`btn btn-ghost btn-icon btn-sm`} onClick={() => toggleDeplete(r.id)}
                          style={{ color: r.is_depleted ? 'var(--color-secondary)' : 'var(--color-warning)' }}
                          title={r.is_depleted ? t('inventory.markAvailable') : t('inventory.markDepleted')}>
                          <AlertTriangle size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteReagent(r.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? t('inventory.editReagent') : t('inventory.addReagent')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('inventory.reagentName')} *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('inventory.reagentNamePlaceholder')} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('inventory.category')}</label>
                  <input className="form-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder={t('inventory.categoryPlaceholder')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('inventory.supplier')}</label>
                  <input className="form-input" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder={t('inventory.supplierPlaceholder')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('inventory.catalogNumber')}</label>
                  <input className="form-input" value={form.catalog_number} onChange={e => setForm({ ...form, catalog_number: e.target.value })} placeholder={t('inventory.catalogNumberPlaceholder')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('inventory.location', '在庫の場所')}</label>
                <input className="form-input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('inventory.locationPlaceholder', '例: 試薬棚A')} />
              </div>
              <label className="form-checkbox" style={{ marginBottom: 'var(--space-md)' }}>
                <input type="checkbox" checked={form.quantity_trackable} onChange={e => setForm({ ...form, quantity_trackable: e.target.checked })} />
                <span>{t('inventory.quantityTrackable')}</span>
              </label>
              {form.quantity_trackable && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('inventory.currentQuantity')}</label>
                    <input className="form-input" type="number" min="0" value={form.current_quantity} onChange={e => setForm({ ...form, current_quantity: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('inventory.minQuantity')}</label>
                    <input className="form-input" type="number" min="0" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('inventory.unit')}</label>
                    <input className="form-input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder={t('inventory.unitPlaceholder')} />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim()}>{editing ? t('common.save') : t('common.create')}</button>
            </div>
          </div>
        </div>
      )}

      {shareTarget && (
        <ShareModal
          isOpen={true}
          itemName={shareTarget.name}
          onClose={() => setShareTarget(null)}
          onShare={(teamId) => handleShareReagent(teamId, shareTarget.id)}
        />
      )}

      {showImport && (
        <ImportModal
          isOpen={true}
          itemType="reagents"
          onClose={() => setShowImport(false)}
          onSuccess={fetchReagents}
        />
      )}
    </div>
  );
}
