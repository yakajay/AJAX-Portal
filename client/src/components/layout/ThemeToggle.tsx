import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';

const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex items-center justify-center w-12 h-12 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
};

export default ThemeToggle;
