/**
 * ════════════════════════════════════════════════════════════════════════
 *  M1 · CHALK GUIDES        owner: ____________     brief: docs/briefs/m1-chalk-guides.md
 * ════════════════════════════════════════════════════════════════════════
 *
 * The design catalogue. A guide is the white outline scratched on the ground
 * before a single flower is laid — a list of fillable regions plus the chalk
 * lines that separate them.
 *
 * ONE guide is written out below, in full, as the worked example. It is the
 * shape everything else in this file should take. Your job is the other
 * eleven, the catalogue that serves them, and the geometry helpers that stop
 * the twelfth from being as long as the first.
 *
 * Read `ChalkGuide` in src/contracts.ts before you start. If you find yourself
 * wanting to change that interface, say so in the group — three other modules
 * are reading it.
 */

import type { ChalkGuide, GuideCatalogue, GuideRegion } from '../../contracts';

/* ──────────────────────────────────────────────────────────────────────────
 * Geometry helpers. Two here; you will want more.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A slice of a ring — the workhorse shape of every pookalam. Angles in
 * radians, radii as a fraction of the plot's half-width so the same numbers
 * work at any texture size.
 */
function annularSector(
  size: number,
  innerR: number,
  outerR: number,
  from: number,
  to: number,
): Path2D {
  const c = size / 2;
  const half = size / 2;
  const path = new Path2D();
  path.arc(c, c, outerR * half, from, to);
  path.arc(c, c, innerR * half, to, from, true);
  path.closePath();
  return path;
}

/**
 * A pointed petal, standing on the inner radius and coming to a point on the
 * outer one. `fat` is how far the shoulders bulge, in radians.
 */
function petal(
  size: number,
  innerR: number,
  outerR: number,
  centreAngle: number,
  fat: number,
): Path2D {
  const c = size / 2;
  const half = size / 2;
  const at = (r: number, a: number): [number, number] => [
    c + Math.cos(a) * r * half,
    c + Math.sin(a) * r * half,
  ];

  const path = new Path2D();
  const [bx, by] = at(innerR, centreAngle);
  const [tx, ty] = at(outerR, centreAngle);
  const mid = (innerR + outerR) / 2;
  const [lx, ly] = at(mid, centreAngle - fat);
  const [rx, ry] = at(mid, centreAngle + fat);

  path.moveTo(bx, by);
  path.quadraticCurveTo(lx, ly, tx, ty);
  path.quadraticCurveTo(rx, ry, bx, by);
  path.closePath();
  return path;
}

/* ──────────────────────────────────────────────────────────────────────────
 * The worked example: അഷ്ടദളം, eight petals. Difficulty 1.
 * ────────────────────────────────────────────────────────────────────────── */

const SECTORS = 8;

function ashtadalaRegions(): GuideRegion[] {
  const regions: GuideRegion[] = [
    // The eye at the centre. One region, sector 0, no symmetry to respect.
    { id: 'eye', ring: 0, sector: 0, path: (s) => annularSector(s, 0, 0.16, 0, Math.PI * 2), suggests: 'chethi' },
  ];

  const step = (Math.PI * 2) / SECTORS;
  for (let i = 0; i < SECTORS; i++) {
    const angle = i * step;

    // Ring 1: the petals themselves.
    regions.push({
      id: `petal-${i}`,
      ring: 1,
      sector: i,
      path: (s) => petal(s, 0.18, 0.56, angle, step * 0.42),
      suggests: 'marigold',
    });

    // Ring 2: the gap between two petals, filled as a narrow wedge. This is
    // what makes a beginner's pookalam look deliberate instead of sparse.
    regions.push({
      id: `gap-${i}`,
      ring: 2,
      sector: i,
      path: (s) => annularSector(s, 0.3, 0.56, angle + step * 0.44, angle + step * 0.56),
      suggests: 'thumba',
    });

    // Ring 3: the outer band, two regions per sector so it can be striped.
    regions.push({
      id: `band-a-${i}`,
      ring: 3,
      sector: i,
      path: (s) => annularSector(s, 0.6, 0.74, angle, angle + step / 2),
      suggests: 'mulla',
    });
    regions.push({
      id: `band-b-${i}`,
      ring: 3,
      sector: i,
      path: (s) => annularSector(s, 0.6, 0.74, angle + step / 2, angle + step),
      suggests: 'arali',
    });

    // Ring 4: the toothed rim.
    regions.push({
      id: `tooth-${i}`,
      ring: 4,
      sector: i,
      path: (s) => petal(s, 0.76, 0.94, angle + step / 2, step * 0.3),
      suggests: 'chethi',
    });
  }

  return regions;
}

const ashtadala: ChalkGuide = {
  id: 'ashtadala',
  name: 'Ashtadala',
  malayalamName: 'അഷ്ടദളം',
  difficulty: 1,
  sectors: SECTORS,
  regions: ashtadalaRegions(),

  drawChalk(ctx, size) {
    const c = size / 2;
    const half = size / 2;

    // Line weights are in fractions of `size`, never in pixels — the same
    // guide has to read at 256 px on a phone and at 2048 px in a share card.
    ctx.strokeStyle = 'rgba(252,249,242,0.9)';
    ctx.lineWidth = Math.max(1.5, size / 190);
    ctx.lineCap = 'round';

    // The rings the flowers sit between.
    for (const r of [0.16, 0.18, 0.56, 0.6, 0.74, 0.76, 0.94]) {
      ctx.beginPath();
      ctx.arc(c, c, r * half, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The spokes that divide the sectors. Faint — they are a guide for the
    // hand, not part of the design.
    ctx.strokeStyle = 'rgba(252,249,242,0.45)';
    for (let i = 0; i < SECTORS * 2; i++) {
      const angle = (i / (SECTORS * 2)) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(angle) * 0.16 * half, c + Math.sin(angle) * 0.16 * half);
      ctx.lineTo(c + Math.cos(angle) * 0.94 * half, c + Math.sin(angle) * 0.94 * half);
      ctx.stroke();
    }

    // The petal outlines, so the shape reads before anything is filled.
    ctx.strokeStyle = 'rgba(252,249,242,0.78)';
    ctx.lineWidth = Math.max(1.2, size / 260);
    const step = (Math.PI * 2) / SECTORS;
    for (let i = 0; i < SECTORS; i++) {
      ctx.stroke(petal(size, 0.18, 0.56, i * step, step * 0.42));
    }
  },
};

/* ──────────────────────────────────────────────────────────────────────────
 * The catalogue
 * ────────────────────────────────────────────────────────────────────────── */

// TODO(M1): eleven more guides. A rough shopping list, easy → hard:
//   difficulty 1 · concentric rings, a simple 6-petal, a checkerboard square
//   difficulty 2 · 12-petal with a toothed rim, interlocking triangles,
//                  a peacock-eye border, a lotus with layered petals
//   difficulty 3 · 16-fold star, a Kathakali face, a vallam (snake boat),
//                  a full 24-sector mandala
// Do the two difficulty-1 ones first and get them on screen. A catalogue of
// two that works beats a catalogue of twelve that half-renders.
const ALL: ChalkGuide[] = [ashtadala];

export const guides: GuideCatalogue = {
  all: () => ALL,

  get: (id) => ALL.find((guide) => guide.id === id),

  byDifficulty: () => ({
    1: ALL.filter((guide) => guide.difficulty === 1),
    2: ALL.filter((guide) => guide.difficulty === 2),
    3: ALL.filter((guide) => guide.difficulty === 3),
  }),
};

/** The design a visitor gets before they have chosen one. */
export const defaultGuide = ashtadala;
