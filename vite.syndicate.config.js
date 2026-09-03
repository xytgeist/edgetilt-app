import path from 'node:path'
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
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
        // SPA fallback only. Do NOT list bare paths like `/ops /index.html 200` —
        // on this Pages project those rewrite lines 308 the path to `/`.
        writeFileSync(
          path.resolve('dist-syndicate/_redirects'),
          ['/* /index.html 200', ''].join('\n'),
        )
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
