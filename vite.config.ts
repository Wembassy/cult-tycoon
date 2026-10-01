import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '@engine': resolve(import.meta.dirname, 'src/engine'),
      '@ecs': resolve(import.meta.dirname, 'src/ecs'),
      '@components': resolve(import.meta.dirname, 'src/components'),
      '@systems': resolve(import.meta.dirname, 'src/systems'),
      '@world': resolve(import.meta.dirname, 'src/world'),
      '@ui': resolve(import.meta.dirname, 'src/ui'),
      '@utils': resolve(import.meta.dirname, 'src/utils'),
      '@types': resolve(import.meta.dirname, 'src/types'),
      '@data': resolve(import.meta.dirname, 'src/data'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    open: true,
    port: 3000,
    allowedHosts: ['cult.pixagame.com', 'localhost'],
    host: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.ts'],
  },
});