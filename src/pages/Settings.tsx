import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Globe, Download, Monitor, Moon, Sun, User, Calendar, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { addToast } = useContext(ToastContext);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  const [profileForm, setProfileForm] = useState({
    currentPassword: '',
    newUsername: '',
    newPassword: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    loadData();
    const storedTheme = localStorage.getItem('labflow-theme') as 'light' | 'dark' | 'system';
    if (storedTheme) {
      setTheme(storedTheme);
    }
  }, []);

  const loadData = async () => {
    try {
      const s = await api.get<Record<string, string>>('/settings');
      setSettings(s);
    } catch (e) { console.error(e); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      
      // Save theme
      localStorage.setItem('labflow-theme', theme);
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark-theme');
      } else {
        document.documentElement.classList.remove('dark-theme');
      }

      addToast('success', t('settings.saved', { defaultValue: '設定を保存しました' }));
      if (settings['language']) i18n.changeLanguage(settings['language']);
    } catch (e) { addToast('error', t('common.errorOccurred')); }
    finally { setSaving(false); }
  };

  const saveProfile = async () => {
    if (!profileForm.currentPassword) {
      addToast('error', '現在のパスワードを入力してください');
      return;
    }
    setSavingProfile(true);
    try {
      await api.put('/auth/profile', profileForm);
      addToast('success', 'アカウント情報を更新しました');
      setProfileForm({ currentPassword: '', newUsername: '', newPassword: '' });
      // Reload page to reflect new username in UI context if needed, or rely on AuthContext if we update it.
      // Easiest is to force a reload after a short delay
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      addToast('error', e.message || '更新に失敗しました');
    } finally {
      setSavingProfile(false);
    }
  };

  const [downloadingBackup, setDownloadingBackup] = useState(false);

  const downloadBackup = async () => {
    try {
      setDownloadingBackup(true);
      const token = localStorage.getItem('labflow-auth-token');
      
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `labflow-backup-${new Date().toISOString().split('T')[0]}.db`,
            types: [{
              description: 'SQLite Database',
              accept: { 'application/x-sqlite3': ['.db', '.sqlite'] },
            }],
          });
          
          const response = await fetch('/api/backup', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (!response.ok) throw new Error('Download failed');
          const blob = await response.blob();
          
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          addToast('success', t('common.savedSuccessfully', '保存しました'));
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            throw err;
          }
        }
      } else {
        // Navigate to the download URL. The browser will handle the attachment without leaving the page.
        window.location.href = `/api/backup?token=${token}`;
      }
    } catch (e: any) {
      addToast('error', t('settings.backupFailed', { defaultValue: 'バックアップのダウンロードに失敗しました' }));
    } finally {
      setDownloadingBackup(false);
    }
  };

  const [restoringBackup, setRestoringBackup] = useState(false);
  
  const restoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!window.confirm('現在のデータはすべて上書きされ、元に戻せなくなります。本当にバックアップを復元しますか？')) {
      e.target.value = '';
      return;
    }
    
    setRestoringBackup(true);
    const formData = new FormData();
    formData.append('backupFile', file);
    
    try {
      const token = localStorage.getItem('labflow-auth-token');
      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Restore failed');
      }
      
      addToast('success', t('settings.restoreSuccess', { defaultValue: 'バックアップを復元しました。' }));
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      addToast('error', t('settings.restoreFailed', { defaultValue: 'バックアップの復元に失敗しました。' }));
      setRestoringBackup(false);
      e.target.value = '';
    }
  };

  const [updateInfo, setUpdateInfo] = useState<{
    update_available: boolean;
    latest_version: string;
    download_url: string;
  } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const data = await api.get<any>('/settings/update/check');
      setUpdateInfo(data);
      if (data.update_available) {
        addToast('success', t('settings.updateFound', { defaultValue: '新しいバージョンが見つかりました！' }));
      } else {
        addToast('success', t('settings.updateUpToDate', { defaultValue: 'お使いのバージョンは最新です。' }));
      }
    } catch (e) {
      addToast('error', t('settings.updateCheckFailed', { defaultValue: 'アップデートの確認に失敗しました。' }));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const applyUpdate = async () => {
    if (!updateInfo || !updateInfo.download_url) return;
    if (!window.confirm(t('settings.updateConfirm', { defaultValue: 'アップデートを開始すると、サーバーが再起動します。よろしいですか？' }))) return;
    setApplyingUpdate(true);
    try {
      await api.post('/settings/update/apply', { download_url: updateInfo.download_url });
      addToast('success', t('settings.updateStarted', { defaultValue: 'アップデートを開始しました。サーバーの再起動を待っています...' }));
      
      // Poll until the server comes back online, then reload
      const pollInterval = setInterval(async () => {
        try {
          const resp = await fetch('/api/settings/update/check', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
          });
          if (resp.ok) {
            clearInterval(pollInterval);
            addToast('success', t('settings.updateComplete', { defaultValue: 'アップデート完了！ページを再読み込みします...' }));
            setTimeout(() => window.location.reload(), 2000);
          }
        } catch {
          // Server still down, keep polling
        }
      }, 3000);
      
      // Give up after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setApplyingUpdate(false);
        addToast('error', t('settings.updateTimeout', { defaultValue: 'サーバーの再起動がタイムアウトしました。手動でstart.batを再起動してください。' }));
      }, 300000);
    } catch (e) {
      // The server may have already shut down — treat this as expected
      addToast('success', t('settings.updateStarted', { defaultValue: 'アップデートを開始しました。サーバーの再起動を待っています...' }));
      
      // Poll until the server comes back online, then reload
      const pollInterval = setInterval(async () => {
        try {
          const resp = await fetch('/api/settings/update/check', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
          });
          if (resp.ok) {
            clearInterval(pollInterval);
            addToast('success', t('settings.updateComplete', { defaultValue: 'アップデート完了！ページを再読み込みします...' }));
            setTimeout(() => window.location.reload(), 2000);
          }
        } catch {
          // Server still down, keep polling
        }
      }, 3000);
      
      setTimeout(() => {
        clearInterval(pollInterval);
        setApplyingUpdate(false);
        addToast('error', t('settings.updateTimeout', { defaultValue: 'サーバーの再起動がタイムアウトしました。手動でstart.batを再起動してください。' }));
      }, 300000);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const presetChanged = (preset: string) => {
    const presets: Record<string, { host: string; port: string }> = {
      gmail: { host: 'smtp.gmail.com', port: '587' },
      outlook: { host: 'smtp-mail.outlook.com', port: '587' },
      university: { host: '', port: '587' },
      custom: { host: '', port: '587' },
    };
    const p = presets[preset];
    if (p) {
      setSettings(prev => ({ ...prev, smtp_preset: preset, smtp_host: p.host, smtp_port: p.port }));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">{t('settings.title')}</h1>
            <p className="page-description">{t('settings.subtitle', { defaultValue: 'システム設定の管理' })}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
        {/* Appearance & Language */}
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Monitor size={18} style={{ marginRight: 8 }} />{t('settings.appearance', { defaultValue: '外観と表示' })}</h3></div>
          <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            
            {/* Theme */}
            <div>
              <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>{t('settings.theme', { defaultValue: 'テーマ' })}</label>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <button 
                  className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`} 
                  onClick={() => setTheme('light')}
                >
                  <Sun size={16} /> {t('settings.themeLight', { defaultValue: 'ライト' })}
                </button>
                <button 
                  className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`} 
                  onClick={() => setTheme('dark')}
                >
                  <Moon size={16} /> {t('settings.themeDark', { defaultValue: 'ダーク' })}
                </button>
                <button 
                  className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-ghost'}`} 
                  onClick={() => setTheme('system')}
                >
                  <Monitor size={16} /> {t('settings.themeSystem', { defaultValue: 'システム' })}
                </button>
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>{t('settings.language')} <Globe size={14} style={{ display: 'inline', marginLeft: 4, opacity: 0.5 }} /></label>
              <div className="lang-switcher" style={{ display: 'inline-flex' }}>
                <button className={i18n.language === 'ja' ? 'active' : ''} onClick={() => { i18n.changeLanguage('ja'); updateSetting('language', 'ja'); }}>日本語</button>
                <button className={i18n.language === 'en' ? 'active' : ''} onClick={() => { i18n.changeLanguage('en'); updateSetting('language', 'en'); }}>English</button>
              </div>
            </div>

            <div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>
            </div>
          </div>
        </div>
        {/* Schedule Settings */}
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Calendar size={18} style={{ marginRight: 8 }} />{t('settings.experimentSchedule', { defaultValue: '実験・スケジュール設定' })}</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <input 
                type="checkbox" 
                id="auto_postpone_steps"
                checked={settings['auto_postpone_steps'] === 'true'} 
                onChange={e => updateSetting('auto_postpone_steps', e.target.checked ? 'true' : 'false')} 
                style={{ width: '18px', height: '18px' }}
              />
              <label htmlFor="auto_postpone_steps" style={{ margin: 0, fontWeight: 500 }}>
                {t('settings.autoPostpone', { defaultValue: 'ステップ完了時の自動スケジュール遅延を有効にする' })}
              </label>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginLeft: '34px', marginTop: '-8px' }}>
              {t('settings.autoPostponeDesc', { defaultValue: '進捗管理モードで、終了予定時刻を過ぎてからステップを完了（チェック）した場合、自動的に以降の同日ステップの時間を後ろにずらします。' })}
            </p>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <input 
                type="checkbox" 
                id="notify_preparations_global"
                checked={settings['notify_preparations_global'] === 'true'} 
                onChange={e => updateSetting('notify_preparations_global', e.target.checked ? 'true' : 'false')} 
                style={{ width: '18px', height: '18px' }}
              />
              <label htmlFor="notify_preparations_global" style={{ margin: 0, fontWeight: 500 }}>
                {t('settings.notifyPrepGlobal', { defaultValue: '事前準備メッセージをアプリ内の全画面で通知する' })}
              </label>
            </div>
            

            <div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>
            </div>
          </div>
        </div>

        {/* Account Settings */}
        <div className="card">
          <div className="card-header"><h3 className="card-title"><User size={18} style={{ marginRight: 8 }} />{t('settings.account', { defaultValue: 'アカウント設定' })}</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {t('settings.accountDesc', { defaultValue: 'ユーザー名やパスワードを変更します。変更を適用するには現在のパスワードが必要です。' })}
            </p>
            <div className="form-group">
              <label className="form-label">{t('settings.currentPassword', { defaultValue: '現在のパスワード (必須)' })}</label>
              <input 
                className="form-input" 
                type="password" 
                value={profileForm.currentPassword}
                onChange={e => setProfileForm(p => ({ ...p, currentPassword: e.target.value }))}
                placeholder={t('settings.currentPassword', { defaultValue: '現在のパスワード (必須)' })}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('settings.newUsername', { defaultValue: '新しいユーザー名 (変更する場合)' })}</label>
                <input 
                  className="form-input" 
                  value={profileForm.newUsername}
                  onChange={e => setProfileForm(p => ({ ...p, newUsername: e.target.value }))}
                  placeholder={t('settings.newUsername', { defaultValue: '新しいユーザー名 (変更する場合)' })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.newPassword', { defaultValue: '新しいパスワード (変更する場合)' })}</label>
                <input 
                  className="form-input" 
                  type="password" 
                  value={profileForm.newPassword}
                  onChange={e => setProfileForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder={t('settings.newPassword', { defaultValue: '新しいパスワード (変更する場合)' })}
                />
              </div>
            </div>
            <div>
              <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile || !profileForm.currentPassword}>
                {savingProfile ? t('common.loading') : t('settings.updateAccount', { defaultValue: 'アカウント情報を更新' })}
              </button>
            </div>
          </div>
        </div>


        {/* Backup */}
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Download size={18} style={{ marginRight: 8 }} />{t('settings.backup')}</h3></div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-md)' }}>{t('settings.backupDesc')}</p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn btn-secondary" onClick={downloadBackup} disabled={downloadingBackup}>
                <Download size={14} /> {downloadingBackup ? t('settings.downloadingBackup', { defaultValue: 'ダウンロード中...' }) : t('settings.downloadBackup')}
              </button>
              
              <div>
                <input 
                  type="file" 
                  id="backup-upload" 
                  accept=".db,.sqlite" 
                  style={{ display: 'none' }} 
                  onChange={restoreBackup} 
                  disabled={restoringBackup}
                />
                <label htmlFor="backup-upload" className={`btn btn-secondary ${restoringBackup ? 'disabled' : ''}`} style={{ cursor: restoringBackup ? 'not-allowed' : 'pointer' }}>
                  <RefreshCw size={14} className={restoringBackup ? 'spin' : ''} /> {restoringBackup ? t('settings.restoringBackup', { defaultValue: '復元中...' }) : t('settings.restoreBackup', { defaultValue: 'バックアップを復元' })}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* System Update */}
        <div className="card">
          <div className="card-header"><h3 className="card-title"><RefreshCw size={18} style={{ marginRight: 8 }} />{t('settings.systemUpdateTitle', { defaultValue: 'システムアップデート' })}</h3></div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-md)' }}>
              {t('settings.systemUpdateDesc', { defaultValue: 'GitHub上の最新リリースを確認し、アプリを更新します。' })}
            </p>
            
            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <button className="btn btn-secondary" onClick={checkUpdate} disabled={checkingUpdate || applyingUpdate}>
                <RefreshCw size={14} className={checkingUpdate ? 'spin' : ''} /> {checkingUpdate ? t('settings.checkingUpdate', { defaultValue: '確認中...' }) : t('settings.checkUpdate', { defaultValue: '最新バージョンを確認' })}
              </button>
              
              {updateInfo && (
                <span style={{ fontSize: 'var(--font-size-sm)', color: updateInfo.update_available ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
                  {updateInfo.update_available ? t('settings.updateAvailableMessage', { version: updateInfo.latest_version, defaultValue: `最新バージョン (${updateInfo.latest_version}) が利用可能です！` }) : t('settings.upToDateMessage', { defaultValue: 'お使いのバージョンは最新です。' })}
                </span>
              )}
            </div>
            
            {updateInfo?.update_available && (
              <div style={{ padding: 'var(--space-md)', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <h4 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>{t('settings.updateReadyTitle', { defaultValue: 'アップデートの準備ができました' })}</h4>
                <p style={{ margin: '0 0 var(--space-md) 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {t('settings.updateReadyDesc', { defaultValue: '「今すぐアップデート」をクリックすると、最新のパッケージをダウンロードして自動的に再起動します。実行中の作業は保存してください。' })}
                </p>
                <button className="btn btn-primary" onClick={applyUpdate} disabled={applyingUpdate}>
                  {applyingUpdate ? t('settings.updating', { defaultValue: 'アップデート中...' }) : t('settings.updateNow', { defaultValue: '今すぐアップデート' })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
