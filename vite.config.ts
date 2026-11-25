import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base relative : l'app marche à la racine d'un domaine comme dans un sous-dossier
// (ex. https://pseudo.github.io/zapette/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Envoie les cookies avec le manifeste : nécessaire si l'app est protégée par Cloudflare Access.
      useCredentials: true,
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Zapette — la télé gratuite',
        short_name: 'Zapette',
        description: 'Des milliers de chaînes gratuites vérifiées, films, séries et nouveautés.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#11161c',
        theme_color: '#11161c',
        categories: ['entertainment', 'video'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['data/**', 'playlists/**'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Catalogue : réseau d'abord (liste fraîche), cache si hors-ligne.
            urlPattern: ({ url }) => /\/data\/(channels\.json|channels\.enc|status\.json|manifest\.json)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'zapette-data',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 4 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: { host: true },
  preview: { host: true },
});
