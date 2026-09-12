import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import api, { setUnauthorizedHandler } from '../api';

const AuthContext = createContext(null);

function readStoredUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const decoded = jwtDecode(token);
    if (decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return null;
    }
    const cached = localStorage.getItem('user');
    if (cached) return JSON.parse(cached);
    const u = decoded.user || {};
    return { id: u.id, role: u.role, username: u.username, name: u.name, email: u.email, companyId: u.companyId, company: u.companyName ? { id: u.companyId, name: u.companyName } : null };
  } catch {
    localStorage.removeItem('token');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const signIn = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    if (userData) localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData || readStoredUser());
  }, []);

  useEffect(() => { setUnauthorizedHandler(signOut); }, [signOut]);

  // Refresh the profile (and silently rotate the token) on load
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!localStorage.getItem('token')) { setReady(true); return; }
      try {
        const res = await api.get('/api/auth/me');
        if (!cancelled) signIn(res.data.token, res.data.user);
      } catch (err) {
        if (!cancelled && err.response && (err.response.status === 401 || err.response.status === 404)) signOut();
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    refresh();
    return () => { cancelled = true; };
  }, [signIn, signOut]);

  const value = useMemo(() => ({
    user,
    ready,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    isApprover: user?.role === 'approver',
    canEdit: user && ['admin', 'editor', 'approver'].includes(user.role),
    signIn,
    signOut,
    updateUser: (u) => { localStorage.setItem('user', JSON.stringify(u)); setUser(u); },
  }), [user, ready, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
