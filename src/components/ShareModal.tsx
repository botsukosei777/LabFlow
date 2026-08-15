import React, { useState, useEffect, useContext } from 'react';
import { Share2, Users, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabaseGet, supabasePost } from '../api/supabaseClient';
import { ToastContext } from '../App';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType?: 'experiment-types' | 'protocols' | 'milestones' | 'sub-protocols' | 'reagents';
  localItemId?: number;
  itemName: string;
  onSuccess?: () => void;
  onShare?: (teamId: string) => Promise<void>;
}

interface Team {
  id: string;
  name: string;
}

export function ShareModal({
  isOpen,
  onClose,
  itemType,
  localItemId,
  itemName,
  onSuccess,
  onShare,
}: ShareModalProps) {
  const { t } = useTranslation();
  const { addToast } = useContext(ToastContext);
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTeams();
      setSelectedTeamId('');
      setError(null);
    }
  }, [isOpen]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    setError(null);
    try {
      const response = await supabaseGet<Team[]>('/teams');
      if (response && Array.isArray(response)) {
        setTeams(response);
        if (response.length > 0) {
          setSelectedTeamId(response[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch teams:', err);
      setError(err.message || t('errors.failedToFetchTeams', 'Failed to fetch teams'));
    } finally {
      setLoadingTeams(false);
    }
  };

  const handleShare = async () => {
    if (!selectedTeamId) {
      setError(t('errors.selectTeamFirst', 'Please select a team first'));
      return;
    }

    setIsSharing(true);
    setError(null);

    try {
      if (onShare) {
        await onShare(selectedTeamId);
      } else if (itemType && localItemId) {
        const payload: any = { team_id: selectedTeamId };
        if (itemType === 'experiment-types') {
          payload.local_experiment_type_id = localItemId;
        } else if (itemType === 'protocols') {
          payload.local_protocol_id = localItemId;
        } else if (itemType === 'milestones') {
          payload.local_milestone_id = localItemId;
        } else if (itemType === 'sub-protocols') {
          payload.local_sub_protocol_id = localItemId;
        }
        
        await supabasePost(`/shared/${itemType}`, payload);
        addToast('success', t('success.itemShared', 'Item shared successfully'));
      }
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to share item:', err);
      setError(err.message || t('errors.failedToShareItem', 'Failed to share item'));
    } finally {
      setIsSharing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Share2 size={20} className="icon-mr" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            {t('shareModal.title', 'Share')} - {itemName}
          </h3>
        </div>
        <div className="modal-body">
          {error && (
            <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)', padding: '12px', backgroundColor: 'var(--error-light)', borderRadius: '6px', marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          <p className="mb-4 text-secondary" style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            {t('shareModal.description', 'Select a team to share this item with. Team members will be able to import it to their local workspace.')}
          </p>
          
          {loadingTeams ? (
            <div className="loading-container text-center py-4" style={{ textAlign: 'center', padding: '16px 0' }}>
              <Loader2 size={24} className="animate-spin mx-auto text-primary" style={{ margin: '0 auto', color: 'var(--primary)' }} />
              <p className="mt-2 text-secondary" style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('loadingTeams', 'Loading teams...')}</p>
            </div>
          ) : teams.length === 0 ? (
            <div className="empty-state text-center py-6" style={{ textAlign: 'center', padding: '24px 0' }}>
              <Users size={32} className="mx-auto mb-2 text-secondary opacity-50" style={{ margin: '0 auto 8px', color: 'var(--text-secondary)', opacity: 0.5 }} />
              <p style={{ color: 'var(--text-secondary)' }}>{t('shareModal.noTeams', 'You are not a member of any teams yet.')}</p>
            </div>
          ) : (
            <div className="team-selector">
              <label className="block mb-2 font-medium" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                {t('shareModal.selectTeam', 'Select Team')}
              </label>
              <div className="team-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {teams.map(team => (
                  <button
                    key={team.id}
                    className={`card w-full text-left p-3 border hover:border-primary transition-colors ${selectedTeamId === team.id ? 'border-primary bg-primary-light' : 'border-default'}`}
                    onClick={() => setSelectedTeamId(team.id)}
                    style={{ 
                      borderColor: selectedTeamId === team.id ? 'var(--primary)' : 'var(--border-default)', 
                      backgroundColor: selectedTeamId === team.id ? 'var(--bg-secondary)' : 'transparent', 
                      borderRadius: '8px', 
                      cursor: 'pointer',
                      padding: '12px',
                      textAlign: 'left',
                      width: '100%',
                      borderWidth: '1px',
                      borderStyle: 'solid'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Users size={18} className="text-secondary" style={{ color: 'var(--text-secondary)' }} />
                        <span className="font-medium" style={{ fontWeight: 500 }}>{team.name}</span>
                      </div>
                      {selectedTeamId === team.id && <CheckCircle2 size={18} className="text-primary" style={{ color: 'var(--primary)' }} />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-default)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={isSharing} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleShare}
            disabled={!selectedTeamId || isSharing || teams.length === 0}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 16px', 
              borderRadius: '6px', 
              cursor: (!selectedTeamId || isSharing || teams.length === 0) ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              border: 'none',
              opacity: (!selectedTeamId || isSharing || teams.length === 0) ? 0.6 : 1
            }}
          >
            {isSharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            {t('shareModal.share', 'Share')}
          </button>
        </div>
      </div>
    </div>
  );
}
