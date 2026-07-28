import * as RadixDialog from '@radix-ui/react-dialog';
import { ChevronRight, PanelLeftClose, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { SECCIONES } from '@/components/layout/secciones';
import { useAuth } from '@/lib/auth-context';

const PREF_KEY = 'wf_sidebar';
/** Debajo de esto no hay barra lateral: la navegación se abre como cajón. */
const CONSULTA_MOVIL = '(max-width: 860px)';
/** Portátil pequeño o tablet: cabe, pero le quita demasiado sitio al contenido. */
const CONSULTA_ESTRECHA = '(max-width: 1180px)';

function useMediaQuery(consulta: string): boolean {
  const [coincide, setCoincide] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = (): void => setCoincide(mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);
  return coincide;
}

/** `null` = el usuario no ha decidido todavía; manda el tamaño de pantalla. */
function preferenciaGuardada(): boolean | null {
  try {
    const valor = localStorage.getItem(PREF_KEY);
    if (valor === 'collapsed') return true;
    if (valor === 'expanded') return false;
  } catch {
    // Safari en navegación privada lanza al tocar localStorage. Sin preferencia
    // guardada la barra sigue funcionando, solo que no se recuerda.
  }
  return null;
}

/**
 * Estado plegado/desplegado de la barra.
 *
 * La preferencia del usuario y el tamaño de pantalla se guardan por separado a
 * propósito: mientras no se toque el botón, la barra decide sola (desplegada en
 * escritorio, plegada en pantallas estrechas). En cuanto se pliega o despliega
 * a mano, esa decisión manda y se recuerda entre visitas — sin dejar plegada
 * para siempre una pantalla ancha solo porque un día se abrió el panel en una
 * tablet.
 */
function usePlegado(): [boolean, (valor: boolean) => void] {
  const estrecha = useMediaQuery(CONSULTA_ESTRECHA);
  const [preferencia, setPreferencia] = useState<boolean | null>(preferenciaGuardada);
  const plegado = preferencia ?? estrecha;

  const cambiar = useCallback((valor: boolean): void => {
    setPreferencia(valor);
    try {
      localStorage.setItem(PREF_KEY, valor ? 'collapsed' : 'expanded');
    } catch {
      // Ver preferenciaGuardada(): sin almacenamiento, solo se pierde el recuerdo.
    }
  }, []);

  return [plegado, cambiar];
}

/**
 * Lista de secciones, con el indicador de la activa.
 *
 * El indicador es **un solo elemento** que se desplaza hasta la sección activa,
 * no un fondo que se enciende y se apaga en cada enlace. Al cambiar de sección
 * la vista sigue el recorrido y sabe de dónde viene, que es justo lo que un
 * cambio de estado sin movimiento no cuenta. Se coloca por índice, así que las
 * filas miden todas lo mismo (`--fila-h` en el CSS).
 */
function Navegacion({ onNavegar }: { onNavegar?: () => void }): JSX.Element {
  const { pathname } = useLocation();
  const activa = SECCIONES.findIndex((s) => pathname.startsWith(s.path));

  return (
    <nav
      className="rail__nav"
      aria-label="Secciones"
      style={{ '--activa': activa } as CSSProperties}
    >
      {activa >= 0 && <span className="rail__marca" aria-hidden="true" />}
      {SECCIONES.map(({ path, label, icon: Icon }) => (
        <span className="rail__hueco" key={path}>
          <NavLink
            to={path}
            onClick={onNavegar}
            // NavLink marca la sección activa por la URL, no por un estado
            // paralelo que se pueda desincronizar de ella.
            className={({ isActive }) => 'rail__item'.concat(isActive ? ' is-active' : '')}
          >
            <Icon size={17} strokeWidth={2} className="rail__icono" />
            {/* Plegada, la etiqueta se queda con opacidad 0 y recortada, no
                `display:none`: sigue siendo el nombre accesible del enlace, así
                que un lector de pantalla lee "Bandeja" y no un icono sin texto. */}
            <span className="rail__texto">{label}</span>
          </NavLink>
          {/* Fuera del enlace (que recorta su contenido) para que pueda salirse
              de una barra de 76px. Solo se muestra plegada. */}
          <span className="rail__tip" aria-hidden="true">
            {label}
          </span>
        </span>
      ))}
    </nav>
  );
}

/** Estado del servicio y acceso a la cuenta, al pie de la barra. */
function Pie({ onAbrirPerfil }: { onAbrirPerfil: () => void }): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <div className="rail__pie">
      <div className="rail__hueco">
        <div className="rail__estado">
          <span className="rail__punto">
            <span className="status-pill__dot" />
          </span>
          <span className="rail__texto">Todo operativo</span>
        </div>
        <span className="rail__tip" aria-hidden="true">
          Todo operativo
        </span>
      </div>

      <DropdownMenu
        trigger={
          <button className="rail__usuario">
            <span className="rail__avatar">{(user?.name || '?').charAt(0).toUpperCase()}</span>
            <span className="rail__texto rail__usuario-datos">
              <b>{user?.name}</b>
              <span>{user?.email}</span>
            </span>
          </button>
        }
        items={[
          { label: 'Mi cuenta', onSelect: onAbrirPerfil },
          { label: 'Salir', onSelect: logout, danger: true },
        ]}
      />
    </div>
  );
}

