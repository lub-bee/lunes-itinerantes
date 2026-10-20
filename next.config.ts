import type { NextConfig } from 'next'

const config: NextConfig = {
  // The grimoire reads content/ at render time (ISR when the catalogue comes from a sheet).
  outputFileTracingIncludes: { '/': ['./content/**/*', './node_modules/@iconify-json/game-icons/icons.json'] },
  poweredByHeader: false,
}

export default config
