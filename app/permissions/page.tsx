import type { Metadata } from 'next'
import Link from 'next/link'
import Permissions from '@/components/Permissions'
import { ChoixQualite } from '@/components/Qualite'

// The secret page of the permissions (lib/droits.ts, the Grimoire's rows of the shared tab): not in the book, reachable by its address only. The
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
          Chaque case cochée ouvre un geste à un rang, entrer dans le grimoire compris. Sans le rang « Membre », nul n’entre ni n’agit ; avec lui, chacun tient les gestes de tous ses rangs réunis. Une case décochée, une ligne ou une colonne
          absente : le geste reste fermé. Seules les lignes « Grimoire » de l’onglet « Permissions » se règlent ici ; celles de la Table n’y paraissent pas.
        </p>
        <Permissions />
        <ChoixQualite />
      </article>
    </main>
  )
}
