import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/** Cuenta ascendente animada (Framer Motion) al entrar en pantalla o al cambiar el valor. */
export function CountUp({ value, className }: { value: number; className?: string }): JSX.Element {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  // `MotionConfig` solo alcanza a los componentes `motion.*`; este usa `animate`
  // directamente, así que la preferencia hay que consultarla a mano.
  const sinMovimiento = useReducedMotion();

  useEffect(() => {
    // Con movimiento reducido la cifra aparece ya puesta: el número corriendo es
    // exactamente el tipo de animación que molesta a quien pide no verlas.
    if (sinMovimiento) {
      prev.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, sinMovimiento]);

  return (
    <span className={className} aria-label={String(value)}>
      {display.toLocaleString('es')}
    </span>
  );
}
