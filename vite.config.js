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
      transformIndexHtml(html) {
        const sha = process.env.VITE_BUILD_SHA || 'local'
        return html.replace(
          '<title>Edge</title>',
          `<title>Edge</title>\n    <meta name="edge-build-sha" content="${sha}" />`,
        )
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve('index.html'),
        slotGuideForm: path.resolve('slot-guide-form.html'),
      },
    },
  },
})