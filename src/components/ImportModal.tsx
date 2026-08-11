import React, { useState, useEffect, useContext } from 'react';
import { Download, Users, Loader2, CheckCircle2, AlertCircle, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabaseGet, supabasePost } from '../api/supabaseClient';
import { ToastContext } from '../App';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'experiment-types' | 'protocols' | 'milestones';
  onSuccess: () => void;
}

interface Team {
  id: string;
  name: string;
}

interface SharedItem {
  id: string;
  name: string;
  description?: string;
  shared_by_name?: string;
  created_at: string;
}

export function ImportModal({
  isOpen,
  onClose,
  itemType,
  onSuccess,
}: ImportModalProps) {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  const [importingItemId, setImportingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTeams();
    } else {
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setSelectedTeam(null);
    setItems([]);
    setError(null);
  };

  const fetchTeams = async () => {
    setLoadingTeams(true);
    setError(null);
    try {
      const response = await supabaseGet<Team[]>('/teams');
      if (response && Array.isArray(response)) {
        setTeams(response);
      }
    } catch (err: any) {
      console.error('Failed to fetch teams:', err);
      setError(err.message || t('errors.failedToFetchTeams', 'Failed to fetch teams'));
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchItems = async (teamId: string) => {
    setLoadingItems(true);
    setError(null);
    try {
      const response = await supabaseGet<SharedItem[]>(`/shared/${itemType}?team_id=${teamId}`);
      if (response && Array.isArray(response)) {
        setItems(response);
      } else if (response && response.items) {
        setItems(response.items);
      } else {
        setItems([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch shared items:', err);
      setError(err.message || t('errors.failedToFetchItems', 'Failed to fetch shared items'));
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    fetchItems(team.id);
  };

  const handleImport = async (itemId: string) => {
    setImportingItemId(itemId);
    setError(null);
    try {
      await supabasePost(`/shared/${itemType}/${itemId}/import`, {});
      addToast('success', t('success.itemImported', 'Item imported successfully'));
      onSuccess();
    } catch (err: any) {
      console.error('Failed to import item:', err);
      setError(err.message || t('errors.failedToImportItem', 'Failed to import item'));
    } finally {
      setImportingItemId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '600px', maxWidth: '90vw' }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedTeam && (
            <button 
              className="btn btn-ghost" 
              onClick={() => setSelectedTeam(null)} 
              title={t('common.back', 'Back')}
              style={{ padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            <Download size={20} className="icon-mr" style={{ marginRight: '8px' }} />
            {selectedTeam ? `${t('importModal.title', 'Import')} - ${selectedTeam.name}` : t('importModal.selectTeamTitle', 'Select Team to Import From')}
          </h3>
        </div>
        
        <div className="modal-body" style={{ minHeight: '300px' }}>
          {error && (
            <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)', padding: '12px', backgroundColor: 'var(--error-light)', borderRadius: '6px', marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          {!selectedTeam ? (
            <div className="team-selection">
              {loadingTeams ? (
                <div className="loading-container text-center py-8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px 0' }}>
                  <Loader2 size={32} className="animate-spin text-primary" style={{ marginBottom: '16px', color: 'var(--primary)' }} />
                  <p className="text-secondary" style={{ color: 'var(--text-secondary)' }}>{t('loadingTeams', 'Loading teams...')}</p>
                </div>
              ) : teams.length === 0 ? (
                <div className="empty-state text-center py-8" style={{ textAlign: 'center', padding: '32px 0' }}>
                  <Users size={48} className="mx-auto mb-4 text-secondary opacity-50" style={{ margin: '0 auto 16px', color: 'var(--text-secondary)', opacity: 0.5 }} />
                  <p style={{ color: 'var(--text-secondary)' }}>{t('importModal.noTeams', 'You are not a member of any teams yet.')}</p>
                </div>
              ) : (
                <div className="team-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p className="mb-4 text-secondary" style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    {t('importModal.description', 'Select a team to browse shared items.')}
                  </p>
                  {teams.map(team => (
                    <button
                      key={team.id}
                      className="card w-full text-left p-4 border hover:border-primary transition-colors border-default"
                      onClick={() => handleSelectTeam(team)}
                      style={{ 
                        padding: '16px', 
                        borderRadius: '8px', 
                        border: '1px solid var(--border-default)', 
                        backgroundColor: 'var(--bg-secondary)', 
                        cursor: 'pointer', 
                        textAlign: 'left', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px',
                        width: '100%'
                      }}
                    >
                      <Users size={20} className="text-primary" style={{ color: 'var(--primary)' }} />
                      <span className="font-medium" style={{ fontWeight: 500, fontSize: '1.1em' }}>{team.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="item-selection">
              {loadingItems ? (
                <div className="loading-container text-center py-8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', padding: '32px 0' }}>
                  <Loader2 size={32} className="animate-spin text-primary" style={{ marginBottom: '16px', color: 'var(--primary)' }} />
                  <p className="text-secondary" style={{ color: 'var(--text-secondary)' }}>{t('loadingItems', 'Loading items...')}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="empty-state text-center py-8" style={{ textAlign: 'center', padding: '32px 0' }}>
                  <AlertCircle size={48} className="mx-auto mb-4 text-secondary opacity-50" style={{ margin: '0 auto 16px', color: 'var(--text-secondary)', opacity: 0.5 }} />
                  <p style={{ color: 'var(--text-secondary)' }}>{t('importModal.noItemsShared', 'No items have been shared with this team yet.')}</p>
                </div>
              ) : (
                <div className="item-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                  {items.map(item => (
                    <div key={item.id} className="card p-4 border border-default" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="item-info" style={{ flex: 1, marginRight: '16px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1em' }}>{item.name}</h4>
                        {item.description && <p className="text-secondary text-sm" style={{ margin: '0 0 8px 0', fontSize: '0.9em', color: 'var(--text-secondary)' }}>{item.description}</p>}
                        <div className="item-meta" style={{ display: 'flex', gap: '12px', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
                          {item.shared_by_name && (
                            <span className="badge" style={{ padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                              Shared by: {item.shared_by_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleImport(item.id)}
                        disabled={importingItemId !== null}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          padding: '8px 16px', 
                          borderRadius: '6px', 
                          cursor: importingItemId !== null ? 'not-allowed' : 'pointer', 
                          whiteSpace: 'nowrap',
                          border: '1px solid var(--border-default)',
                          background: 'var(--bg-primary)'
                        }}
                      >
                        {importingItemId === item.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Download size={16} />
                        )}
                        {t('common.import', 'Import')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: 'transparent' }}>
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
