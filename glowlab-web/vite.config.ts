import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    commonjsOptions: { include: [/glowlab-shared/, /node_modules/] },
  },
  server: {
    proxy: { '/api': 'http://localhost:4200' },
  },
});
