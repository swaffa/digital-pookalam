/**
 * The floor's shape, as a function. No mesh, no memory, no lookup table —
 * ask it for a height at any point and it answers.
 *
 * That matters because several separate things need to sit on the same ground:
 * two levels of terrain mesh, the stones, the lamp, the camera's floor clamp,
 * and whatever M3 eventually stands on the kalam. If the shape lived inside a
 * mesh they would all have to raycast against it and could still disagree at
 * the edges. Instead they call one pure function and agree by construction —
 * which is what lets `ground.ts` draw the same landscape at two resolutions
 * with no seam between them.
 *
 * The courtyard itself is flat. A pookalam laid on a slope reads as a mistake,
 * so the height field is faded to exactly zero inside the yard and only starts
 * rolling once you are past the last ring of plots.
 *
 * Owned by: the world.
 */

/** Smooth 0→1 between two edges. The one easing function this file needs. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Radius of the flat courtyard, metres. A nine-metre kalam with room to walk
 * round it and stand back from it — which is about a real house's മുറ്റം.
 *
 * It is tempting to make this bigger. Don't: past about twenty metres the
 * courtyard stops framing the pookalam and starts being a beach with a
 * pookalam on it.
 */
let flatRadius = 16;
/** Metres over which flat courtyard eases into rolling paddy. */
const BLEND = 26;

export function setYardRadius(metres: number): void {
  flatRadius = metres;
}

export function yardRadius(): number {
  return flatRadius;
}

/**
 * Height in metres at a world point. Zero everywhere inside the yard.
 *
 * Three octaves of sine, which is all a paddy landscape needs: a long swell
 * you read as distance, a mid ripple for the bunds between fields, and a fine
 * grain that keeps the grass from looking like it is standing on glass.
 */
export function terrainHeight(x: number, z: number): number {
  const away = smoothstep(flatRadius, flatRadius + BLEND, Math.hypot(x, z));
  if (away === 0) return 0;

  const swell = Math.sin(x * 0.0121) * Math.cos(z * 0.0094) * 3.1;
  const bunds = Math.sin((x + z * 0.6) * 0.038) * 0.85;
  const grain = Math.sin(x * 0.098) * Math.cos(z * 0.081) * 0.22;

  return (swell + bunds + grain) * away;
}

/**
 * Upward normal of the floor, by finite difference. Used to lie grass and
 * stones down along the slope instead of standing them all bolt upright.
 */
export function terrainNormal(x: number, z: number, out: [number, number, number]): void {
  const e = 0.6;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  // ( -dh/dx, 2e, -dh/dz ), normalised
  const len = Math.hypot(dx, 2 * e, dz) || 1;
  out[0] = -dx / len;
  out[1] = (2 * e) / len;
  out[2] = -dz / len;
}
