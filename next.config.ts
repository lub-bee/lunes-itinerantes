import type { NextConfig } from 'next'

const config: NextConfig = {
  // The grimoire reads content/ at render time (ISR when the catalogue comes from a sheet).
  outputFileTracingIncludes: { '/': ['./content/**/*'] },
  poweredByHeader: false,
}

export default config
