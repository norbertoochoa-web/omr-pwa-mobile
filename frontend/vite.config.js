import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'OMR PWA Mobile',
        short_name: 'OMR',
        description: 'Captura de cartillas OMR desde dispositivos móviles',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],

  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
    https: true,
    hmr: {
      protocol: 'wss',
      host: '0.0.0.0',
    },
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
