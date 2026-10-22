// The caravan's emblem blind-pressed into the paper. On the ex-libris it is part of the page; with
// `partout` it is pressed into every page of the book (Ludo's trial, 2026-10-22). One switch, three
// strengths (opacity of the light-and-shadow image, 0 to 1). The relief is baked in
// public/textures/gaufrage.webp (a static background layer: nothing is filtered while pages turn).
export const GAUFRAGE = {
  /** false: only the ex-libris carries it. */
  partout: true,
  /** Most pages. */
  intensite: 0.7,
  /** Dense price ledgers (chapters), kept fainter for legibility. */
  registres: 0.45,
  /** The ex-libris spread. */
  exLibris: 1,
}
