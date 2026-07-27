// `defineConfig` de vitest/config y no de vite: es el mismo objeto de
// configuración más la sección `test`, que Vite por sí solo no tipa.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Proxy de desarrollo: en `npm run dev` (Vite en :5173) las llamadas a la API
// se reenvían al backend NestJS real (:3000), igual que en producción donde
// Nest sirve este build y responde a las mismas rutas desde el mismo origen.
const API_PREFIXES = [
  '/auth',
  '/contacts',
  '/conversations',
  '/appointments',
  '/reminders',
  '/metrics',
  '/users',
  '/quick-replies',
  '/webhooks',
  '/health',
  '/integrations',
  '/business-profile',
  '/knowledge',
  '/ai-context',
  '/products',
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  test: {
    // jsdom porque parte de lo que se prueba habla con el navegador
    // (`sessionStorage`); las funciones puras no lo necesitan, pero tener un
    // solo entorno evita configurar cada archivo por separado.
    environment: 'jsdom',
    // `.tsx` además de `.ts`: las pruebas de componente necesitan JSX.
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: 'http://localhost:3000', changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 'hidden' sigue generando los .map (sirven para leer una traza real de un
    // error de producción) pero quita el comentario `sourceMappingURL` del
    // bundle: abrir las DevTools ya no ofrece el código fuente del panel
    // reconstruido y navegable. No es un secreto perfecto —el .map sigue
    // subido, con su nombre con hash— pero deja de estar señalizado.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Las librerías cambian mucho menos que el panel. Separándolas, publicar
        // una corrección invalida el chunk de la aplicación y deja intactos los
        // de React, Framer Motion y Radix, que el navegador ya tiene en caché.
        // Recharts no se toca: ya sale aparte por el `lazy()` de Métricas, y los
        // iconos de Lucide tampoco, que se reparten solos por ruta.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
          ],
        },
      },
    },
  },
});
