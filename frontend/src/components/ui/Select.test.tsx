import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Select } from './Input';

// La limpieza automática de Testing Library depende de `globals`, que esta
// configuración de Vitest no activa. Sin esto los renders se acumulan en el
// documento y cada prueba mira el componente de la anterior.
afterEach(cleanup);

/**
 * Lo que se prueba aquí es la traducción entre la API de siempre (`value` y
 * `<option>`, como un `<select>` nativo) y lo que Radix necesita por dentro.
 * Esa traducción es la única parte que el rediseño pudo romper en silencio: si
 * falla, el campo pinta la opción equivocada sin que nada avise.
 *
 * No se abre el desplegable a propósito: Radix lo mueve a un portal y responde
 * a eventos de puntero que jsdom no simula con fidelidad, así que una prueba
 * así comprobaría más el entorno que el componente.
 *
 * Se busca por clase y no por rol ni por etiqueta porque Radix, además del
 * botón visible, deja un `<select>` oculto para que el campo siga funcionando
 * dentro de un formulario. Ese duplicado comparte rol `combobox` y etiqueta, así
 * que cualquier búsqueda semántica devuelve los dos; `.wf-select` señala sin
 * ambigüedad el que ve el usuario.
 */
function disparador(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.wf-select');
  if (!el) throw new Error('No se encontró el disparador del Select');
  return el;
}

describe('Select', () => {
  it('muestra la etiqueta de la opción elegida, no su valor', () => {
    render(
      <Select value="OPEN" aria-label="Estado">
        <option value="">Todas</option>
        <option value="OPEN">Abiertas</option>
        <option value="CLOSED">Cerradas</option>
      </Select>,
    );

    expect(disparador().textContent).toContain('Abiertas');
  });

  // Radix reserva la cadena vacía y lanza si un elemento la usa. Los filtros de
  // la bandeja sí la usan con significado ("Todas"), de ahí el sustituto interno.
  it('admite la cadena vacía como valor con significado propio', () => {
    render(
      <Select value="" aria-label="Estado">
        <option value="">Todas</option>
        <option value="OPEN">Abiertas</option>
      </Select>,
    );

    expect(disparador().textContent).toContain('Todas');
  });

  // Métricas pasa números (7, 30, 90); un `<select>` nativo los volvía cadena
  // por su cuenta y Radix no.
  it('acepta valores numéricos', () => {
    render(
      <Select value={30} aria-label="Período">
        <option value={7}>Últimos 7 días</option>
        <option value={30}>Últimos 30 días</option>
      </Select>,
    );

    expect(disparador().textContent).toContain('Últimos 30 días');
  });

  it('cae en el placeholder si ninguna opción coincide', () => {
    render(
      <Select value="INEXISTENTE" placeholder="Elige una" aria-label="Rol">
        <option value="OWNER">Propietario</option>
      </Select>,
    );

    expect(disparador().textContent).toContain('Elige una');
  });

  it('deshabilita el campo cuando se le pide', () => {
    render(
      <Select value="OWNER" disabled aria-label="Rol">
        <option value="OWNER">Propietario</option>
      </Select>,
    );

    expect(disparador().hasAttribute('disabled')).toBe(true);
  });

  it('muestra el error debajo y marca el campo como inválido', () => {
    render(
      <Select value="" error="Elige un rol" aria-label="Rol">
        <option value="">Sin elegir</option>
      </Select>,
    );

    expect(screen.getByText('Elige un rol')).toBeTruthy();
    expect(disparador().getAttribute('aria-invalid')).toBe('true');
  });

  it('sin error no marca nada como inválido', () => {
    render(
      <Select value="OWNER" aria-label="Rol">
        <option value="OWNER">Propietario</option>
      </Select>,
    );

    expect(disparador().getAttribute('aria-invalid')).toBeNull();
  });
});
