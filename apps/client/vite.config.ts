import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root for every app. Only VITE_* keys reach the bundle.
  envDir: '../..',
  server: { port: 5173 },
});
