// Sin iconos de marca: Lucide los retiró en la versión 1. Se usan glifos
// genéricos, que además encajan con el resto del panel (todo es Lucide).
import { Camera, Mail, MessageCircle, Send, type LucideIcon } from 'lucide-react';
import { WhatsAppChannelCard } from './WhatsAppChannelCard';

/**
 * Por dónde habla el negocio con sus clientes.
 *
 * Hoy solo hay WhatsApp, y aun así la sección existe aparte de la Bandeja: la
 * Bandeja es donde se atienden conversaciones, y mezclar ahí la gestión de
 * conexiones obligaría a rediseñarla en cuanto entre el segundo canal. Los
 * "próximamente" no son decorado — dicen a qué aspira esto y evitan que alguien
 * busque Instagram por el resto del panel.
 */
const PROXIMOS: Array<{ nombre: string; icono: LucideIcon; nota: string }> = [
  { nombre: 'Instagram', icono: Camera, nota: 'Mensajes directos de la cuenta del negocio.' },
  { nombre: 'Messenger', icono: MessageCircle, nota: 'Conversaciones desde la página de Facebook.' },
  { nombre: 'Telegram', icono: Send, nota: 'Para clientes que no usan WhatsApp.' },
  { nombre: 'Email', icono: Mail, nota: 'Consultas por correo, en la misma bandeja.' },
];

export function ChannelsPage(): JSX.Element {
  return (
    <div className="p-6">
      <p className="mb-5 max-w-[62ch] text-[13.5px] text-ink-soft">
        Los canales por los que entran las conversaciones. Lo que se conecte aquí aparece
        automáticamente en la Bandeja.
      </p>

      <WhatsAppChannelCard />

      <h2 className="mb-3 mt-8 text-[11px] font-bold uppercase tracking-wide text-ink-disabled">
        Próximamente
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROXIMOS.map(({ nombre, icono: Icono, nota }) => (
          // `aria-disabled` y no `disabled`: no son controles, son tarjetas
          // informativas. Se atenúan, pero su texto sigue siendo legible.
          <div key={nombre} className="kpi-card opacity-60" aria-disabled="true">
            <div className="mb-2 grid h-9 w-9 place-items-center rounded-sm bg-[var(--muted-bg)] text-ink-soft">
              <Icono size={17} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="text-[14px] font-semibold">{nombre}</div>
            <p className="mt-0.5 text-[12.5px] text-ink-faint">{nota}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
