import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { apiFetch, readError, setToken } from '../lib/api';
import OtpForm from '../components/auth/OtpForm';

type Step = 'credentials' | 'login-otp' | 'verify-email';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleCredentials = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setNotice('');
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.otpRequired) {
        setStep('login-otp');
      } else if (body.code === 'EMAIL_NOT_VERIFIED') {
        setStep('verify-email');
      } else {
        throw new Error(body.message || 'Invalid credentials');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginOtp = async (otp: string) => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/login/verify', {
        method: 'POST',
        body: JSON.stringify({ email, otp })
      });
      if (!res.ok) throw new Error(await readError(res, 'Invalid or expired code'));
      const { token, user } = await res.json();
      setToken(token);
      onLogin(user, token);
      navigate('/');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmail = async (otp: string) => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, otp })
      });
      if (!res.ok) throw new Error(await readError(res, 'Invalid or expired code'));
      setNotice('Email verified. Please sign in.');
      setStep('credentials');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Welcome to <span className="text-emerald-600">YakFlow</span>
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Or{' '}
          <Link to="/signup" className="font-medium text-emerald-600 hover:text-emerald-500">
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          {step === 'login-otp' && (
            <OtpForm email={email} purpose="LOGIN" submitLabel="Verify and sign in" submitting={submitting} onSubmit={handleLoginOtp} />
          )}
          {step === 'verify-email' && (
            <OtpForm email={email} purpose="VERIFY_EMAIL" submitLabel="Verify email" submitting={submitting} onSubmit={handleVerifyEmail} />
          )}
          {step === 'credentials' && (
          <form className="space-y-6" onSubmit={handleCredentials}>
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all"
                  placeholder="admin@yaksofts.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-emerald-600 hover:text-emerald-500">
                  Forgot password?
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all transform hover:scale-[1.02]"
              >
                Sign in
              </button>
            </div>
          </form>
          )}

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Secure Access Portal</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
