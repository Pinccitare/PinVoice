import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'PinVoice — Assistente Clínico por Voz',
        short_name: 'PinVoice',
        description: 'Captura clínica por voz ultra-rápida, offline-first e efêmera.',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
  },
});
