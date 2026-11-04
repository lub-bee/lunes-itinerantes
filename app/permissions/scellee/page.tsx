import type { Metadata } from 'next'
import Link from 'next/link'

// What anyone but a tester reads at /permissions (the middleware rewrites to this page with a 403).

export const metadata: Metadata = { title: 'Page scellée', robots: { index: false, follow: false } }

export default function PageScellee() {
  return (
    <main className="egare">
      <h1>Page scellée</h1>
      <p>Un cachet de cire noire ferme cette page du grimoire. Khajiit n’a pas la patte qui le brise, et toi non plus, ami.</p>
      <Link href="/">Revenir au grimoire</Link>
    </main>
  )
}
