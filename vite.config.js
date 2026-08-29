import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function resolveBuildSha() {
  const vercelSha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim()
  if (vercelSha) return vercelSha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

process.env.VITE_BUILD_SHA = resolveBuildSha()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'edge-build-sha-meta',
      transformIndexHtml() {
        const sha = process.env.VITE_BUILD_SHA || 'local'
        return [
          {
            tag: 'meta',
            attrs: {
              name: 'edge-build-sha',
              content: sha,
            },
            injectTo: 'head',
          },
        ]
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve('index.html'),
        slotGuideForm: path.resolve('slot-guide-form.html'),
        // call-egress.html is built separately (vite.call-egress.config.js) as a
        // single-file bundle so LiveKit headless Chrome does not load shared app chunks.
      },
    },
  },
})