/**
 * El control de plegado.
 *
 * Cuelga del carril y no de la cabecera, por dos motivos: plegado tiene que
 * poder asomar por fuera de los 76px, y la cabecera recorta lo que le sobra
 * para que el nombre desaparezca al encogerse.
 */
function Alternar({
  plegado,
  onAlternar,
}: {
  plegado: boolean;
  onAlternar: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="rail__alternar"
      onClick={onAlternar}
      aria-expanded={!plegado}
      aria-label={plegado ? 'Desplegar la navegación' : 'Plegar la navegación'}
      title={`${plegado ? 'Desplegar' : 'Plegar'} la navegación (Ctrl + B)`}
    >
      {/* Dos formas para dos papeles. Desplegada es un control más de la
          cabecera y lleva el icono del propio panel; plegada es un tirador
          sobre el borde, y un tirador enseña hacia dónde empuja. */}
      {plegado ? <ChevronRight size={15} strokeWidth={2.5} /> : <PanelLeftClose size={16} strokeWidth={2} />}
    </button>
  );
}

/** Marca del carril: glifo y nombre. El nombre se recorta al plegar. */
function Cabecera(): JSX.Element {
  return (
    <div className="rail__cabecera">
      <span className="rail__glifo">W</span>
      <span className="rail__nombre">WhatsFlow&nbsp;AI</span>
    </div>
  );
}

/**
 * Navegación principal del panel.
 *
 * En escritorio es una barra fija que se pliega a un carril de iconos; por
 * debajo de 860px no hay sitio para ninguna de las dos y se convierte en un
 * cajón que se abre desde la barra superior. El contenido es el mismo en los
 * dos casos: una sola lista de secciones, sin duplicar marcado.
 */
export function Sidebar({
  cajonAbierto,
  onCajon,
  onAbrirPerfil,
}: {
  cajonAbierto: boolean;
  onCajon: (abierto: boolean) => void;
  onAbrirPerfil: () => void;
}): JSX.Element {
  const movil = useMediaQuery(CONSULTA_MOVIL);
  const [plegado, setPlegado] = usePlegado();

  // Ctrl/Cmd + B, el atajo que ya usan los editores y la mayoría de los SaaS
  // con barra plegable. En móvil no hay nada que plegar.
  useEffect(() => {
    if (movil) return;
    function alPulsar(evento: KeyboardEvent): void {
      if (evento.altKey || !(evento.ctrlKey || evento.metaKey)) return;
      if (evento.key.toLowerCase() !== 'b') return;
      // Firefox abre su panel de marcadores con esta combinación.
      evento.preventDefault();
      setPlegado(!plegado);
    }
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [movil, plegado, setPlegado]);

  if (movil) {
    return (
      <RadixDialog.Root open={cajonAbierto} onOpenChange={onCajon}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="wf-overlay" />
          {/* Radix se encarga del foco atrapado, Esc y el clic fuera. */}
          <RadixDialog.Content className="rail rail--cajon">
            <RadixDialog.Title className="sr-only">Navegación</RadixDialog.Title>
            <Cabecera />
            {/* Esc y el clic fuera ya cierran, pero ninguno de los dos se ve en
                un teléfono: sin botón, la única salida visible es adivinarla. */}
            <RadixDialog.Close asChild>
              <button type="button" className="rail__cerrar" aria-label="Cerrar la navegación">
                <X size={17} strokeWidth={2} />
              </button>
            </RadixDialog.Close>
            {/* El cajón se cierra al elegir sección: dejarlo abierto tapando la
                pantalla a la que se acaba de llegar obliga a un gesto de más. */}
            <Navegacion onNavegar={() => onCajon(false)} />
            <Pie onAbrirPerfil={onAbrirPerfil} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    );
  }

  return (
    <aside className={'rail'.concat(plegado ? ' is-plegado' : '')}>
      <Cabecera />
      {/* Antes de la navegación en el DOM: al tabular desde el principio de la
          página, el control del carril viene antes que las secciones. */}
      <Alternar plegado={plegado} onAlternar={() => setPlegado(!plegado)} />
      <Navegacion />
      <Pie onAbrirPerfil={onAbrirPerfil} />
    </aside>
  );
}
