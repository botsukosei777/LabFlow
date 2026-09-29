import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';

interface SidebarAlertsProps {
  collapsed: boolean;
}

export default function SidebarAlerts({ collapsed }: SidebarAlertsProps) {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [miniMemos, setMiniMemos] = useState<any[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('labflow-auth-token');
      if (!token) return;

      const settingsRes = await api.get<Record<string, string>>('/settings').catch(() => ({}));
      // Enabled by default unless explicitly disabled ('false')
      if (settingsRes['notify_preparations_global'] !== 'false') {
        const [alertsData, memosData] = await Promise.all([
          api.get<any[]>('/schedule/preparations/alerts').catch(() => []),
          api.get<any[]>('/mini_memos').catch(() => [])
        ]);
        setAlerts(Array.isArray(alertsData) ? alertsData : []);
        setMiniMemos(Array.isArray(memosData) ? memosData : []);
      } else {
        setAlerts([]);
        setMiniMemos([]);
      }
    } catch {
      // Silently ignore network errors during periodic polling
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    if (popoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popoverOpen]);

  const handleComplete = async (prepId: number) => {
    try {
      await api.put(`/schedule/preparations/${prepId}/complete`);
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

  const totalCount = alerts.length + miniMemos.length;
  if (totalCount === 0) return null;

  const renderAlertItems = () => (
    <>
      {alerts.map(alert => (
        <div key={`alert-${alert.id}`} className="sidebar-alert-item">
          <div className="sidebar-alert-meta">
            <span className="sidebar-alert-tag">{alert.experiment_type_name || t('experiments.title', '実験')}</span>
            {alert.start_time && (
              <span className="sidebar-alert-time">{alert.start_time}</span>
            )}
          </div>
          <div className="sidebar-alert-message">
            {alert.message}
          </div>
          <button
            className="sidebar-alert-btn-done"
            onClick={() => handleComplete(alert.id)}
            title={t('common.done', '完了')}
          >
            <CheckCircle size={13} />
            <span>{alert.requires_check === 1 ? t('common.done', '完了') : t('common.confirm', '確認')}</span>
          </button>
        </div>
      ))}

      {miniMemos.map(memo => (
        <div key={`memo-${memo.id}`} className="sidebar-alert-item sidebar-alert-memo">
          <div className="sidebar-alert-meta">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8' }}>
              <MessageSquare size={12} />
              {t('common.miniMemo', 'ミニミニメモ')}
            </span>
          </div>
          <div className="sidebar-alert-message">
            {memo.message}
          </div>
          <button
            className="sidebar-alert-btn-done"
            onClick={() => handleCompleteMemo(memo.id)}
            title={t('common.done', '完了')}
          >
            <CheckCircle size={13} />
            <span>{t('common.done', '完了')}</span>
          </button>
        </div>
      ))}
    </>
  );

  const getTitle = () => {
    if (alerts.length > 0 && miniMemos.length > 0) {
      return `${t('experiments.inAdvanceTitle', 'In-advance')} / ${t('common.miniMemo', 'メモ')}`;
    }
    if (miniMemos.length > 0) {
      return t('common.miniMemo', 'ミニミニメモ');
    }
    return t('experiments.inAdvanceTitle', 'In-advance メッセージ');
  };

  // When sidebar is collapsed to icon-only mode
  if (collapsed) {
    return (
      <div className="sidebar-alert-collapsed-container" ref={popoverRef}>
        <button
          className="sidebar-alert-collapsed-btn"
          onClick={() => setPopoverOpen(!popoverOpen)}
          title={`${getTitle()} (${totalCount})`}
          aria-label="In-advance messages alert"
        >
          <AlertTriangle size={20} className="animate-pulse" style={{ color: '#ef4444' }} />
          <span className="sidebar-alert-collapsed-badge">{totalCount}</span>
        </button>

        {popoverOpen && (
          <div className="sidebar-alert-popover">
            <div className="sidebar-alerts-header">
              <div className="sidebar-alerts-title">
                <AlertTriangle size={15} style={{ color: '#ef4444' }} />
                <span>{getTitle()}</span>
                <span className="sidebar-alerts-badge">{totalCount}</span>
              </div>
            </div>
            <div className="sidebar-alerts-body">
              {renderAlertItems()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // When sidebar is expanded (normal mode)
  return (
    <div className="sidebar-alerts">
      <div className="sidebar-alerts-header" onClick={() => setMinimized(!minimized)}>
        <div className="sidebar-alerts-title">
          <AlertTriangle size={15} className="animate-pulse" style={{ color: '#ef4444' }} />
          <span>{getTitle()}</span>
          <span className="sidebar-alerts-badge">{totalCount}</span>
        </div>
        <button className="btn-icon" style={{ padding: 0, color: '#ef4444' }}>
          {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {!minimized && (
        <div className="sidebar-alerts-body">
          {renderAlertItems()}
        </div>
      )}
    </div>
  );
}
