import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8789' },
    // Lets a phone reach the dev server through a Cloudflare quick tunnel.
    allowedHosts: ['.trycloudflare.com'],
  },
  test: { include: ['test/**/*.test.ts'] },
})
