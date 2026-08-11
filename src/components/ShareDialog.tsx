import React, { useState, useEffect } from 'react';
import { X, Users, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabaseGet } from '../api/supabaseClient';

export interface ShareOptions {
  shared_with?: string[];
}

export interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  teams: Array<{ id: string; name: string }>;
  onShare: (teamId: string, options?: ShareOptions) => Promise<void>;
  shareType: 'protocol' | 'experiment_type' | 'milestone' | 'reagent' | 'schedule';
}

interface TeamMember {
  id: number;
  user_id: string; // auth.users.id UUID
  team_id: string;
  role: string;
  user?: {
    username: string;
    email: string;
  };
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  title,
  teams,
  onShare,
  shareType,
}) => {
  const { t } = useTranslation();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTeamId('');
      setMembers([]);
      setSelectedMembers(new Set());
      setError(null);
    } else if (teams.length === 1) {
      setSelectedTeamId(teams[0].id);
    }
  }, [isOpen, teams]);

  useEffect(() => {
    if (selectedTeamId && shareType === 'schedule') {
      const fetchMembers = async () => {
        setLoadingMembers(true);
        setError(null);
        try {
          const data = await supabaseGet<TeamMember[]>(`/teams/${selectedTeamId}/members`);
          setMembers(data);
        } catch (err: any) {
          setError(err.message || t('Failed to load team members'));
        } finally {
          setLoadingMembers(false);
        }
      };
      fetchMembers();
    }
  }, [selectedTeamId, shareType, t]);

  const handleShare = async () => {
    if (!selectedTeamId) {
      setError(t('Please select a team'));
      return;
    }

    setIsSharing(true);
    setError(null);
    try {
      const options: ShareOptions = {};
      if (shareType === 'schedule') {
        if (selectedMembers.size === 0) {
          throw new Error(t('Please select at least one member to share with'));
        }
        options.shared_with = Array.from(selectedMembers);
      }
      
      await onShare(selectedTeamId, options);
      onClose();
    } catch (err: any) {
      setError(err.message || t('Failed to share'));
    } finally {
      setIsSharing(false);
    }
  };

  const toggleMember = (uuid: string) => {
    const newSelection = new Set(selectedMembers);
    if (newSelection.has(uuid)) {
      newSelection.delete(uuid);
    } else {
      newSelection.add(uuid);
    }
    setSelectedMembers(newSelection);
  };

  const selectAll = () => {
    const allIds = members.map(m => m.user_id).filter(id => id);
    setSelectedMembers(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedMembers(new Set());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--text-primary)]">
            <Users size={20} />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm border border-red-100">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t('Select Team')}
              </label>
              {teams.length === 0 ? (
                <div className="p-3 bg-gray-50 rounded-md text-sm text-[var(--text-secondary)]">
                  {t('You do not belong to any teams yet.')}
                </div>
              ) : (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  disabled={isSharing}
                >
                  <option value="">{t('-- Select a team --')}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {shareType === 'schedule' && selectedTeamId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    {t('Share with members')}
                  </label>
                  {members.length > 0 && (
                    <div className="text-xs space-x-2">
                      <button onClick={selectAll} className="text-[var(--primary)] hover:underline">{t('Select All')}</button>
                      <button onClick={deselectAll} className="text-[var(--primary)] hover:underline">{t('Clear')}</button>
                    </div>
                  )}
                </div>
                
                <div className="border border-[var(--border)] rounded-md overflow-hidden max-h-48 overflow-y-auto">
                  {loadingMembers ? (
                    <div className="p-4 flex justify-center text-[var(--text-secondary)]">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : members.length === 0 ? (
                    <div className="p-4 text-center text-sm text-[var(--text-secondary)]">
                      {t('No members found')}
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {members.map(member => (
                        <li key={member.id} className="flex items-center p-2 hover:bg-gray-50 transition-colors">
                          <label className="flex items-center gap-3 w-full cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedMembers.has(member.user_id)}
                              onChange={() => toggleMember(member.user_id)}
                              className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {member.user?.username || t('Unknown User')}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)]">
                                {member.user?.email || ''} ({member.role})
                              </span>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-white border border-[var(--border)] rounded-md hover:bg-gray-50 transition-colors"
            disabled={isSharing}
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleShare}
            disabled={!selectedTeamId || isSharing || (shareType === 'schedule' && selectedMembers.size === 0)}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--primary)] rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSharing && <Loader2 size={16} className="animate-spin" />}
            {t('Share')}
          </button>
        </div>
      </div>
    </div>
  );
};
