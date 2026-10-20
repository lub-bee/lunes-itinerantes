import Link from 'next/link'

export default function Egare() {
  return (
    <main className="egare">
      <h1>Page arrachée</h1>
      <p>Quelqu&apos;un a déchiré cette page du grimoire. Khajiit soupçonne les rats d&apos;égout de Faillaise.</p>
      <Link href="/">Revenir au grimoire</Link>
    </main>
  )
}
