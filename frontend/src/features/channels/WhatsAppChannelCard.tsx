import { MessageSquare, QrCode, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useRealtime } from '@/lib/use-realtime';
import { Button } from '@/components/ui/Button';
import type { ChannelStatus } from '@/lib/types';

/**
 * Cada cuánto se vuelve a preguntar por el estado mientras hay un QR en
 * pantalla. El backend aprovecha esa consulta para comprobar si ya se escaneó y
 * para renovar el código caducado, así que este sondeo es lo que hace que la
 * pantalla avance sola aunque el proveedor no consiga alcanzar al servidor con
 * sus avisos (el caso normal en desarrollo).
 */
const SONDEO_MS = 4000;

/** Formatea 51987654321 como +51 987 654 321 — legible de un vistazo. */
function formatearNumero(numero: string): string {
  const digitos = numero.replace(/\D/g, '');
  if (digitos.length < 8) return `+${digitos}`;
  const pais = digitos.slice(0, digitos.length - 9) || digitos.slice(0, 2);
  const resto = digitos.slice(pais.length);
  return `+${pais} ${resto.replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim();
}

/**
 * El WhatsApp del negocio: estado, vinculación y baja.
 *
 * La pantalla no sabe qué proveedor hay detrás. Con Evolution se vincula
 * escaneando un QR; con la API oficial de Meta el número se da de alta fuera del
 * panel, y por eso el bloque del QR depende de `vinculaConQr` y no del nombre
 * del proveedor: cuando se migre, esta tarjeta ya está preparada.
 */
export function WhatsAppChannelCard(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const [estado, setEstado] = useState<ChannelStatus | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const esPropietario = user?.role === 'OWNER';

  const cargar = useCallback(async (): Promise<void> => {
    try {
      setEstado(await api<ChannelStatus>('/channels/whatsapp'));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo consultar WhatsApp', 'error');
    }
    // `toast` es estable (viene del contexto); no hace falta como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El backend avisa en cuanto el teléfono termina de vincularse, así que la
  // pantalla salta a "Conectado" sin esperar al siguiente sondeo.
  useRealtime(
    useCallback(
      (evento) => {
        if (evento.tipo === 'canal') void cargar();
      },
      [cargar],
    ),
  );

  // Mientras se espera el escaneo se pregunta cada pocos segundos: además de
  // detectar la conexión, es lo que renueva el QR antes de que caduque.
  const esperandoEscaneo = estado?.status === 'QR_PENDING';
  useEffect(() => {
    if (!esperandoEscaneo) return;
    const id = setInterval(() => void cargar(), SONDEO_MS);
    return () => clearInterval(id);
  }, [esperandoEscaneo, cargar]);

  async function accionar(
    peticion: () => Promise<ChannelStatus>,
    exito: string,
  ): Promise<void> {
    setOcupado(true);
    try {
      setEstado(await peticion());
      toast.show(exito);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo completar la acción', 'error');
    } finally {
      setOcupado(false);
    }
  }

  const conectar = (): Promise<void> =>
    accionar(
      () => api<ChannelStatus>('/channels/whatsapp/connect', { method: 'POST' }),
      'Escanea el código con WhatsApp',
    );

  const reconectar = (): Promise<void> =>
    accionar(
      () => api<ChannelStatus>('/channels/whatsapp/reconnect', { method: 'POST' }),
      'Escanea el código de nuevo',
    );

  const desconectar = (): Promise<void> =>
    accionar(
      () => api<ChannelStatus>('/channels/whatsapp', { method: 'DELETE' }),
      'WhatsApp desconectado',
    );

  const conectado = estado?.status === 'CONNECTED';
  const conProblema = estado?.status === 'ERROR' || (!!estado && !estado.configurado);

  return (
    <div className="kpi-card">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-sm ${
            conProblema ? 'bg-danger-tint text-danger' : 'bg-brand-tint text-brand'
          }`}
        >
          {conProblema ? (
            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <MessageSquare size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </div>

        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold">
            WhatsApp
            <EstadoDelCanal estado={estado} />
          </div>
          <p className="text-[13px] text-ink-soft">
            <Explicacion estado={estado} esPropietario={esPropietario} />
          </p>
          {conectado && estado?.phoneNumber && (
            <div className="mt-1 font-mono text-[13px] text-ink">
              {formatearNumero(estado.phoneNumber)}
            </div>
          )}
        </div>

        {esPropietario && estado?.configurado && (
          <div className="flex flex-wrap gap-2">
            {conectado || esperandoEscaneo ? (
              <>
                <Button variant="sec" disabled={ocupado} onClick={reconectar}>
                  Reconectar
                </Button>
                <Button variant="danger" disabled={ocupado} onClick={desconectar}>
                  Desconectar
                </Button>
              </>
            ) : (
              <Button variant="brand" disabled={ocupado} onClick={conectar}>
                Conectar WhatsApp
              </Button>
            )}
          </div>
        )}
      </div>

      {esperandoEscaneo && estado?.vinculaConQr && (
        <PanelDeVinculacion qr={estado.qrCode} />
      )}

      {estado?.status === 'ERROR' && estado.lastError && (
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-faint">
          Último aviso del servicio: {estado.lastError}
        </p>
      )}
    </div>
  );
}

