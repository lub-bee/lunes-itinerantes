import type { Metadata } from 'next'
import Copie from '@/components/Copie'
import { TITRE_COPIE } from '@/lib/copie'
import { chargerLivre } from '@/lib/livre'

// Same data source and refresh rate as the grimoire, so the copy always matches the current prices.
export const revalidate = 300

export const metadata: Metadata = { title: TITRE_COPIE }

export default async function PageCopie() {
  return <Copie livre={await chargerLivre()} />
}
