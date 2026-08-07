import { Check, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

const BENEFICIOS = [
  'Recibe mensajes en tiempo real.',
  'Responde desde una única bandeja.',
  'Centraliza las conversaciones de tu equipo.',
  'Preparado para automatizaciones con IA.',
];

/**
 * La bandeja de quien todavía no ha conectado nada.
 *
 * Una bandeja vacía no dice si no ha escrito nadie o si falta configurar algo, y
 * esa duda es justo la que hace abandonar el primer día. Aquí solo hay un
 * camino: conectar el canal. Todo lo demás —filtros, exportar, buscar— sigue
 * ahí a la izquierda, pero sin nada que hacer con ello hasta ese paso.
 *
 * Se enseña únicamente cuando NO hay canal vinculado **y** no hay ninguna
 * conversación. Si la sesión se cae con conversaciones ya dentro, esto sería
 * mentira ("tu primer canal") y taparía el trabajo pendiente: ese caso es
 * reconectar, no empezar.
 */
export function BandejaSinCanal(): JSX.Element {
  const navigate = useNavigate();
  const [comoFunciona, setComoFunciona] = useState(false);

  return (
    <div className="reveal flex h-full items-center justify-center overflow-y-auto p-6 sm:p-10">
      {/* `my-auto` en vez de centrar con el padre: si la pantalla es más baja
          que el contenido, centrar recortaría por arriba y el título quedaría
          fuera de alcance. Así se desplaza con normalidad. */}
      <div className="my-auto w-full max-w-[660px] text-center">
        <Ilustracion />

        <h2 className="mb-3 font-display text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">
          Conecta tu primer canal
        </h2>
        <p className="mx-auto mb-8 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft">
          Conecta tu cuenta de WhatsApp para comenzar a recibir y responder conversaciones desde
          un solo lugar. Una vez conectado, todos los mensajes aparecerán automáticamente en esta
          bandeja.
        </p>

        {/* Una columna en estrecho y dos en ancho: cuatro líneas centradas y
            sueltas se leen como una lista de la compra; en dos columnas
            alineadas a la izquierda se leen como capacidades del producto.
            El ancho lo fija la frase más larga: por debajo de esto las cuatro
            se parten en dos líneas cada una y la rejilla queda irregular. */}
        <ul className="mx-auto mb-9 grid grid-cols-1 gap-x-8 gap-y-3.5 text-left sm:grid-cols-2">
          {BENEFICIOS.map((texto) => (
            <li key={texto} className="flex items-start gap-2.5">
              <span
                className="mt-[1px] grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full bg-brand-tint text-brand"
                aria-hidden="true"
              >
                <Check size={11} strokeWidth={3} />
              </span>
              <span className="text-[13.5px] leading-snug text-ink-soft">{texto}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            variant="brand"
            onClick={() => navigate('/canales')}
            className="w-full px-7 py-3 text-[15px] sm:w-auto"
          >
            <PlugZap size={17} strokeWidth={2} aria-hidden="true" />
            Conectar WhatsApp
          </Button>
          <Button
            variant="ghost"
            onClick={() => setComoFunciona(true)}
            className="w-full px-7 py-3 text-[15px] sm:w-auto"
          >
            Ver cómo funciona
          </Button>
        </div>
      </div>

      <ComoFunciona open={comoFunciona} onOpenChange={setComoFunciona} />
    </div>
  );
}

/**
 * WhatsFlow y WhatsApp, y el enlace que falta entre los dos.
 *
 * SVG propio en vez de un icono suelto: lo que hay que contar es una conexión
 * pendiente, y eso son dos extremos y algo entre medias. El de la izquierda
 * repite el glifo de la barra lateral —el mismo degradado— para que se lea
 * "esto eres tú"; el de la derecha es una burbuja de conversación. El trazo
 * discontinuo entre ambos avanza: está intentándolo, aún no ha llegado.
 *
 * Todo en tokens del sistema y sin texto dentro del SVG, así que no hay nada
 * que traducir ni que se descuadre con otra tipografía. `aria-hidden`: es
 * decoración, el mensaje ya está en el título.
 */
function Ilustracion(): JSX.Element {
  return (
    <div className="relative mx-auto mb-7 h-[104px] w-full max-w-[300px]">
      <span
        className="absolute inset-0 -z-10 blur-2xl"
        style={{ background: 'radial-gradient(ellipse at center, var(--brand-glow), transparent 65%)' }}
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 300 104"
        className="float-y h-full w-full"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="wf-marca" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--ai)" />
          </linearGradient>
        </defs>

        {/* Enlace: por debajo de las dos piezas, para que nazca de sus bordes. */}
        <path
          d="M104 52 H196"
          stroke="var(--line-strong)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="6 7"
        />
        <path
          d="M104 52 H196"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="6 7"
          className="rail-enlace"
        />

        {/* Izquierda: la marca, con el degradado de la barra lateral. */}
        <rect x="26" y="14" width="76" height="76" rx="22" fill="url(#wf-marca)" />
        <path
          d="M48 42 L54 66 L64 48 L74 66 L80 42"
          stroke="var(--on-brand)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Derecha: la conversación que todavía no llega. Contorno y no relleno:
            está por ocurrir. */}
        <rect
          x="198"
          y="14"
          width="76"
          height="76"
          rx="22"
          fill="var(--surface)"
          stroke="var(--line-strong)"
          strokeWidth="2"
        />
        <path
          d="M220 40 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-16 l-10 8 v-8 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 z"
          fill="var(--brand-tint)"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Los tres pasos, sin salir del panel.
 *
 * No enlaza a ninguna ayuda externa a propósito: no existe todavía, y un botón
 * que lleva a una página en blanco es peor que no tenerlo.
 */
function ComoFunciona({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const pasos = [
    {
      titulo: 'Vincula tu WhatsApp',
      texto:
        'En Canales pulsas «Conectar WhatsApp» y aparece un código QR. Lo escaneas desde el teléfono del negocio, en Ajustes → Dispositivos vinculados.',
    },
    {
      titulo: 'Los mensajes entran solos',
      texto:
        'Desde ese momento, cada cliente que escriba a tu número aparece aquí en el acto, con su ficha de contacto y su historial.',
    },
    {
      titulo: 'Responde desde aquí',
      texto:
        'Tu equipo contesta desde la bandeja y el cliente lo recibe en su WhatsApp de siempre. El agente de IA puede encargarse primero y pasarte la conversación cuando haga falta.',
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cómo funciona"
      description="Tres pasos, una sola vez."
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Entendido
        </Button>
      }
    >
      <ol className="space-y-4">
        {pasos.map((paso, i) => (
          <li key={paso.titulo} className="flex gap-3.5">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-tint text-[12.5px] font-bold text-brand">
              {i + 1}
            </span>
            <div>
              <div className="text-[14px] font-semibold text-ink">{paso.titulo}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{paso.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
