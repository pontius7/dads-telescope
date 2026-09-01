import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: "Dad's Telescope",
        short_name: 'Telescope',
        description:
          'What is worth observing tonight with an 8" Dobsonian, and exactly which eyepiece to use.',
        theme_color: '#05070c',
        background_color: '#05070c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Weather is deliberately NEVER precached or served stale-as-current.
        // The app must show "Weather unavailable" rather than imply freshness.
        navigateFallback: '/index.html',
        // The news endpoint is not a page and must never be answered from the
        // precache — offline it should fail, so the screen can say so.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Both hosts, because 46 of the 59 verified images live on
            // wikimedia and only 13 on NASA. Caching NASA alone left most of
            // the detail-card photographs failing offline.
            urlPattern: /^https:\/\/(images-assets\.nasa\.gov|upload\.wikimedia\.org|thumb\.wikimedia\.org)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'astro-imagery',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
  // `/api/news` lives in the Worker, not in Vite. Point the dev server at
  // `wrangler dev` so the News screen works the same way locally as deployed.
  server: {
    proxy: { '/api': 'http://localhost:8788' },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the 3D stack out of the main chunk.
         *
         * Three.js is ~85% of this bundle. Keeping it separate means the UI
         * shell, the catalogue and the domain logic download and parse first,
         * so the sheet is usable while the renderer is still arriving — which
         * matters on cellular, where the whole thing was one 353 KB gzipped
         * blob before.
         */
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          astronomy: ['astronomy-engine'],
        },
      },
    },
    // The 3D chunk is legitimately large; warn above that rather than on every build.
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
