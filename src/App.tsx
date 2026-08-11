import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy, createContext, useState, useCallback, useEffect } from 'react';
import Layout from './components/layout/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import type { Toast, ToastType } from './types';
import { api } from './api/client';
import GlobalAlerts from './components/GlobalAlerts';

// Lazy load pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Calendar = lazy(() => import('./pages/Calendar'));
const ExperimentTypes = lazy(() => import('./pages/ExperimentTypes'));
const ExperimentDetail = lazy(() => import('./pages/ExperimentDetail'));
const SubProtocols = lazy(() => import('./pages/SubProtocols'));
const Notebook = lazy(() => import('./pages/Notebook'));
const Milestones = lazy(() => import('./pages/Milestones'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Routines = lazy(() => import('./pages/Routines'));
const Teams = lazy(() => import('./pages/Teams'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

// Toast Context
export const ToastContext = createContext<{
  addToast: (type: ToastType, message: string) => void;
}>({ addToast: () => {} });

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <div className="animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
    </div>
  );
}

// Theme provider logic is integrated here for simplicity
function ThemeManager({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = localStorage.getItem('labflow-theme') || 'light';
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
  }, []);
  
  return <>{children}</>;
}

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ThemeManager>
      <BrowserRouter>
        <AuthProvider>
          <ToastContext.Provider value={{ addToast }}>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/experiments" element={<ExperimentTypes />} />
                    <Route path="/experiments/:id" element={<ExperimentDetail />} />
                    <Route path="/notebook" element={<Notebook />} />
                    <Route path="/milestones" element={<Milestones />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/routines" element={<Routines />} />
                    <Route path="/teams" element={<Teams />} />
                    <Route path="/settings" element={<Settings />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>

            <GlobalAlerts />

            {/* Toast Container */}
            {toasts.length > 0 && (
              <div className="toast-container">
                {toasts.map(toast => (
                  <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-close" onClick={() => removeToast(toast.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </ToastContext.Provider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeManager>
  );
}
