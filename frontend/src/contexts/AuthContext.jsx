import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { subscribeToUnauthorized } from '../api';

const AuthContext = createContext(null);

function getCsrfTokenFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

async function fetchAuthStatus() {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [loading, setLoading] = useState(true);
  const revalidatePromiseRef = useRef(null);

  const syncAuthState = useCallback((data) => {
    if (data?.authenticated) {
      setUser({ username: data.username });
      setCsrfToken(getCsrfTokenFromCookie());
      return true;
    }
    setUser(null);
    setCsrfToken('');
    return false;
  }, []);

  const revalidateAuth = useCallback(async () => {
    if (revalidatePromiseRef.current) {
      return revalidatePromiseRef.current;
    }

    revalidatePromiseRef.current = fetchAuthStatus()
      .then((data) => syncAuthState(data))
      .catch(() => Boolean(user))
      .finally(() => {
        revalidatePromiseRef.current = null;
      });

    return revalidatePromiseRef.current;
  }, [syncAuthState, user]);

  useEffect(() => {
    fetchAuthStatus()
      .then((data) => {
        syncAuthState(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [syncAuthState]);

  useEffect(() => {
    return subscribeToUnauthorized(() => {
      void revalidateAuth();
    });
  }, [revalidateAuth]);

  const login = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || 'Login failed');
    }
    const data = await res.json();
    setUser({ username: data.username });
    setCsrfToken(data.csrf_token);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
    }).catch(() => {});
    setUser(null);
    setCsrfToken('');
  }, [csrfToken]);

  return (
    <AuthContext.Provider value={{ user, csrfToken, loading, login, logout, revalidateAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
