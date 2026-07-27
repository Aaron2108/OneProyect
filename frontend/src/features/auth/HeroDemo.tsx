import { motion } from 'framer-motion';
import { Bot, Calendar, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

const CYCLE_MS = 7000;

/** Mini-conversación demostrativa: cliente → IA escribe → responde (glow) → nota. En bucle. */
export function HeroDemo(): JSX.Element {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="auth-demo" aria-hidden="true" key={cycle}>
      <div className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
        <span className="auth-demo__dot" /> Conversación en vivo
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-2 flex"
      >
        <div className="auth-demo__bubble" style={{ background: 'var(--demo-in-bg)', color: 'var(--demo-in-ink)', borderBottomLeftRadius: 4 }}>
          Hola, ¿tienen cita para el martes?
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.3 }}
        className="mb-2 flex justify-end"
      >
        <motion.div
          animate={{ opacity: [1, 1, 0] }}
          transition={{ delay: 1.1, duration: 1.1, times: [0, 0.85, 1] }}
          className="auth-demo__typing"
        >
          <i />
          <i />
          <i />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 2.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-end"
      >
        <div className="auth-demo__bubble" style={{ background: 'var(--ai)', color: 'var(--on-ai)', borderBottomRightRadius: 4 }}>
          <span className="mb-1 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide opacity-85">
            <Bot size={11} strokeWidth={2.5} /> IA
          </span>
          <span className="flex items-center gap-1.5">
            ¡Claro! Te dejé agendada el martes a las 4:00&nbsp;p.m. <Calendar size={13} strokeWidth={2} />
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.7, duration: 0.4 }}
        className="mt-3 flex items-center gap-1.5 text-xs text-ink-disabled"
      >
        <Check size={13} strokeWidth={2.5} className="text-brand" /> Cita creada automáticamente · sin intervención humana
      </motion.div>
    </div>
  );
}
