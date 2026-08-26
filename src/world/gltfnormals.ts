/**
 * Making a downloaded model's normals work under our lighting.
 *
 * ── The problem, in one paragraph ──────────────────────────────────────────
 *
 * Foliage models are routinely authored with normals that do not belong to the
 * surface they sit on. Instead of standing perpendicular to each blade or frond,
 * they fan outward from the centre of the plant. Under image-based lighting that
 * is a lovely trick — it makes a tree read as a soft volume rather than a pile
 * of flat cards, and it is why these models look good on Sketchfab.
 *
 * This scene has no environment map. One directional sun, one hemisphere light,
 * nothing else. Feed those a normal pointing sideways relative to the surface
 * and the diffuse term collapses to almost nothing, so the blade renders black.
 * Nothing is broken — the model was authored for a lighting rig we do not have.
 *
 * The faithful fix would be to build a PMREM environment map from our sky so the
 * original normals do what they were meant to. That is real work, and it would
 * change how everything else in the scene is lit. For a tree on the horizon,
 * replacing the normals is the right trade.
 *
 * Shared by `palms.ts` and `grass.ts`, because both models have it.
 *
 * Owned by: the world.
 */

import { BufferGeometry } from 'three';

/** Past this mean deviation, treat the normals as authored for another rig. */
const DEVIATION_LIMIT = 35;

/**
 * Mean angle, in degrees, between a geometry's supplied normals and the ones
 * its own triangles imply.
 *
 * A mesh authored the ordinary way scores a few degrees — smoothing groups and
 * split vertices account for that much. One authored for image-based lighting
 * scores tens of degrees, because its normals describe the plant's overall
 * volume instead of each surface's facing.
 */
export function normalDeviation(geometry: BufferGeometry): number {
  const supplied = geometry.getAttribute('normal');
  const position = geometry.getAttribute('position');
  if (!supplied || !position) return 0;

  // Ask the geometry what its normals would be, without disturbing the original.
  const probe = new BufferGeometry();
  probe.setIndex(geometry.getIndex());
  probe.setAttribute('position', position);
  probe.computeVertexNormals();
  const geometric = probe.getAttribute('normal');

  let radians = 0;
  for (let i = 0; i < supplied.count; i++) {
    const dot =
      supplied.getX(i) * geometric.getX(i) +
      supplied.getY(i) * geometric.getY(i) +
      supplied.getZ(i) * geometric.getZ(i);
    radians += Math.acos(Math.min(1, Math.max(-1, dot)));
  }
  probe.dispose();
  return (radians / supplied.count) * (180 / Math.PI);
}

/**
 * Replace non-geometric normals with real ones. Returns true if it acted, so
 * the caller can say so on the console rather than fixing things silently.
 */
export function relight(geometry: BufferGeometry): boolean {
  if (normalDeviation(geometry) < DEVIATION_LIMIT) return false;
  geometry.deleteAttribute('normal');
  // Tangents were authored against the old normals and no longer form an
  // orthonormal basis with the new ones. Drop them and let three derive
  // tangents from screen-space derivatives — any normal map still works.
  geometry.deleteAttribute('tangent');
  geometry.computeVertexNormals();
  return true;
}
