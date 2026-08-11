import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

export interface User {
  id: number;
  username: string;
  created_at?: string;
  supabase_user_id?: string;
  supabase_email?: string;
}

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isSingleUserMode: boolean;
  supabaseSession: SupabaseSession | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setSupabaseSession: (session: SupabaseSession | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSingleUserMode, setIsSingleUserMode] = useState(false);
  const [supabaseSession, setSupabaseSessionState] = useState<SupabaseSession | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Since backend is forced to single-user mode, this will return user 1
        const userData = await api.get<User>('/auth/me');
        setUser(userData);
        setIsSingleUserMode(true);
      } catch (e) {
        console.error('Auth check failed', e);
        localStorage.removeItem('labflow-auth-token');
        setUser(null);
      }

      // Restore Supabase session from localStorage
      const savedSession = localStorage.getItem('labflow-supabase-session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession) as SupabaseSession;
          // Check if expired
          if (session.expires_at > Date.now() / 1000) {
            setSupabaseSessionState(session);
          } else {
            localStorage.removeItem('labflow-supabase-session');
          }
        } catch (e) {
          localStorage.removeItem('labflow-supabase-session');
        }
      }

      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = (token: string, user: User) => {
    localStorage.setItem('labflow-auth-token', token);
    setUser(user);
    setIsSingleUserMode(false);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('labflow-auth-token');
    localStorage.removeItem('labflow-supabase-session');
    setUser(null);
    setSupabaseSessionState(null);
  };

  const setSupabaseSession = (session: SupabaseSession | null) => {
    setSupabaseSessionState(session);
    if (session) {
      localStorage.setItem('labflow-supabase-session', JSON.stringify(session));
    } else {
      localStorage.removeItem('labflow-supabase-session');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isSingleUserMode, supabaseSession, login, logout, setSupabaseSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
