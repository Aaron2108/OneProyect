import {
  Bot,
  Calendar,
  Contact,
  LayoutGrid,
  MessageSquare,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Las secciones del panel, cada una con su URL.
 *
 * Antes eran pestañas guardadas en un `useState`: no se podía enlazar una
 * sección, el botón "atrás" del navegador no hacía nada y al recargar siempre
 * se volvía a Bandeja. Las rutas van en español porque son visibles para el
 * usuario, igual que el resto de la interfaz.
 *
 * En su propio módulo porque las usan tanto el carril (para pintarlas) como el
 * armazón (para el título de la barra superior), y tenerlas en cualquiera de
 * los dos dejaría al otro importando de quien lo importa.
 */
export const SECCIONES: Array<{ path: string; label: string; icon: LucideIcon }> = [
  { path: '/bandeja', label: 'Bandeja', icon: MessageSquare },
  { path: '/metricas', label: 'Métricas', icon: LayoutGrid },
  { path: '/contactos', label: 'Contactos', icon: Contact },
  { path: '/calendario', label: 'Calendario', icon: Calendar },
  { path: '/productos', label: 'Productos', icon: Package },
  { path: '/agente', label: 'Agente IA', icon: Bot },
  { path: '/equipo', label: 'Equipo', icon: Users },
];
