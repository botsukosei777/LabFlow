import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Copy, Trash2, Shield, Crown, UserMinus, RefreshCw, 
  ChevronLeft, Loader2, Search, CheckCircle2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabaseGet, supabasePost, supabasePut, supabaseDelete } from '../api/supabaseClient';

interface Team {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
  my_role?: 'owner' | 'admin' | 'member';
}

interface TeamMember {
  id: number;
  user_id: string;
  team_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  user?: {
    username: string;
    email: string;
  };
}

export const Teams: React.FC = () => {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create / Join / Detail states
  const [isCreating, setIsCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newTeamData, setNewTeamData] = useState({ name: '', description: '' });
  
  // UI states
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Supabase status
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'not_configured' | 'not_linked' | 'no_session' | 'ready'>('checking');

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const data = await supabaseGet<Team[]>('/teams');
      setTeams(data);
    } catch (err: any) {
      // Parse specific error messages from middleware
      if (err.message?.includes('not configured')) {
        setSupabaseStatus('not_configured');
      } else if (err.message?.includes('not linked')) {
        setSupabaseStatus('not_linked');
      } else if (err.message?.includes('authentication required')) {
        setSupabaseStatus('no_session');
      } else {
        setError(err.message || t('Failed to load teams'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if Supabase session exists in localStorage
    const session = localStorage.getItem('labflow-supabase-session');
    if (!session) {
      // Still try fetching — backend will tell us the exact status
    }
    fetchTeams();
  }, []);

  const fetchTeamMembers = async (teamId: string) => {
    setLoadingMembers(true);
    try {
      const data = await supabaseGet<TeamMember[]>(`/teams/${teamId}/members`);
      setTeamMembers(data);
    } catch (err: any) {
      setError(err.message || t('Failed to load team members'));
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    fetchTeamMembers(team.id);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setActionLoading(true);
    try {
      const newTeam = await supabasePost<Team>('/teams', newTeamData);
      setTeams([...teams, { ...newTeam, member_count: 1, my_role: 'owner' }]);
      setIsCreating(false);
      setNewTeamData({ name: '', description: '' });
      handleSelectTeam({ ...newTeam, member_count: 1, my_role: 'owner' });
    } catch (err: any) {
      setError(err.message || t('Failed to create team'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!joinCode) return;
    setActionLoading(true);
    try {
      const joinedTeam = await supabasePost<{team: Team}>('/teams/join', { invite_code: joinCode });
      setTeams([...teams, joinedTeam.team]);
      setJoinCode('');
      handleSelectTeam(joinedTeam.team);
    } catch (err: any) {
      setError(err.message || t('Failed to join team'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm(t('Are you sure you want to delete this team? This action cannot be undone.'))) return;
    setActionLoading(true);
    try {
      await supabaseDelete(`/teams/${teamId}`);
      setTeams(teams.filter(t => t.id !== teamId));
      setSelectedTeam(null);
    } catch (err: any) {
      setError(err.message || t('Failed to delete team'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveTeam = async (teamId: string) => {
    if (!window.confirm(t('Are you sure you want to leave this team?'))) return;
    setActionLoading(true);
    try {
      await supabasePost(`/teams/${teamId}/leave`); 
      setTeams(teams.filter(t => t.id !== teamId));
      setSelectedTeam(null);
    } catch (err: any) {
      setError(err.message || t('Failed to leave team'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateCode = async (teamId: string) => {
    setActionLoading(true);
    try {
      const res = await supabasePost<{invite_code: string}>(`/teams/${teamId}/regenerate-code`);
      if (selectedTeam) {
        setSelectedTeam({ ...selectedTeam, invite_code: res.invite_code });
      }
    } catch (err: any) {
      setError(err.message || t('Failed to regenerate invite code'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (teamId: string, userId: string) => {
    if (!window.confirm(t('Are you sure you want to remove this member?'))) return;
    setActionLoading(true);
    try {
      await supabaseDelete(`/teams/${teamId}/members/${userId}`);
      setTeamMembers(teamMembers.filter(m => m.user_id !== userId));
    } catch (err: any) {
      setError(err.message || t('Failed to remove member'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRole = async (teamId: string, userId: string, newRole: string) => {
    setActionLoading(true);
    try {
      await supabasePut(`/teams/${teamId}/members/${userId}`, { role: newRole });
      setTeamMembers(teamMembers.map(m => m.user_id === userId ? { ...m, role: newRole as any } : m));
    } catch (err: any) {
      setError(err.message || t('Failed to update role'));
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Sub-components rendering ---

  const renderTeamList = () => {
    // Show setup guide if Supabase is not ready
    if (supabaseStatus !== 'ready' && supabaseStatus !== 'checking') {
      return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <Users size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-lg)', margin: '0 auto var(--space-lg)' }} />
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-md)', color: 'var(--text-primary)' }}>
            {t('チーム機能を使うにはセットアップが必要です')}
          </h2>
          {supabaseStatus === 'not_configured' && (
            <div style={{ background: 'var(--color-warning-dim)', border: '1px solid var(--color-warning)', borderRadius: 'var(--border-radius-lg)', padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
              <p style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: 'var(--color-warning)' }}>
                ⚠️ Supabase未設定
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {t('チーム共有機能を使うには、まず .env ファイルにSupabaseの接続情報を設定してサーバーを再起動してください。')}
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-sm)' }}>
                .env.example をコピーして .env を作成 → Supabase Dashboard から API キーを取得して入力 → LabFlowアプリを再起動
              </p>
            </div>
          )}
          {supabaseStatus === 'not_linked' && (
            <div style={{ background: 'var(--color-info-dim)', border: '1px solid var(--color-info)', borderRadius: 'var(--border-radius-lg)', padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
              <p style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: '#60A5FA' }}>
                🔗 Supabaseアカウント未連携
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {t('Supabaseは設定済みですが、アカウントの連携がまだです。設定画面の「チーム連携」セクションでアカウントを作成またはリンクしてください。')}
              </p>
            </div>
          )}
          {supabaseStatus === 'no_session' && (
            <div style={{ background: 'var(--color-info-dim)', border: '1px solid var(--color-info)', borderRadius: 'var(--border-radius-lg)', padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
              <p style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: '#60A5FA' }}>
                🔑 Supabaseへのログインが必要です
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {t('Supabaseセッションが切れています。設定画面の「チーム連携」セクションで再ログインしてください。')}
              </p>
            </div>
          )}
          <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--color-primary)', color: 'white', borderRadius: 'var(--border-radius-md)', textDecoration: 'none', fontWeight: 'var(--font-weight-medium)' }}>
            {t('設定画面を開く')}
          </a>
        </div>
      );
    }

    return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('Teams')}</h1>
          <p className="text-[var(--text-secondary)]">{t('Manage your lab teams and collaboration groups')}</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          <Plus size={20} />
          {t('Create Team')}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-100">
          {error}
        </div>
      )}

      {/* Join Team Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-[var(--border)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Search size={20} className="text-[var(--text-secondary)]" />
          {t('Join a Team')}
        </h3>
        <form onSubmit={handleJoinTeam} className="flex gap-3">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t('Enter invite code')}
            className="flex-1 px-4 py-2 border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            disabled={actionLoading}
          />
          <button
            type="submit"
            disabled={!joinCode || joinCode.length < 8 || actionLoading}
            className="px-6 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 size={20} className="animate-spin" /> : t('Join')}
          </button>
        </form>
      </div>

      {/* Teams Grid */}
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 rounded-lg border border-[var(--border)] border-dashed">
          <Users size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{t('No teams yet')}</h3>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            {t("You haven't joined or created any teams. Teams allow you to share protocols, reagents, and schedules with other lab members.")}
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            <Plus size={20} />
            {t('Create Your First Team')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <div
              key={team.id}
              onClick={() => handleSelectTeam(team)}
              className="bg-white rounded-lg shadow-sm border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col"
            >
              <div className="h-2 w-full bg-[var(--primary)] opacity-80" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] line-clamp-1">{team.name}</h3>
                  <div className="flex items-center text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                    {team.my_role === 'owner' && <Crown size={12} className="mr-1" />}
                    {team.my_role === 'admin' && <Shield size={12} className="mr-1" />}
                    {t(team.my_role || 'member')}
                  </div>
                </div>
                <p className="text-[var(--text-secondary)] text-sm mb-6 flex-1 line-clamp-2">
                  {team.description || t('No description provided.')}
                </p>
                <div className="flex items-center text-sm text-[var(--text-secondary)] border-t border-[var(--border)] pt-4 mt-auto">
                  <Users size={16} className="mr-2" />
                  {team.member_count} {team.member_count === 1 ? t('Member') : t('Members')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    );
  };

  const renderCreateTeamModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('Create New Team')}</h2>
          <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>
        <form onSubmit={handleCreateTeam} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-100">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t('Team Name')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newTeamData.name}
                onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder={t('e.g. Molecular Biology Lab')}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t('Description')} ({t('Optional')})
              </label>
              <textarea
                value={newTeamData.description}
                onChange={(e) => setNewTeamData({ ...newTeamData, description: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] min-h-[100px]"
                placeholder={t('Briefly describe this team...')}
              />
            </div>
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)] rounded-md hover:bg-gray-50 transition-colors"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={!newTeamData.name.trim() || actionLoading}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {actionLoading && <Loader2 size={16} className="animate-spin" />}
              {t('Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderTeamDetail = () => {
    if (!selectedTeam) return null;
    const isOwnerOrAdmin = selectedTeam.my_role === 'owner' || selectedTeam.my_role === 'admin';
    const isOwner = selectedTeam.my_role === 'owner';

    return (
      <div className="space-y-6">
        <button 
          onClick={() => setSelectedTeam(null)}
          className="flex items-center text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors mb-2"
        >
          <ChevronLeft size={16} className="mr-1" />
          {t('Back to Teams')}
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-[var(--border)] overflow-hidden">
          <div className="h-3 w-full bg-[var(--primary)] opacity-80" />
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-[var(--text-primary)]">{selectedTeam.name}</h1>
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold flex items-center">
                    {selectedTeam.my_role === 'owner' && <Crown size={12} className="mr-1" />}
                    {t(selectedTeam.my_role || 'member')}
                  </span>
                </div>
                <p className="text-[var(--text-secondary)] max-w-2xl">{selectedTeam.description || t('No description provided.')}</p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                {isOwner && (
                  <button 
                    onClick={() => handleDeleteTeam(selectedTeam.id)}
                    className="px-4 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 flex items-center gap-2 text-sm transition-colors"
                  >
                    <Trash2 size={16} />
                    {t('Delete Team')}
                  </button>
                )}
                {!isOwner && (
                  <button 
                    onClick={() => handleLeaveTeam(selectedTeam.id)}
                    className="px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)] rounded-md hover:bg-gray-50 flex items-center gap-2 text-sm transition-colors"
                  >
                    <UserMinus size={16} />
                    {t('Leave Team')}
                  </button>
                )}
              </div>
            </div>

            {/* Invite Section */}
            {isOwnerOrAdmin && (
              <div className="bg-indigo-50/50 p-6 rounded-lg border border-indigo-100 mb-8">
                <h3 className="text-lg font-semibold text-indigo-900 mb-2">{t('Invite Members')}</h3>
                <p className="text-sm text-indigo-700 mb-4">{t('Share this code with lab members to allow them to join this team.')}</p>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative group">
                    <div className="flex items-center bg-white border border-indigo-200 rounded-md overflow-hidden">
                      <code className="px-4 py-2 text-lg font-mono font-bold text-indigo-700 tracking-wider">
                        {selectedTeam.invite_code}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(selectedTeam.invite_code)}
                        className="px-4 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors border-l border-indigo-200 flex items-center gap-2 font-medium"
                      >
                        {copied ? <CheckCircle2 size={18} className="text-green-600" /> : <Copy size={18} />}
                        {copied ? t('Copied') : t('Copy')}
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRegenerateCode(selectedTeam.id)}
                    disabled={actionLoading}
                    className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 p-2 rounded hover:bg-indigo-100/50 transition-colors ml-2"
                  >
                    <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
                    {t('Regenerate')}
                  </button>
                </div>
              </div>
            )}

            {/* Members Section */}
            <div>
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Users size={20} className="text-[var(--text-secondary)]" />
                {t('Members')} 
                <span className="text-sm font-normal text-[var(--text-secondary)] bg-gray-100 px-2 py-0.5 rounded-full ml-2">
                  {teamMembers.length}
                </span>
              </h3>
              
              <div className="bg-white border border-[var(--border)] rounded-lg overflow-hidden">
                {loadingMembers ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-[var(--border)]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('User')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('Role')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('Joined')}</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-[var(--border)]">
                      {teamMembers.map((member) => (
                        <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-8 w-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm">
                                {(member.user?.username || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-[var(--text-primary)]">{member.user?.username || t('Unknown User')}</div>
                                <div className="text-sm text-[var(--text-secondary)]">{member.user?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isOwner && member.role !== 'owner' ? (
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(selectedTeam.id, member.user_id, e.target.value)}
                                disabled={actionLoading}
                                className="text-sm border border-[var(--border)] rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                              >
                                <option value="admin">{t('Admin')}</option>
                                <option value="member">{t('Member')}</option>
                              </select>
                            ) : (
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                member.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                                member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {t(member.role)}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                            {new Date(member.joined_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {isOwnerOrAdmin && member.role !== 'owner' && (
                              <button
                                onClick={() => handleRemoveMember(selectedTeam.id, member.user_id)}
                                disabled={actionLoading}
                                className="text-red-600 hover:text-red-900 transition-colors"
                              >
                                {t('Remove')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {selectedTeam ? renderTeamDetail() : renderTeamList()}
      {isCreating && renderCreateTeamModal()}
    </div>
  );
};

export default Teams;
