import type { Metadata, Viewport } from 'next'
import { IM_Fell_English, IM_Fell_English_SC, Pinyon_Script, UnifrakturMaguntia } from 'next/font/google'
import './globals.css'

const gothique = UnifrakturMaguntia({ weight: '400', subsets: ['latin'], variable: '--font-gothique' })
const texte = IM_Fell_English({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-texte' })
const capitales = IM_Fell_English_SC({ weight: '400', subsets: ['latin'], variable: '--font-capitales' })
// A quill's hand, for the name signed on the ex-libris.
const plume = Pinyon_Script({ weight: '400', subsets: ['latin'], variable: '--font-plume' })

export const metadata: Metadata = {
  title: 'Grimoire de la Caravane',
  description: 'Registre des prix de la Caravane des Lunes Itinérantes.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#1a110b', width: 'device-width', initialScale: 1 }

export default function Racine({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${gothique.variable} ${texte.variable} ${capitales.variable} ${plume.variable}`}>
      <body>{children}</body>
    </html>
  )
}
