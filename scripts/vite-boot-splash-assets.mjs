import fs from 'node:fs'
import path from 'node:path'

const BOOT_DIR = path.resolve('public/boot')
const WASM_SRC = path.resolve('node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm')
const SPLASH_DARK = path.resolve('src/assets/lottie/edge-splash-v2.json')
const SPLASH_LIGHT = path.resolve('src/assets/lottie/edge-splash-v2-light.json')

/** Copy DotLottie WASM + splash JSON to stable `/boot/*` URLs for HTML preload. */
export function syncBootSplashAssets() {
  if (!fs.existsSync(WASM_SRC) || !fs.existsSync(SPLASH_DARK) || !fs.existsSync(SPLASH_LIGHT)) {
    console.warn('[boot-splash] skip copy (wasm or JSON missing)')
    return
  }
  fs.mkdirSync(BOOT_DIR, { recursive: true })
  fs.copyFileSync(WASM_SRC, path.join(BOOT_DIR, 'dotlottie-player.wasm'))
  fs.copyFileSync(SPLASH_DARK, path.join(BOOT_DIR, 'edge-splash-v2.json'))
  fs.copyFileSync(SPLASH_LIGHT, path.join(BOOT_DIR, 'edge-splash-v2-light.json'))
}

export function viteBootSplashAssetsPlugin() {
  return {
    name: 'edge-boot-splash-assets',
    buildStart() {
      syncBootSplashAssets()
    },
    configureServer() {
      syncBootSplashAssets()
    },
  }
}
