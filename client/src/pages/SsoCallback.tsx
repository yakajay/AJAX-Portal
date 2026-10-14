import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import type { User } from '../types';

// Landing page after the identity provider: the server puts the tokens (or an error) in the URL fragment
const SsoCallback = ({ onLogin }: { onLogin: (user: User, token: string, refreshToken?: string) => void }) => {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    // Drop the tokens from the address bar / history straight away
    window.history.replaceState(null, '', window.location.pathname);

    const token = params.get('token');
    const refreshToken = params.get('refreshToken') ?? undefined;
    if (!token) {
      setError(params.get('error') || 'Sign-in failed. Please try again.');
      return;
    }

    apiFetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        onLogin(await res.json(), token, refreshToken);
        navigate('/', { replace: true });
      })
      .catch(() => setError('Sign-in failed. Please try again.'));
  }, [navigate, onLogin]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-sm text-slate-600">
      {error ? (
        <>
          <p className="text-red-600">{error}</p>
          <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-500">
            Back to sign in
          </Link>
        </>
      ) : (
        <p>Signing you in…</p>
      )}
    </div>
  );
};

export default SsoCallback;
