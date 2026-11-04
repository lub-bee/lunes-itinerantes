import type { Metadata } from 'next'
import Link from 'next/link'
import Permissions from '@/components/Permissions'

// The secret page of the permissions (lib/droits.ts): not in the book, reachable by its address only. The
// middleware lets only testers in (TESTEURS_DISCORD_IDS); anyone else reads /permissions/scellee, answered 403.

export const metadata: Metadata = { title: 'Le registre des permissions', robots: { index: false, follow: false } }

export const dynamic = 'force-dynamic'

export default function PagePermissions() {
  return (
    <main className="perm">
      <nav className="perm-retour">
        <Link href="/">❧ Retourner au grimoire</Link>
      </nav>
      <article className="perm-feuille">
        <header className="perm-tete">
          <div className="perm-surtitre">Page secrète du grimoire</div>
          <h1>Le registre des permissions</h1>
          <div className="perm-sous-titre">The Caravan’s Permissions</div>
        </header>
        <p className="perm-intro">
          Chaque case cochée ouvre un geste à un rôle. « Tout membre » l’ouvre à quiconque a signé le registre, rang ou pas. Un rôle sans case cochée n’a aucun geste réservé. Les livres des Marchandises, des Recettes, des Missives et de la
          Caravane restent ouverts à tous : seuls les gestes se règlent, et l’ouverture des livres de l’Intendance et du Trésor.
        </p>
        <Permissions />
      </article>
    </main>
  )
}
