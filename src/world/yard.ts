/**
 * ════════════════════════════════════════════════════════════════════════
 *  THE YARD — one courtyard, one pookalam
 * ════════════════════════════════════════════════════════════════════════
 *
 * A group opens their world and finds this: a circle of swept earth nine
 * metres across, empty and waiting, with a നിലവിളക്ക് standing at its northern
 * edge. Everything a group builds happens on this one disc.
 *
 * Right now the disc is BARE on purpose. There is no chalk on it and no design
 * — just ground somebody has swept. The pookalam is M1's and M2's to put here,
 * and an empty courtyard is the honest picture of where the project is. One
 * line in `main.ts` turns the surface on when they are ready.
 *
 * That is a deliberate narrowing. An earlier version of this project laid out
 * a thousand small plots in one shared field, and it meant every pookalam was
 * forty pixels across and nobody could see what anyone had made. One large
 * kalam per world is worth more than a thousand thumbnails: the camera can get
 * close to it, petals can be real geometry, and a group of people can work on
 * different rings of the same design at the same time.
 *
 * ── The seam this file exists to provide ───────────────────────────────────
 *
 * The disc's surface is a TEXTURE, and the world does not care who draws it.
 * M2's painter hands over a canvas; this puts it on the ground at the right
 * size. In return, `pick()` turns a click into a `(u, v)` on that same canvas,
 * which is all M2 needs to know which region somebody tapped.
 *
 *     M2's canvas ──setSurface()──▶ the ground
 *     a click     ──pick()───────▶ (u, v) on M2's canvas
 *
 * Those two calls are the entire contract between the drawing and the world.
 *
 * Owned by: the world.
 */

import {
  CanvasTexture,
  CircleGeometry,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Raycaster,
  type Scene,
  type Texture,
} from 'three';
import { makeRng } from '../util/rng';

/** Radius of the pookalam itself, metres. A large real one is 4–5 m across;
 *  this is nine metres of kalam, which is a festival centrepiece. */
export const KALAM_RADIUS = 4.5;
/** The swept apron of prepared earth around it. A hint of prepared ground —
 *  push its contrast up and it reads as a dinner plate under the kalam. */
const APRON_RADIUS = 5.7;
/** Heights, in the order things stack off the floor. */
const APRON_Y = 0.012;
const KALAM_Y = 0.03;

/**
 * The bare disc: earth somebody has swept, and nothing else.
 *
 * Deliberately almost invisible. A waiting yard has to read as EMPTIER than one
 * with a real guide chalked on it — otherwise M1's designs have nothing to
 * stand out against and every world looks finished before anyone has begun.
 */
function sweptTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const mid = size / 2;
  const rng = makeRng(0xc4a1);

  const earth = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  earth.addColorStop(0, 'rgba(208,188,158,0.5)');
  earth.addColorStop(0.8, 'rgba(196,175,146,0.42)');
  earth.addColorStop(1, 'rgba(190,170,142,0.3)');
  ctx.fillStyle = earth;
  ctx.fillRect(0, 0, size, size);

  // Broom marks: arcs of slightly darker earth, so the disc reads as swept
  // rather than poured.
  ctx.strokeStyle = 'rgba(118,96,72,0.05)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(mid, mid, 24 + rng() * 220, rng() * 6.28, rng() * 6.28);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export class Yard {
  /** The pookalam's ground. Its material's map is whatever M2 last handed over,
   *  or bare swept earth while nobody has handed over anything. */
  readonly kalam: Mesh;
  readonly apron: Mesh;

  private readonly placeholder: CanvasTexture;

  constructor(scene: Scene) {
    this.placeholder = sweptTexture();

    // The apron: prepared ground, so the kalam is not sitting on raw field.
    this.apron = new Mesh(
      new CircleGeometry(APRON_RADIUS, 72),
      new MeshStandardMaterial({
        color: 0xbdac90,
        roughness: 0.95,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    this.apron.geometry.rotateX(-Math.PI / 2);
    this.apron.position.y = APRON_Y;
    this.apron.name = 'apron';
    this.apron.receiveShadow = true;
    scene.add(this.apron);

    /**
     * The kalam. A CircleGeometry's UVs already map the disc into the unit
     * square centred on (0.5, 0.5) — which is exactly how a painter thinks
     * about a round design on a square canvas. That coincidence is why `pick`
     * below is three lines instead of a page of trigonometry.
     */
    const geometry = new CircleGeometry(KALAM_RADIUS, 96);
    geometry.rotateX(-Math.PI / 2);
    this.kalam = new Mesh(
      geometry,
      new MeshStandardMaterial({
        map: this.placeholder,
        transparent: true,
        roughness: 0.88,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    );
    this.kalam.position.y = KALAM_Y;
    this.kalam.name = 'kalam';
    this.kalam.receiveShadow = true;
    scene.add(this.kalam);
  }

  /**
   * Hand the ground over to a module's canvas. Call it again with a different
   * texture and the old one is simply released — this class never owns a
   * texture it did not make.
   */
  setSurface(texture: Texture | null): void {
    const material = this.kalam.material as MeshStandardMaterial;
    material.map = texture ?? this.placeholder;
    material.needsUpdate = true;
  }

  /**
   * A click, as a point on the kalam's canvas. Null when the ray missed the
   * disc entirely.
   *
   * three.js fills in `uv` on an intersection for any mesh that has a uv
   * attribute, so the conversion from "somewhere in 3-D space" to "a pixel on
   * M2's canvas" costs nothing and cannot drift out of sync with the geometry.
   */
  pick(raycaster: Raycaster): { u: number; v: number } | null {
    const hit = raycaster.intersectObject(this.kalam, false)[0];
    if (!hit?.uv) return null;
    // Canvas y runs down, texture v runs up.
    return { u: hit.uv.x, v: 1 - hit.uv.y };
  }

  dispose(): void {
    for (const mesh of [this.kalam, this.apron]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.placeholder.dispose();
  }
}
