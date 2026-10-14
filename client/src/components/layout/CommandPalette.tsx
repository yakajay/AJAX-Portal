import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User as UserIcon, Moon, LogOut, CalendarPlus, LogIn } from 'lucide-react';
import type { User } from '../../types';
import { apiJson } from '../../lib/api';
import { visibleNav } from '../../lib/nav';
import { useWorkspace } from '../../lib/workspace';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

interface Entry {
  id: string;
  group: 'palette.pages' | 'palette.people' | 'palette.actions';
  label: string;
  hint?: string;
  haystack: string;
  icon: React.ElementType;
  run: () => void;
}

interface Person { id: string; name: string; email: string; department?: string; designation?: string }

/** Ctrl/Cmd+K launcher: jump to a page, find a colleague, or run a common action. */
const CommandPalette = ({ open, onClose, user, onLogout }: { open: boolean; onClose: () => void; user: User | null; onLogout: () => void }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<Person[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toggle: toggleTheme } = useTheme();
  const { workspace } = useWorkspace();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
    // Colleagues are fetched the first time the palette opens
    if (people === null) apiJson<Person[]>('/user/directory').then(setPeople).catch(() => setPeople([]));
  }, [open, people]);

  const entries = useMemo<Entry[]>(() => {
    const go = (path: string) => () => navigate(path);
    const pages: Entry[] = visibleNav(user, workspace?.modules).map((item) => ({
      id: `page:${item.path}`, group: 'palette.pages', label: t(item.label), hint: item.path,
      haystack: `${t(item.label)} ${item.keywords ?? ''}`.toLowerCase(), icon: item.icon, run: go(item.path)
    }));
    const actions: Entry[] = [
      { id: 'act:leave', group: 'palette.actions', label: 'Request leave', haystack: 'request apply leave vacation time off', icon: CalendarPlus, run: go('/leave') },
      { id: 'act:clock', group: 'palette.actions', label: 'Clock in / out', haystack: 'clock in out attendance', icon: LogIn, run: go('/') },
      { id: 'act:theme', group: 'palette.actions', label: 'Toggle dark mode', haystack: 'theme dark light mode appearance', icon: Moon, run: toggleTheme },
      { id: 'act:logout', group: 'palette.actions', label: t('header.signOut'), haystack: 'sign out log out logout', icon: LogOut, run: onLogout }
    ];
    const folks: Entry[] = (people ?? []).map((p) => ({
      id: `person:${p.id}`, group: 'palette.people', label: p.name, hint: [p.designation, p.department].filter(Boolean).join(' · ') || p.email,
      haystack: `${p.name} ${p.email} ${p.department ?? ''} ${p.designation ?? ''}`.toLowerCase(), icon: UserIcon,
      run: () => navigate(`/directory?q=${encodeURIComponent(p.name)}`)
    }));
    return [...pages, ...actions, ...folks];
  }, [user, workspace, people, navigate, t, toggleTheme, onLogout]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matched = words.length ? entries.filter((e) => words.every((w) => e.haystack.includes(w))) : entries.filter((e) => e.group !== 'palette.people');
    return matched.slice(0, 30);
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/50 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <Search size={18} className="text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
            className="flex-1 py-4 bg-transparent outline-none text-sm font-semibold text-slate-900 placeholder-slate-400"
          />
          <kbd className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400 font-semibold">{t('palette.empty')}</li>}
          {results.map((entry, i) => {
            const header = entry.group !== lastGroup ? (lastGroup = entry.group) : null;
            return (
              <li key={entry.id} role="presentation">
                {header && <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{t(header as 'palette.pages')}</p>}
                <button
                  id={`palette-${entry.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(entry)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-blue-100' : ''}`}
                >
                  <entry.icon size={18} className="text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-bold text-slate-900">{entry.label}</span>
                  {entry.hint && <span className="ml-auto text-xs text-slate-400 truncate">{entry.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 font-semibold">{t('palette.hint')}</div>
      </div>
    </div>
  );
};

export default CommandPalette;
