import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiFetch, readError } from '../../lib/api';

type Props = {
  email: string;
  purpose: 'VERIFY_EMAIL' | 'LOGIN' | 'RESET_PASSWORD';
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (otp: string) => void;
  /** Extra fields (e.g. a new password) rendered above the submit button */
  children?: React.ReactNode;
};

const RESEND_COOLDOWN = 60;

const OtpForm = ({ email, purpose, submitLabel, submitting, onSubmit, children }: Props) => {
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    const res = await apiFetch('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose })
    });
    if (!res.ok) {
      alert(await readError(res, 'Could not resend the code'));
      return;
    }
    setNotice('A new code has been sent if the account is eligible.');
    setCooldown(RESEND_COOLDOWN);
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(otp);
      }}
    >
      <p className="text-sm text-slate-600">
        We emailed a 6-digit code to <span className="font-medium text-slate-900">{email}</span>.
      </p>

      <div>
        <label htmlFor="otp" className="block text-sm font-medium text-slate-700">
          Verification code
        </label>
        <div className="mt-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <KeyRound className="h-5 w-5 text-slate-400" />
          </div>
          <input
            id="otp"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="appearance-none block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl placeholder-slate-400 tracking-[0.4em] focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
            placeholder="123456"
          />
        </div>
      </div>

      {children}

      {notice && <p className="text-xs text-emerald-700">{notice}</p>}

      <button
        type="submit"
        disabled={submitting || otp.length !== 6}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all"
      >
        {submitLabel}
      </button>

      <button
        type="button"
        onClick={resend}
        disabled={cooldown > 0}
        className="w-full text-sm font-medium text-emerald-600 hover:text-emerald-500 disabled:text-slate-400"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>
    </form>
  );
};

export default OtpForm;
