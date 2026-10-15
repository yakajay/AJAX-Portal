import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import type { User } from '../../types';
import { apiFetch, apiSend, readError } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import { squareThumbnail } from '../../lib/image';
import { Avatar } from '../Avatar';

const MAX_PICK_BYTES = 10 * 1024 * 1024;

// The signed-in user's own photo: pick any image, it is cropped square and shrunk in the browser before upload
export const ProfilePhoto = ({ user, onUserUpdate }: { user: User & { avatarVersion?: number | null }; onUserUpdate?: (user: User) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (next: User) => onUserUpdate?.({ ...user, ...next });

  const pick = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) return setError('Choose an image file (PNG, JPEG or WebP).');
    if (file.size > MAX_PICK_BYTES) return setError('Choose an image under 10 MB.');
    setBusy(true);
    try {
      const blob = await squareThumbnail(file);
      const res = await apiFetch('/user/profile/avatar', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
      apply(await res.json());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try { apply(await apiSend<User>('DELETE', '/user/profile/avatar')); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="text-center">
      <div className="relative inline-block">
        <div className="w-28 h-28 rounded-3xl bg-cyan-50 overflow-hidden flex items-center justify-center text-cyan-700 text-4xl font-black border-4 border-white shadow-xl mx-auto">
          <Avatar person={user} />
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Profile photo file" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        <button
          type="button"
          disabled={busy}
          aria-label={user.avatarVersion ? 'Change profile photo' : 'Add profile photo'}
          onClick={() => input.current?.click()}
          className="absolute -bottom-2 -right-2 p-2.5 bg-slate-900 text-white rounded-2xl border-4 border-white shadow-lg hover:bg-slate-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          <Camera size={18} />
        </button>
      </div>
      {user.avatarVersion ? (
        <div className="mt-4">
          <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-600 disabled:opacity-50"><Trash2 size={12} />Remove photo</button>
        </div>
      ) : null}
      {error && <p role="alert" className="mt-3 text-xs font-bold text-rose-600">{error}</p>}
    </div>
  );
};
