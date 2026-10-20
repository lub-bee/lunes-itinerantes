import Grimoire from '@/components/Grimoire'
import { chargerLivre } from '@/lib/livre'

// Re-read the catalogue every 5 minutes (only matters when it comes from a published sheet).
export const revalidate = 300

export default async function Accueil() {
  return <Grimoire livre={await chargerLivre()} />
}
