import { AnimatePresence, motion } from 'framer-motion';
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
    // El bucle vive dentro de la tarjeta, no en la tarjeta.
    //
    // Antes la `key` estaba aquí arriba: cada siete segundos desaparecía el
    // recuadro entero —marco, cabecera y todo— y volvía a entrar desde cero
    // con su retardo de 0,7 s. Un hueco en la composición, y la sensación de
    // que la página se había recargado sola. Ahora el marco se queda quieto
    // (es lo que dice "esto es una conversación en vivo") y lo único que se
    // repite son los mensajes, que salen por arriba antes de que entren los
    // siguientes: se lee como un hilo que avanza y no como un corte.
    <div className="auth-demo" aria-hidden="true">
      <div className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
        <span className="auth-demo__dot" /> Conversación en vivo
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={cycle}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-2 flex"
          >
            <div className="auth-demo__bubble auth-demo__bubble--in">Hola, ¿tienen cita para el martes?</div>
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
            <div className="auth-demo__bubble auth-demo__bubble--ai">
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
            <Check size={13} strokeWidth={2.5} className="text-brand" /> Cita creada automáticamente · sin
            intervención humana
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
