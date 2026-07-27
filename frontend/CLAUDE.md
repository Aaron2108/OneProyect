# WhatsFlow AI — Frontend (Claude Code Configuration)

Esta carpeta contiene **únicamente el frontend** de WhatsFlow AI: el panel web desde el
que el equipo del negocio gestiona conversaciones de WhatsApp, citas, contactos,
métricas y la configuración del agente IA. Es un repositorio independiente del backend —
ver `/CLAUDE.md` (raíz del monorepo, mientras ambas carpetas conviven aquí) para el
panorama completo del producto.

**Regla explícita: si el usuario pide un cambio de backend (API, endpoints, NestJS,
base de datos, Prisma, autenticación, lógica del servidor), no modifiques nada dentro
de esta carpeta. Ese trabajo se hace en `/backend`.**

## Stack

React 18 + TypeScript + Vite · Tailwind CSS (variables CSS en `src/styles/tokens.css`
como fuente única de verdad del design system) · Radix UI (dialog, dropdown-menu,
popover, toast) · Framer Motion · Recharts · lucide-react (iconos) · `@formkit/auto-animate`.

## Instalación y ejecución

```bash
npm install
npm run dev          # http://localhost:5173, con proxy de /auth, /contacts, etc. hacia el backend en :3000
```

El backend debe estar corriendo por separado (`cd ../backend && npm run start:dev`).
`vite.config.ts` define el proxy de desarrollo por prefijo de ruta hacia
`http://localhost:3000`; en producción, si no hay proxy disponible, se usa
`VITE_API_URL` (ver `.env.example`) para apuntar al origen real de la API.

## Build

```bash
npm run build         # tsc --noEmit && vite build -> dist/
npm run lint
```

Este build ya **no lo sirve el backend** como estático — se despliega como sitio
independiente (hosting estático) que llama a la API por HTTP con CORS.

## Estructura

```
src/
├── components/
│   ├── layout/       # AppShell (sidebar + topbar + navegación)
│   └── ui/            # Button, Input, Dialog, Pill, Avatar, DropdownMenu, Popover, etc.
├── features/          # una carpeta por página: inbox, contacts, calendar, metrics, team, ai-agent, auth, integrations, account
├── lib/                # api.ts (cliente HTTP), auth-context, toast-context, types.ts
└── styles/             # tokens.css (variables del design system), components.css
```

## Reglas

- Hacer solo lo que se pide; ni más ni menos.
- Preferir editar un archivo existente antes que crear uno nuevo.
- No crear documentación nueva salvo que se pida explícitamente.
- Leer siempre un archivo antes de editarlo.
- Los colores, radios, sombras y duraciones se referencian como `var(--token)` en
  Tailwind (`tailwind.config.ts`) — nunca hardcodear hex ni valores sueltos en los
  componentes; se agregan/ajustan en `tokens.css`.
- Modo único oscuro (sin selector claro/oscuro) — decisión confirmada por el usuario.
- Iconos: solo Lucide, sin emoji (salvo los glifos geométricos de accesibilidad en `Pill.tsx`).
- No inventar datos que el backend no expone (tags, "última conexión", etc.) — usar solo
  lo que la API realmente devuelve.
