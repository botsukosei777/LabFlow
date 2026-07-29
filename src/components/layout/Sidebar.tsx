import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  CalendarDays,
  FlaskConical,
  Target,
  Package,
  RotateCcw,
  Settings,
  ChevronLeft,
  ChevronRight,
  Beaker,
  LogOut,
  User,
  Book,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/calendar', icon: CalendarDays, labelKey: 'nav.calendar' },
  { path: '/experiments', icon: FlaskConical, labelKey: 'nav.experiments' },
  { path: '/notebook', icon: Book, labelKey: 'nav.notebook' },
  { path: '/milestones', icon: Target, labelKey: 'nav.milestones' },
  { path: '/inventory', icon: Package, labelKey: 'nav.inventory' },
  { path: '/routines', icon: RotateCcw, labelKey: 'nav.routines' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Beaker size={20} />
        </div>
        <span className="sidebar-title">{t('app.name', 'LabFlow')}</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span className="sidebar-nav-label">{t(item.labelKey, { defaultValue: (item as any).fallbackLabel || '' })}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && user && (
          <div className="mb-4 flex items-center justify-between bg-white/5 dark:bg-black/20 p-2 rounded-lg">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="bg-indigo-600 rounded-full p-1 flex-shrink-0">
                <User size={16} className="text-white" />
              </div>
              <span className="text-sm font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                {user.username}
              </span>
            </div>
            <button onClick={handleLogout} className="p-1 hover:text-red-500 transition-colors" title="ログアウト">
              <LogOut size={16} />
            </button>
          </div>
        )}
        <div className="lang-switcher" style={{ marginBottom: 'var(--space-sm)' }}>
          <button
            className={i18n.language === 'ja' ? 'active' : ''}
            onClick={() => i18n.changeLanguage('ja')}
          >
            JA
          </button>
          <button
            className={i18n.language === 'en' ? 'active' : ''}
            onClick={() => i18n.changeLanguage('en')}
          >
            EN
          </button>
        </div>
        <button className="sidebar-toggle" onClick={onToggle}>
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
    </aside>
  );
}
