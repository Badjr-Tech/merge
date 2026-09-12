import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';

const PlanContext = createContext({ plan: null, usage: null, has: () => true, refresh: () => {} });

export function PlanProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [company, setCompany] = useState(null);

  const refresh = useCallback(() => {
    if (!isAuthenticated) { setCompany(null); return; }
    api.get('/api/companies/mine').then(r => setCompany(r.data)).catch(() => {});
  }, [isAuthenticated]);

  useEffect(refresh, [refresh]);

  const value = useMemo(() => ({
    company,
    plan: company?.planInfo || null,
    usage: company?.usage || null,
    has: (feature) => !company || !company.planInfo || company.planInfo.features.includes(feature),
    refresh,
  }), [company, refresh]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() { return useContext(PlanContext); }
