import { useState, useEffect, useCallback, useRef } from 'react';

const TOKEN_KEY = 'pip-ga-token';

function loadToken() {
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (stored && stored.expiresAt > Date.now()) return stored;
    localStorage.removeItem(TOKEN_KEY);
    return null;
  } catch { return null; }
}

export function useGoogleAuth(clientId) {
  const [token, setToken] = useState(loadToken);
  const [error, setError] = useState(null);
  const clientRef = useRef(null);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    if (!clientId) return;

    const init = () => {
      if (!window.google?.accounts?.oauth2) {
        setTimeout(init, 200);
        return;
      }
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        callback: (response) => {
          if (response.error) {
            setError(response.error_description || response.error);
            return;
          }
          const tokenData = {
            accessToken: response.access_token,
            expiresAt: Date.now() + (response.expires_in - 60) * 1000,
          };
          localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
          setToken(tokenData);
          setError(null);
        },
      });
    };
    init();
  }, [clientId]);

  useEffect(() => {
    if (!token || !clientRef.current) return;
    const msLeft = token.expiresAt - Date.now();
    if (msLeft <= 0) {
      clientRef.current.requestAccessToken({ prompt: '' });
      return;
    }
    refreshTimerRef.current = setTimeout(() => {
      clientRef.current.requestAccessToken({ prompt: '' });
    }, msLeft);
    return () => clearTimeout(refreshTimerRef.current);
  }, [token]);

  const signIn = useCallback(() => {
    if (!clientRef.current) {
      setError('Google Sign-In not loaded yet');
      return;
    }
    clientRef.current.requestAccessToken({ prompt: 'consent' });
  }, []);

  const signOut = useCallback(() => {
    if (token?.accessToken) {
      window.google?.accounts?.oauth2?.revoke?.(token.accessToken);
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setError(null);
  }, [token]);

  return {
    accessToken: token?.accessToken || null,
    isSignedIn: !!token && token.expiresAt > Date.now(),
    signIn,
    signOut,
    error,
  };
}
