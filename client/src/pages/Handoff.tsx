import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, readError } from '../lib/api';
import type { User } from '../types';

// Landing page on a company's own address after signing in at the shared address: trades the one-time ticket for a session here
const Handoff = ({ onLogin }: { onLogin: (user: User, token: string, refreshToken?: string) => void }) => {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = new URLSearchParams(window.location.search).get('code');
    window.history.replaceState(null, '', window.location.pathname); // the ticket is single-use; keep it out of the history anyway
    if (!code) {
      setError('This sign-in link is incomplete.');
      return;
    }
    apiFetch('/auth/handoff', { method: 'POST', body: JSON.stringify({ code }) })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'This sign-in link has expired.'));
        const { token, refreshToken, user } = await res.json();
        onLogin(user, token, refreshToken);
        navigate('/', { replace: true });
      })
      .catch((err: Error) => setError(err.message || 'Sign-in failed. Please try again.'));
  }, [navigate, onLogin]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-sm text-slate-600">
      {error ? (
        <>
          <p role="alert" className="text-red-600">{error}</p>
          <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-500">Back to sign in</Link>
        </>
      ) : (
        <p>Signing you in…</p>
      )}
    </div>
  );
};

export default Handoff;
