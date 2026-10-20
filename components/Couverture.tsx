import { CoinLaiton, Embleme, Fleuron } from './Ornements'
import { FiltreFer } from './Fer'

/**
 * Iron lock plate on the cover. Its keyhole is the key's cross-section at the key's scale
 * (the plate is drawn for a 340px key): the round is the shaft, the slot below is the bit.
 */
export function Serrure() {
  return (
    <svg className="serrure" viewBox="0 0 84 140" aria-hidden>
      <defs>
        <FiltreFer id="fer-serrure" l={84} h={140} />
        <linearGradient id="trou-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" />
          <stop offset="100%" stopColor="#15100c" />
        </linearGradient>
      </defs>
      <g filter="url(#fer-serrure)">
        <path
          transform="scale(1.1667 1.2069)"
          d="M36 3C46 10 59 11 67 7C69 24 66 34 59 40C66 46 69 52 69 58C69 65 65 70 59 76C66 83 69 92 67 109C59 105 46 106 36 113C26 106 13 105 5 109C3 92 6 83 13 76C7 70 3 65 3 58C3 52 6 46 13 40C6 34 3 24 5 7C13 11 26 10 36 3Z"
          fill="#fff"
        />
        {[
          [15, 23],
          [69, 23],
          [15, 117],
          [69, 117],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#fff" />
        ))}
      </g>
      {/* Keyhole: shaft round (r 16) and bit slot (down to the bit's depth) */}
      <path d="M37.5 70L36 98H48L46.5 70A16.1 16.1 0 1 0 37.5 70Z" fill="url(#trou-g)" />
      <path d="M26 58A16 16 0 0 1 58 58" fill="none" stroke="#000" strokeOpacity=".7" strokeWidth="2" />
      <path d="M28 64A15 15 0 0 0 56 64" fill="none" stroke="#d8d2c6" strokeOpacity=".22" strokeWidth="1" />
    </svg>
  )
}

/**
 * Leather cover of the closed book (login page and the front of the printed copy): hinge,
 * brass corners, gilded emblem and title, iron lock plate on the fore-edge.
 */
export function FaceCouverture() {
  return (
    <div className="tome-couverture">
      <div className="tome-charniere" aria-hidden />
      <CoinLaiton className="hg" />
      <CoinLaiton className="bg" />
      <CoinLaiton className="hd" />
      <CoinLaiton className="bd" />
      <div className="tome-cadre">
        <Embleme taille={150} className="tome-embleme" />
        <h1 className="tome-titre">Lunes Itinérantes</h1>
        <Fleuron className="tome-fleuron" />
      </div>
      <div className="fermoir" aria-hidden>
        <Serrure />
      </div>
    </div>
  )
}

/** Back of the closed book (last page of the printed copy): same leather, hinge on the right, a small emblem low on the board. */
export function DosCouverture() {
  return (
    <div className="tome-couverture tome-dos">
      <div className="tome-charniere" aria-hidden />
      <CoinLaiton className="hg" />
      <CoinLaiton className="bg" />
      <CoinLaiton className="hd" />
      <CoinLaiton className="bd" />
      <div className="tome-cadre" aria-hidden />
      <Embleme taille={64} className="tome-embleme tome-dos-embleme" />
    </div>
  )
}
