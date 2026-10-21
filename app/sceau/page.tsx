import Sceau from '@/components/Sceau'
import { discordConfigure, motDePasseAccepte } from '@/lib/sceau'

export const metadata = { title: 'Le sceau de la caravane' }

// Read at request time: which ways in are open depends on the environment.
export const dynamic = 'force-dynamic'

export default function PageSceau() {
  return <Sceau discord={discordConfigure()} motDePasse={motDePasseAccepte() || !discordConfigure()} />
}
