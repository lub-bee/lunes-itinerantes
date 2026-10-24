import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { nomSigne } from '@/lib/identite'
import { chargerArticles } from '@/lib/livre'
import { oublierRegistre } from '@/lib/registre'
import { calculerLigne, centimes, poidsLigne, repartirGlobal, statut, totaux, uniteLigne, type CommandeEnvoyee } from '@/lib/commande'

// Seals an order: validates it, recomputes every total from the catalogue, and hands it to the
// Google Apps Script web app that writes it in the "Commandes" sheet (scripts/apps-script/commandes.gs).
// COMMANDES_SCRIPT_URL and COMMANDES_JETON stay on the server.

export const dynamic = 'force-dynamic'

const MAX_LIGNES = 200

const refus = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })

function numeroCommande(maintenant: Date): string {
  // JST calendar day: the caravan lives in Asia/Tokyo time.
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' })
    .format(maintenant)
    .replace(/-/g, '')
  const hasard = Array.from(crypto.getRandomValues(new Uint8Array(3)), (o) => o.toString(36).padStart(2, '0')).join('').toUpperCase()
  return `C-${jour}-${hasard.slice(0, 5)}`
}

export async function POST(req: NextRequest) {
  // The middleware already guards /api/*; checked again so the route never relies on it alone.
  const session = await lireSession(req.cookies)
  if (!session.valide) return refus('Le sceau de la caravane manque à cette commande.', 401)

  const url = process.env.COMMANDES_SCRIPT_URL
  const secret = process.env.COMMANDES_JETON
  if (!url || !secret) return refus("Aucun coursier n'attend à la porte : le registre des commandes n'est pas encore relié.", 503)

  const corps = (await req.json().catch(() => null)) as Partial<CommandeEnvoyee> | null
  // A Discord member signs with their own name; a member who signed with their name (validated
  // against the Membres tab, signed cookie) with that one; otherwise the name typed on the sheet.
  const signe = session.genre === 'discord' ? null : await nomSigne(req.cookies)
  const vendeur =
    session.genre === 'discord' ? session.membre.nom : signe ?? (typeof corps?.vendeur === 'string' ? corps.vendeur.trim().slice(0, 80) : '')
  if (!vendeur) return refus('Qui tient la plume ? Le nom du vendeur manque.', 400)
  const brutes = Array.isArray(corps?.lignes) ? corps.lignes : []
  if (!brutes.length) return refus('Une commande sans article ne se scelle pas.', 400)
  if (brutes.length > MAX_LIGNES) return refus('Trop de lignes pour un seul parchemin.', 400)

  // Floor and ceiling come from the catalogue when the article is still in it.
  const catalogue = new Map((await chargerArticles()).map((a) => [a.id, a]))
  const lignes = []
  for (const b of brutes) {
    const quantite = Number(b?.quantite)
    const prixUnitaire = Number(b?.prixUnitaire)
    const article = typeof b?.article === 'string' ? b.article.trim().slice(0, 160) : ''
    if (!article || !Number.isInteger(quantite) || quantite < 1 || quantite > 9999 || !Number.isFinite(prixUnitaire) || prixUnitaire < 0 || prixUnitaire > 1e7) {
      return refus(`Une ligne est mal écrite${article ? ` (${article})` : ''} : quantité ou prix illisible.`, 400)
    }
    // A line typed by hand (hors catalogue): no floor, no ceiling, so never « à perte ».
    const horsCatalogue = b.horsCatalogue === true
    const connu = !horsCatalogue && typeof b.id === 'string' ? catalogue.get(b.id) : undefined
    const nombreOuNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    // Sold by the piece of a lot (40 arrows of a quiver of 80): floor and ceiling prorated.
    const lot = connu?.lot ?? null
    const piece = Boolean(lot) && b.unite === 'piece'
    const parPiece = (v: number | null) => (v === null || !piece ? v : centimes(v / lot!))
    const min = horsCatalogue ? null : parPiece(connu ? connu.min : nombreOuNull(b.min))
    const max = horsCatalogue ? null : parPiece(connu ? connu.max : nombreOuNull(b.max))
    const nom = connu?.fr ?? article
    lignes.push({
      article: nom,
      articleEn: connu?.en ?? (typeof b.articleEn === 'string' ? b.articleEn.slice(0, 160) : ''),
      prixMini: min,
      prixIdeal: max,
      unite: uniteLigne(nom, lot, piece),
      horsCatalogue,
      ...calculerLigne(quantite, prixUnitaire, min, max),
    })
  }

  // A price agreed for the whole order: each line's real sale is its share, pro rata to its « total
  // idéal » (cents, the sum exact). Its unit price and total become that share, so a script that does
  // not know `prixGlobal` still writes the right « Prix réel vendu »; a newer one also writes « Prix global ».
  const global = typeof corps?.prixGlobal === 'number' && Number.isFinite(corps.prixGlobal) && corps.prixGlobal > 0 && corps.prixGlobal <= 1e8 ? centimes(corps.prixGlobal) : null
  if (global !== null) {
    const parts = repartirGlobal(global, lignes.map((l) => poidsLigne(l.quantite, l.prixMini, l.prixIdeal, l.prixUnitaire || null)))
    lignes.forEach((l, i) => {
      const part = parts[i]
      const negocie = l.prixMini === null && l.prixIdeal === null
      Object.assign(l, {
        prixUnitaire: centimes(part / l.quantite),
        total: part,
        totalMini: negocie ? part : l.totalMini,
        totalIdeal: negocie ? part : l.totalIdeal,
        statut: negocie ? 'négocié' : statut(part, l.totalMini, l.totalIdeal),
        sousPlancher: l.prixMini !== null && part / l.quantite < l.prixMini - 0.004,
        prixReel: part,
        prixGlobal: global,
      })
    })
  }
  const maintenant = new Date()
  const t = totaux(lignes)
  const commande = {
    numero: numeroCommande(maintenant),
    horodatage: maintenant.toISOString(),
    vendeur,
    ...t,
    ...(global !== null ? { total: global, statut: statut(global, t.totalMini, t.totalIdeal), prixGlobal: global } : {}),
    lignes,
  }

  try {
    // Apps Script answers a POST with a redirect to the result; fetch follows it.
    const rep = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: secret, commande }),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    const texte = await rep.text()
    let reponse: { ok?: boolean; erreur?: string } | null = null
    try {
      reponse = JSON.parse(texte)
    } catch {
      reponse = null
    }
    if (!rep.ok || !reponse?.ok) {
      console.error(`[commande] script refused ${commande.numero}: HTTP ${rep.status}`, reponse?.erreur ?? texte.slice(0, 300))
      return refus("Le registre des commandes a refusé le parchemin. Ta commande reste sur la table : réessaie plus tard.", 502)
    }
  } catch (e) {
    console.error(`[commande] script unreachable for ${commande.numero}`, e)
    return refus("Le coursier s'est perdu en route. Ta commande reste sur la table : réessaie plus tard.", 504)
  }

  // « Mes ventes » reads the orders from the registre: its cached copy is now too old.
  oublierRegistre()
  return NextResponse.json({ ok: true, numero: commande.numero, total: commande.total })
}
