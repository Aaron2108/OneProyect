import { TriangleAlert } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  /**
   * Cuando este valor cambia, un error ya mostrado se descarta y se vuelve a
   * intentar renderizar. Se usa con la ruta actual: si una pantalla revienta,
   * navegar a otra sección debe devolver el panel a un estado usable en vez de
   * dejar el fallback pegado hasta recargar.
   */
  claveReinicio?: string;
}

interface State {
  error: Error | null;
}

/**
 * Frontera de error de React.
 *
 * Sin esto, cualquier excepción durante el render desmonta el árbol entero y
 * deja la pantalla en blanco: el usuario no ve ni el error ni la navegación, y
 * la única salida es recargar sin saber por qué. El caso más frecuente no es
 * siquiera un fallo del código: tras un despliegue, un `lazy()` cuyo chunk ya no
 * existe con ese hash falla al importarse y tira toda la aplicación. Por eso el
 * fallback ofrece recargar — es lo único que trae el bundle nuevo.
 *
 * Tiene que ser una clase: React 18 no expone `getDerivedStateFromError` ni
 * `componentDidCatch` como hooks, así que no hay versión con función. No se
 * registra el error a mano porque React ya lo escribe en la consola con el árbol
 * donde ocurrió; el día que haya un servicio de errores, su sitio es
 * `componentDidCatch`.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props): void {
    // Se limpia por comparación en vez de con `key` en el padre: un `key` que
    // cambia con la ruta remontaría también el árbol sano en cada navegación, y
    // la bandeja perdería su lista al abrir una conversación (la conversación
    // abierta va en la URL).
    if (this.state.error && prev.claveReinicio !== this.props.claveReinicio) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid h-full place-items-center p-6">
        <div className="kpi-card max-w-[420px] text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-danger-tint text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <h2 className="mb-1.5 font-display text-lg font-bold text-ink">Esta pantalla no se pudo mostrar</h2>
          <p className="mb-5 text-sm text-ink-soft">
            Algo falló al dibujarla. Recargar suele bastar — sobre todo si acabamos de publicar una
            versión nueva del panel.
          </p>
          <Button variant="brand" onClick={() => window.location.reload()}>
            Recargar la página
          </Button>
        </div>
      </div>
    );
  }
}