/** Punto de color + etiqueta. Nunca solo color: también cambia el texto. */
function EstadoDelCanal({ estado }: { estado: ChannelStatus | null }): JSX.Element | null {
  if (!estado) return null;
  const mapa: Record<ChannelStatus['status'], { texto: string; clase: string }> = {
    CONNECTED: { texto: 'Conectado', clase: 'bg-brand-tint text-brand' },
    QR_PENDING: { texto: 'Esperando escaneo', clase: 'bg-warn-tint text-warn' },
    DISCONNECTED: { texto: 'Desconectado', clase: 'bg-[var(--muted-bg)] text-ink-soft' },
    ERROR: { texto: 'Con problemas', clase: 'bg-danger-tint text-danger' },
  };
  const { texto, clase } = mapa[estado.status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide ${clase}`}
    >
      {texto}
    </span>
  );
}

function Explicacion({
  estado,
  esPropietario,
}: {
  estado: ChannelStatus | null;
  esPropietario: boolean;
}): JSX.Element {
  if (!estado) return <>Consultando el estado del canal…</>;
  if (!estado.configurado) {
    return <>El servidor todavía no tiene configurado el servicio de WhatsApp.</>;
  }
  switch (estado.status) {
    case 'CONNECTED':
      return <>Los mensajes llegan a la Bandeja y las respuestas salen por este número.</>;
    case 'QR_PENDING':
      return <>Abre WhatsApp en el teléfono del negocio y escanea el código.</>;
    case 'ERROR':
      return <>La sesión se interrumpió. Vuelve a vincular el teléfono para seguir recibiendo mensajes.</>;
    default:
      return esPropietario ? (
        <>Vincula el WhatsApp del negocio para empezar a recibir mensajes en la Bandeja.</>
      ) : (
        <>Todavía no hay ningún número vinculado. Pídeselo al propietario de la cuenta.</>
      );
  }
}

/**
 * El código de vinculación.
 *
 * El QR llega ya dibujado desde el servicio (una imagen en base64), así que no
 * hace falta ninguna librería para generarlo en el navegador.
 */
function PanelDeVinculacion({ qr }: { qr: string | null }): JSX.Element {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-line pt-4">
      <div className="grid h-[212px] w-[212px] place-items-center rounded-sm bg-white p-2">
        {qr ? (
          // Fondo blanco fijo y no un token: un QR sobre fondo oscuro no lo lee
          // ninguna cámara. Es una restricción del formato, no una decisión
          // de estilo, y por eso se sale del modo oscuro del panel.
          <img src={qr} alt="Código QR para vincular WhatsApp" className="h-full w-full object-contain" />
        ) : (
          <QrCode size={40} strokeWidth={1.5} className="text-[#052a1d]" aria-hidden="true" />
        )}
      </div>
      <ol className="min-w-[220px] flex-1 space-y-1.5 text-[13px] text-ink-soft">
        <li>1. Abre WhatsApp en el teléfono del negocio.</li>
        <li>2. Entra en Ajustes → Dispositivos vinculados.</li>
        <li>3. Toca «Vincular un dispositivo» y apunta a este código.</li>
        <li className="pt-1 text-[12.5px] text-ink-faint">
          El código se renueva solo cada pocos segundos; no hace falta recargar.
        </li>
      </ol>
    </div>
  );
}
