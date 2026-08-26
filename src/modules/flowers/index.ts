/**
 * ════════════════════════════════════════════════════════════════════════
 *  M3 · FLOWERS            owner: ____________     brief: docs/briefs/m3-flowers.md
 * ════════════════════════════════════════════════════════════════════════
 *
 * Two halves, and they are very different jobs:
 *
 *   the palette   — which flowers exist, what they are called, what colour
 *                   they are. Small, finished in an hour, and every other
 *                   module depends on it. Do this first.
 *   the petals    — real 3-D petals standing on the plot the camera is near.
 *                   This is the hard, showy half.
 *
 * Six flowers are seeded below because M1's worked guide names them. They are
 * a starting point, not a spec — a real Onam pookalam has thirty.
 */

import type {
  ChalkGuide,
  Flower,
  FlowerCatalogue,
  KalamPaint,
  PetalField,
} from '../../contracts';

/* ──────────────────────────────────────────────────────────────────────────
 * The palette
 * ────────────────────────────────────────────────────────────────────────── */

// TODO(M3): grow this list. Names matter — get the Malayalam right, people
// will notice. Worth adding: vaadamalli, jamanthi, banana stem (white),
// hibiscus, kanakambaram, sunflower, and at least two greens for leaves.
const SEED: Flower[] = [
  {
    id: 'chethi',
    name: 'Chethi',
    malayalamName: 'ചെത്തി',
    hex: '#d8342a',
    petal: { length: 0.05, width: 0.045, curl: 0.3 },
  },
  {
    id: 'marigold',
    name: 'Marigold',
    malayalamName: 'ചെണ്ടുമല്ലി',
    hex: '#f2a413',
    petal: { length: 0.06, width: 0.05, curl: 0.45 },
  },
  {
    id: 'arali',
    name: 'Arali',
    malayalamName: 'അരളി',
    hex: '#e8557f',
    petal: { length: 0.07, width: 0.055, curl: 0.25 },
  },
  {
    id: 'thumba',
    name: 'Thumba',
    malayalamName: 'തുമ്പ',
    hex: '#f6f2e4',
    shadeHex: '#cfc8b2',
    petal: { length: 0.03, width: 0.028, curl: 0.15 },
  },
  {
    id: 'mulla',
    name: 'Mulla',
    malayalamName: 'മുല്ല',
    hex: '#fbfbf4',
    shadeHex: '#d6d3c2',
    petal: { length: 0.035, width: 0.035, curl: 0.2 },
  },
  {
    id: 'thulasi',
    name: 'Thulasi leaf',
    malayalamName: 'തുളസി',
    hex: '#3f6b39',
    petal: { length: 0.055, width: 0.03, curl: 0.1 },
  },
  { id: 'hibiscus', name: 'Hibiscus', malayalamName: 'ചെമ്പരത്തി', hex: '#e52f35', shadeHex: '#9f1730', petal: { length: 0.075, width: 0.065, curl: 0.32 } },
  { id: 'kanakambaram', name: 'Crossandra', malayalamName: 'കനകാംബരം', hex: '#f27524', shadeHex: '#be3f1e', petal: { length: 0.05, width: 0.045, curl: 0.4 } },
  { id: 'vaadamalli', name: 'Globe Amaranth', malayalamName: 'വാടാമല്ലി', hex: '#a947a5', shadeHex: '#662760', petal: { length: 0.04, width: 0.04, curl: 0.18 } },
  { id: 'sunflower', name: 'Sunflower', malayalamName: 'സൂര്യകാന്തി', hex: '#ffd12e', shadeHex: '#e18b13', petal: { length: 0.08, width: 0.045, curl: 0.34 } },
  { id: 'krishnakireedam', name: 'Butterfly Pea', malayalamName: 'ശംഖുപുഷ്പം', hex: '#5268cc', shadeHex: '#30357e', petal: { length: 0.055, width: 0.05, curl: 0.24 } },
  { id: 'rose', name: 'Rose', malayalamName: 'റോസ്', hex: '#ec5f86', shadeHex: '#a72555', petal: { length: 0.06, width: 0.055, curl: 0.48 } },
];

export const flowers: FlowerCatalogue = {
  all: () => SEED,
  get: (id) => SEED.find((flower) => flower.id === id),
  // Never hand the renderer an undefined. An unknown id in old saved data
  // should show up as marigold, not as a crash.
  fallback: SEED[1],
};

/* ──────────────────────────────────────────────────────────────────────────
 * The 3-D petal layer
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * TODO(M3): the whole of this.
 *
 * There is ONE kalam per world and the camera gets within two metres of it, so
 * this is not an optimisation problem any more — it is the centrepiece. A
 * nine-metre pookalam in real petals, catching a low sun, is the best-looking
 * thing anybody will build in this project.
 *
 * The shape of the answer, so you do not have to invent it:
 *   · one InstancedMesh for the whole kalam, not one Mesh per petal. An
 *     instance costs its matrix, not its triangles.
 *   · to know WHERE petals go, sample the region's Path2D: rasterise it to a
 *     small offscreen canvas and rejection-sample points inside it.
 *     `ctx.isPointInPath(path, x, y)` is the whole trick.
 *   · petal count scales with the region's area, so the outer band gets more
 *     flowers than the eye at the centre.
 *   · canvas coordinates → metres is `world.kalamToWorld({u, v})`. Never work
 *     it out yourself; the disc's radius is `world.kalamRadius` and it is
 *     allowed to change.
 *   · budget: 20,000–40,000 petals is realistic for one kalam at this size.
 *     Measure with the camera moving, and keep the flat painted texture
 *     underneath — it is what the petals sit on and what shows through.
 */
export function createPetalField(): PetalField {
  let warned = false;
  return {
    build(_paint: KalamPaint, _guide: ChalkGuide) {
      if (!warned) {
        warned = true;
        console.info('[M3] petal field not built yet — see docs/briefs/m3-flowers.md');
      }
    },
    dispose() {},
  };
}
