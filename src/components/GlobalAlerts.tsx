import { useState, useEffect } from 'react';
import { Bell, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export default function GlobalAlerts() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [miniMemos, setMiniMemos] = useState<any[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('labflow-auth-token');
      if (!token) return;

      // Check settings
      const settingsRes = await api.get<Record<string, string>>('/settings');
      let fetchingEnabled = false;
      if (settingsRes['notify_preparations_global'] === 'true') {
        fetchingEnabled = true;
        const [alertsData, memosData] = await Promise.all([
          api.get<any[]>('/schedule/preparations/alerts'),
          api.get<any[]>('/mini_memos')
        ]);
        setAlerts(alertsData);
        setMiniMemos(memosData);
      } else {
        setAlerts([]);
        setMiniMemos([]);
      }
      setEnabled(fetchingEnabled);
    } catch (e) {
      // Silently ignore
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const handleComplete = async (prepId: number) => {
    try {
      await api.put(`/schedule/preparations/${prepId}/complete`);
      // Remove from local state immediately for snappy UI
      setAlerts(prev => prev.filter(a => a.id !== prepId));
    } catch (e) {
      console.error('Failed to complete preparation', e);
    }
  };

  const handleCompleteMemo = async (memoId: number) => {
    try {
      await api.put(`/mini_memos/${memoId}/complete`);
      setMiniMemos(prev => prev.filter(m => m.id !== memoId));
    } catch (e) {
      console.error('Failed to complete memo', e);
    }
  };

  if (!enabled || (alerts.length === 0 && miniMemos.length === 0)) return null;

  return (
    <div className="global-alerts-widget animate-fade-in-up">
      <div className="global-alerts-header" onClick={() => setMinimized(!minimized)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <Bell size={16} className="text-warning" />
          <span>{t('common.notifications', { count: alerts.length + miniMemos.length, defaultValue: `通知 (${alerts.length + miniMemos.length})` })}</span>
        </div>
        <button className="btn-icon" style={{ padding: 0 }}>
          {minimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {!minimized && (
        <div className="global-alerts-body">
          {alerts.map(alert => (
            <div key={`alert-${alert.id}`} className="global-alert-item">
              <div className="global-alert-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <AlertTriangle size={12} className="text-warning" />
                  <strong>{alert.experiment_type_name}</strong> - {alert.start_time}
                </div>
                <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {alert.message}
                </div>
              </div>
              {alert.requires_check === 1 && (
                <button 
                  className="btn btn-sm btn-ghost" 
                  onClick={() => handleComplete(alert.id)}
                  style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                >
                  <CheckCircle size={14} /> {t('common.done', { defaultValue: '完了' })}
                </button>
              )}
            </div>
          ))}
          {miniMemos.map(memo => (
            <div key={`memo-${memo.id}`} className="global-alert-item" style={{ borderLeft: '3px solid var(--color-info)' }}>
              <div className="global-alert-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <MessageSquare size={12} className="text-info" />
                  <strong>{t('common.miniMemo', { defaultValue: 'ミニミニメモ' })}</strong>
                </div>
                <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {memo.message}
                </div>
              </div>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => handleCompleteMemo(memo.id)}
                style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
              >
                <CheckCircle size={14} /> {t('common.done', { defaultValue: '完了' })}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
