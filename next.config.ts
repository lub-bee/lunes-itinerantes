import type { NextConfig } from 'next'

const config: NextConfig = {
  // The grimoire reads content/ at render time (ISR when the catalogue comes from a sheet).
  outputFileTracingIncludes: { '/': ['./content/**/*', './node_modules/@iconify-json/game-icons/icons.json'] },
  poweredByHeader: false,
  // Textures never change between deploys: a week fresh, a month served stale while revalidating.
  async headers() {
    return [{ source: '/textures/:fichier*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }] }]
  },
}

export default config
