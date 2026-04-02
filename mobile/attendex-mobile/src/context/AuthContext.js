import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authStorage from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authStorage.getFirebaseToken().then((t) => {
      setTokenState(t);
      setReady(true);
    });
  }, []);

  const setFirebaseToken = useCallback(async (t) => {
    await authStorage.setFirebaseToken(t);
    setTokenState(t);
  }, []);

  const clearAuth = useCallback(async () => {
    await authStorage.clearFirebaseToken();
    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({ token, ready, setFirebaseToken, clearAuth }),
    [token, ready, setFirebaseToken, clearAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
