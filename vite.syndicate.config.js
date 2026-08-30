import path from 'node:path'
import { copyFileSync, existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'syndicate-index-html-copy',
      closeBundle() {
        const src = path.resolve('dist-syndicate/syndicate.html')
        const dest = path.resolve('dist-syndicate/index.html')
        if (existsSync(src)) {
          copyFileSync(src, dest)
        }
      },
    },
  ],
  build: {
    outDir: 'dist-syndicate',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve('syndicate.html'),
      },
    },
  },
})
