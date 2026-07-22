import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme-context';

export function ThemeToggle(): JSX.Element {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[var(--hover-bg)] hover:text-ink"
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="text-[15px]"
      >
        {isDark ? '🌙' : '☀️'}
      </motion.span>
    </button>
  );
}
