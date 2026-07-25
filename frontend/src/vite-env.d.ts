/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen de la API cuando no hay proxy de por medio (build de producción, backend en otro dominio). Vacío = ruta relativa. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
