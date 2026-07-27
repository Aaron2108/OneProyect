export function RosterSkeleton(): JSX.Element {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-line px-4 py-3">
          <div className="sk-shimmer h-10 w-10 flex-shrink-0 rounded-[12px]" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="sk-shimmer h-2.5 w-[55%] rounded-md" />
            <div className="sk-shimmer h-2.5 w-[35%] rounded-md" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Relleno mientras se descarga el chunk de una ruta perezosa.
 *
 * Neutro a propósito: lo ve cualquier sección, así que no imita ninguna en
 * concreto. `aria-hidden` porque son bloques decorativos: quien navega con
 * lector de pantalla no gana nada oyéndolos descritos.
 */
export function PageSkeleton(): JSX.Element {
  return (
    <div className="mx-auto max-w-[920px] p-6 sm:p-10" aria-hidden="true">
      <div className="sk-shimmer mb-3 h-6 w-[220px] rounded-md" />
      <div className="sk-shimmer mb-8 h-3.5 w-[320px] max-w-full rounded-md" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="sk-shimmer h-[92px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function KpiSkeleton(): JSX.Element {
  return (
    <div className="rounded bg-surface p-4 shadow-1">
      <div className="sk-shimmer h-3 w-2/3 rounded-md" />
      <div className="sk-shimmer mt-3 h-8 w-1/2 rounded-md" />
    </div>
  );
}
