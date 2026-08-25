/**
 * The floor, at two resolutions.
 *
 * `near` is a 240 m plane at one metre per quad. It carries the courtyard — a
 * disc of swept laterite easing out into paddy — in its vertex colours, and it
 * is fine enough that the courtyard's edge reads as a curve rather than as a
 * polygon.
 *
 * `far` is a 1,400 m plane at ten metres per quad, pure paddy, running out to
 * where the fog takes over.
 *
 * ── Why two meshes and not one ─────────────────────────────────────────────
 *
 * One plane cannot be both. At one metre per quad, 1,400 m is twenty million
 * vertices; at ten metres per quad, the courtyard's rim is a forty-sided
 * polygon. So: two grids, and the trick that makes it free — BOTH sample the
 * same `terrainHeight(x, z)`. Where they overlap they produce identical
 * geometry, so there is no seam to hide, no skirt to fudge, and no LOD popping.
 * That is the whole argument for keeping the landscape's shape in a function
 * instead of in a mesh.
 *
 * Owned by: the world.
 */

import {
  BufferAttribute,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { terrainHeight, yardRadius } from './terrain';
import { makeRng } from '../util/rng';

const NEAR_EXTENT = 240;
const NEAR_SEGMENTS = 240; // 1 m per quad
/** The far plane runs to 1.3 km in every direction. It has to: the opening
 *  descent starts high enough to see that far, and thinner haze means the
 *  plane's own edge would otherwise show up as a hard horizon line. */
const FAR_EXTENT = 2600;
const FAR_SEGMENTS = 260; // 10 m per quad

const EARTH = new Color(0xa89179);
const EARTH_DARK = new Color(0x8d7860);
const RIM = new Color(0x99895f);
const PADDY = new Color(0x54793c);
const PADDY_DEEP = new Color(0x3a5f33);
const DRY = new Color(0x9aa35c);

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** A cheap deterministic hash in 2-D. Same point, same answer, nothing stored
 *  — which is what lets the two meshes mottle identically where they overlap. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Smooth value noise: the hash above, sampled on an integer lattice and
 * interpolated between the corners.
 *
 * The interpolation is the entire point. An earlier version of this file used
 * `hash2(round(x / 3), round(z / 3))` directly, which is one flat random value
 * per three-metre cell — invisible at ground level and, from the air during the
 * descent, an unmistakable checkerboard across the whole courtyard. Noise you
 * intend to see from two distances has to be continuous.
 */
function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Smoothstep the fractions, so the lattice lines do not show as creases.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Two octaves, which is all a patch of earth needs up close. */
function fbm(x: number, y: number): number {
  return noise2(x, y) * 0.65 + noise2(x * 2.7 + 11.3, y * 2.7 - 4.1) * 0.35;
}

/**
 * Three octaves, the widest of them ~200 m across.
 *
 * Used for the paddy only, and only because of the opening descent: from 470 m
 * up, 46 m field patches are below the size the eye picks out and the whole
 * landscape reads as one flat green. The wide octave is what makes it read as
 * fields from the air without changing anything at ground level.
 */
function fbmWide(x: number, y: number): number {
  return noise2(x / 4.4, y / 4.4) * 0.5 + noise2(x, y) * 0.33 + noise2(x * 2.7 + 11.3, y * 2.7 - 4.1) * 0.17;
}

/** Fine, low-contrast grit, tiled. Bigger or darker than this and the mip
 *  chain turns it into mud stains a metre across. */
function speckleTexture(repeat: number): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = makeRng(0x50f7);

  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4200; i++) {
    const r = rng() * 0.9 + 0.25;
    const dark = rng() < 0.6;
    ctx.fillStyle = dark
      ? `rgba(96,84,68,${0.04 + rng() * 0.08})`
      : `rgba(255,250,238,${0.03 + rng() * 0.07})`;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

/** Colour one vertex: laterite in the courtyard, paddy outside it. */
function colourAt(x: number, z: number, yard: number, out: Color, scratch: Color): void {
  const r = Math.hypot(x, z);

  // Broad sweeps of tone across the swept earth — where the broom has been,
  // where the sun has bleached it.
  const mottle = fbm(x / 9, z / 9);
  out.copy(EARTH).lerp(EARTH_DARK, mottle * 0.7);

  const outward = smoothstep(yard - 4, yard + 12, r);
  if (outward > 0) {
    // Two scales of green: broad swells you read as separate fields, and a
    // finer grain so no field is a flat colour.
    const patch = fbmWide(x / 46, z / 46);
    const grain = fbm(x / 7, z / 7);
    scratch.copy(PADDY).lerp(PADDY_DEEP, patch * 0.78 + grain * 0.22);
    // Dry and pale towards the horizon, so the eye reads depth.
    scratch.lerp(DRY, smoothstep(yard + 60, FAR_EXTENT * 0.4, r) * 0.8);
    out.lerp(RIM, Math.min(outward * 2.4, 1)).lerp(scratch, outward);
  }
}

/** Build one displaced, vertex-coloured plane. */
function slab(extent: number, segments: number, yard: number): PlaneGeometry {
  const geometry = new PlaneGeometry(extent, extent, segments, segments);
  // Plane geometry is born standing up in XY. Lay it down once, here, so every
  // position below is already in world axes.
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const colour = new Color();
  const scratch = new Color();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, terrainHeight(x, z));
    colourAt(x, z, yard, colour, scratch);
    colors[i * 3] = colour.r;
    colors[i * 3 + 1] = colour.g;
    colors[i * 3 + 2] = colour.b;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class Ground {
  /** The one the raycaster tests. Everything a visitor can click is on it. */
  readonly near: Mesh;
  readonly far: Mesh;

  constructor(scene: Scene) {
    const yard = yardRadius();

    this.near = new Mesh(
      slab(NEAR_EXTENT, NEAR_SEGMENTS, yard),
      new MeshStandardMaterial({
        vertexColors: true,
        map: speckleTexture(NEAR_EXTENT / 2.5),
        roughness: 0.94,
      }),
    );
    this.near.name = 'ground-near';
    this.near.receiveShadow = true;
    // Drawn over the far plane where they coincide, so the coarse mesh never
    // shows through in a z-fight.
    (this.near.material as MeshStandardMaterial).polygonOffset = true;
    (this.near.material as MeshStandardMaterial).polygonOffsetFactor = -1;
    scene.add(this.near);

    this.far = new Mesh(
      slab(FAR_EXTENT, FAR_SEGMENTS, yard),
      new MeshStandardMaterial({
        vertexColors: true,
        map: speckleTexture(FAR_EXTENT / 6),
        roughness: 0.95,
      }),
    );
    this.far.name = 'ground-far';
    // No shadows out here: nothing is close enough to cast one, and the far
    // plane alone would double the shadow pass for nothing.
    this.far.receiveShadow = false;
    scene.add(this.far);
  }

  dispose(): void {
    for (const mesh of [this.near, this.far]) {
      mesh.geometry.dispose();
      const material = mesh.material as MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    }
  }
}
