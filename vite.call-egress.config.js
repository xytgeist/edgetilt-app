import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * Single-file build for LiveKit Chrome: vanilla JS (no React), no shared app chunks.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve('call-egress.html'),
      output: {
        codeSplitting: false,
        entryFileNames: 'assets/callEgress-[hash].js',
        assetFileNames: 'assets/callEgress-[hash][extname]',
      },
    },
  },
})
