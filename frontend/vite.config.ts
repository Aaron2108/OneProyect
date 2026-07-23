import { defineConfig } from 'vite';
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
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
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
    sourcemap: true,
  },
});
