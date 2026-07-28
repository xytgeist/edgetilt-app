import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Isolated single-file build for LiveKit RoomComposite Chrome.
 * Must not share chunks with the main app (shared "general" chunks were a crash risk in headless).
 */
export default defineConfig({
  plugins: [react()],
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
