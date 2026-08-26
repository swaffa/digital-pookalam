/**
 * Coconut palms, from a downloaded model, in two tiers.
 *
 * ── What is in the file ────────────────────────────────────────────────────
 *
 * `public/models/coconut-palm.glb` is ONE palm, about 6.3 units tall, split
 * across five meshes because it has five materials — trunk, crown, fronds and
 * two more. 6,630 triangles all in, which is nothing. The 11 MB is fifteen PNG
 * textures; the geometry is a rounding error.
 *
 * That shape is what makes this file cheap: five meshes, five materials, so five
 * `InstancedMesh`es — and a hundred palms then cost the same five draw calls as
 * one. An instance costs its matrix, not its triangles. (`clouds.ts` makes the
 * same trade with sprites.)
 *
 * The fronds arrive rendering almost black, because their normals were authored
 * for image-based lighting. `gltfnormals.ts` explains that and fixes it.
 *
 * ── Why the geometry gets rewritten on load ────────────────────────────────
 *
 * A downloaded model arrives in whatever space its author left it in: nested
 * node transforms, an arbitrary scale, the origin wherever the modeller's cursor
 * happened to be. Instancing needs the opposite — one canonical space where a
 * matrix means something.
 *
 * So on load, every mesh's node transform is baked into a cloned geometry, and
 * the tree is then moved so the TRUNK's base sits at (0, 0, 0) and scaled so it
 * is exactly 1 unit tall. After that an instance matrix reads as "put a palm
 * here, this many metres tall, turned this way", and nothing downstream has to
 * know anything about the file it came from.
 *
 * Note it centres on the trunk, not on the bounding box. The fronds spread
 * asymmetrically, so a bbox-centred palm plants itself about a metre to one side
 * of where you asked — visible the moment you line one up with anything.
 *
 * ── Why two tiers ─────────────────────────────────────────────────────────
 *
 * NEAR is the stand around the courtyard, out to 130 m. Those cast shadows,
 * because their long shadows across the swept earth at dusk are most of what the
 * light does here.
 *
 * FAR is the treeline, 150 m to 560 m, and casts nothing. It could not anyway —
 * the shadow camera only reaches 44 m — but `frustumCulled` is off on these
 * meshes, so every instance is submitted to the shadow pass whether it can
 * contribute or not. Keeping the far tier in its own mesh with `castShadow` off
 * is the difference between 200 k and 800 k triangles of depth-only work per
 * frame, for something that cannot cast a pixel.
 *
 * Owned by: the world.
 */

import {
  Box3,
  Color,
  InstancedMesh,
  Mesh,
  MeshDepthMaterial,
  Object3D,
  RGBADepthPacking,
  Vector3,
  type Material,
  type Matrix4,
  type Scene,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MeshStandardMaterial, Texture } from 'three';
import { bell, makeRng, range } from '../util/rng';
import { relight } from './gltfnormals';
import { terrainHeight } from './terrain';
import { applySway } from './wind';

const MODEL_URL = '/models/coconut-palm.glb';

interface Tier {
  /** Palms to aim for. Five draw calls whatever this is. */
  count: number;
  /** Metres from the lamp: where the tier starts and where it ends. */
  from: number;
  to: number;
  /** Trunk base to the top of the fronds, metres. */
  height: [number, number];
  /** No two palms closer than this. Real ones compete for light. */
  gap: number;
  castShadow: boolean;
}

const TIERS: Tier[] = [
  { count: 30, from: 28, to: 130, height: [8.5, 15], gap: 13, castShadow: true },
  // The treeline. More palms over far more ground, so a wider gap still reads
  // as dense from here — and shorter, because the tall ones would break the
  // horizon and give the distance away.
  { count: 96, from: 150, to: 560, height: [7.5, 13], gap: 26, castShadow: false },
];

/** One material's worth of the palm, in canonical space: base at the origin,
 *  one unit tall. */
interface Part {
  geometry: Mesh['geometry'];
  material: Material;
}

/** sRGB byte → linear float. Averaging has to happen in linear or the result
 *  is skewed bright, and the whole point here is to get a colour right. */
function toLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * The mean colour of a texture's opaque pixels, in linear space.
 *
 * Used so the grass can be tuned against the canopy it grows under instead of
 * against a guess. Transparent pixels are skipped: in an alpha-masked foliage
 * atlas most of the image is empty, and it is usually black, so including it
 * would drag the average to nearly nothing.
 */
function meanOpaqueColour(map: Texture, alphaCutoff: number): Color | null {
  const image = map.image as HTMLImageElement | ImageBitmap | undefined;
  if (!image?.width) return null;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image as CanvasImageSource, 0, 0);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cutoff = Math.max(alphaCutoff, 0.5) * 255;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < cutoff) continue;
    r += toLinear(data[i]);
    g += toLinear(data[i + 1]);
    b += toLinear(data[i + 2]);
    n++;
  }
  return n ? new Color(r / n, g / n, b / n) : null;
}

/** Where a palm stands, for anything that wants to grow around it. */
export interface Root {
  x: number;
  z: number;
  /** The palm's height in metres — its trunk thickness scales with it. */
  height: number;
}

/**
 * Pull the model apart into instanceable parts.
 *
 * `applyMatrix4(matrixWorld)` is the important line: it bakes the node's place
 * in the file's hierarchy into the vertices themselves, so the geometry no
 * longer depends on being parented to anything.
 */
function toParts(root: Object3D): Part[] {
  root.updateMatrixWorld(true);

  const parts: Part[] = [];
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    parts.push({ geometry, material: mesh.material as Material });
  });
  if (!parts.length) return parts;

  // The trunk is the part that reaches lowest — everything else starts partway
  // up it. Its footprint is what the palm should stand on.
  let trunk = parts[0];
  for (const part of parts) {
    if (part.geometry.boundingBox!.min.y < trunk.geometry.boundingBox!.min.y) trunk = part;
  }
  const box = trunk.geometry.boundingBox!;
  const foot = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);

  // Whole-tree height, across every part, so scaling to 1 unit is exact rather
  // than "about right for the trunk".
  const whole = new Box3();
  for (const part of parts) whole.union(part.geometry.boundingBox!);
  const scale = 1 / Math.max(whole.max.y - foot.y, 1e-6);

  const relit: string[] = [];
  for (const part of parts) {
    part.geometry.translate(-foot.x, -foot.y, -foot.z);
    part.geometry.scale(scale, scale, scale);
    if (relight(part.geometry)) relit.push(part.material.name || '(unnamed)');
    part.geometry.computeBoundingSphere();
  }
  if (relit.length) {
    console.info(`[palms] recomputed normals for ${relit.join(', ')} — see gltfnormals.ts`);
  }
  return parts;
}

export class Palms {
  private readonly meshes: InstancedMesh[] = [];
  /** Where the NEAR palms stand, so grass can grow at their feet. */
  readonly roots: Root[] = [];
  /**
   * The average colour of the canopy, sampled from the frond texture.
   *
   * Exposed because the grass model arrived a completely different green — much
   * yellower and with far more contrast between its three tones — and two
   * plants in one courtyard disagreeing about what green is reads as two
   * different scenes. `grass.ts` tunes itself to this rather than to a hex
   * value somebody eyeballed.
   */
  readonly canopy: Color | null;

  private constructor(scene: Scene, parts: Part[], yardRadius: number) {
    // The fronds are the alpha-masked part; failing that, the biggest one.
    const foliage =
      parts.find((p) => (p.material as MeshStandardMaterial).alphaTest > 0) ??
      parts.reduce((a, b) => ((a.geometry.getAttribute('position')?.count ?? 0) >
        (b.geometry.getAttribute('position')?.count ?? 0) ? a : b));
    const map = (foliage.material as MeshStandardMaterial).map;
    this.canopy = map
      ? meanOpaqueColour(map, (foliage.material as MeshStandardMaterial).alphaTest)
      : null;

    const rng = makeRng(0x2c17);
    const dummy = new Object3D();
    const tint = new Color();

    for (const tier of TIERS) {
      const matrices: Matrix4[] = [];
      const tints: Color[] = [];
      /*
       * Rejection sampling, not even angular spacing.
       *
       * The obvious loop — `theta = i / count * 2π`, radius random — looks even
       * on paper and clumps badly on screen: trees at very different distances
       * but similar bearings pile into the same few pixels, so one arc of the
       * horizon is a thicket and the next is bare. Sampling uniformly by AREA
       * and discarding anything too close to a tree already placed gives the
       * loose, unpatterned spacing a real stand has.
       */
      const placed: Array<[number, number]> = [];
      const from = Math.max(tier.from, yardRadius + 6);
      let attempts = 0;
      while (placed.length < tier.count && attempts < tier.count * 80) {
        attempts++;
        // sqrt of a uniform is uniform-by-area; a linear radius crowds the rim.
        const r = Math.sqrt(range(rng, (from / tier.to) ** 2, 1)) * tier.to;
        const theta = rng() * Math.PI * 2;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < tier.gap)) continue;
        placed.push([x, z]);

        const height = bell(rng, tier.height[0], tier.height[1]);
        dummy.position.set(x, terrainHeight(x, z) - 0.05, z);
        dummy.rotation.set(
          // A couple of degrees of lean. Real palms are never plumb, and a
          // stand of perfectly vertical ones reads as clip art.
          range(rng, -0.05, 0.05),
          rng() * Math.PI * 2,
          range(rng, -0.05, 0.05),
        );
        dummy.scale.setScalar(height);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());

        /**
         * A tint per tree. Every palm here is the same model, and a hundred
         * copies of one tree read as wallpaper however you rotate them.
         * `instanceColor` multiplies the base colour map, so a few percent
         * either way — one yellower, one deeper — breaks the repetition for the
         * cost of three floats. The same tint goes on all five parts of a tree,
         * so a trunk never disagrees with its own crown.
         */
        const warm = range(rng, -0.05, 0.06);
        const lift = range(rng, 0.9, 1.08);
        tints.push(tint.setRGB((1 + warm) * lift, lift, (1 - warm) * lift).clone());

        if (tier.castShadow) this.roots.push({ x, z, height });
      }

      for (const part of parts) {
        const mesh = new InstancedMesh(part.geometry, part.material, matrices.length);
        mesh.name = `palm-${tier.castShadow ? 'near' : 'far'}`;
        mesh.castShadow = tier.castShadow;
        // Palms never receive: nothing in the scene is tall enough to shade one,
        // and it would double their cost in the shadow pass for nothing.
        mesh.receiveShadow = false;
        // One shared bounding sphere spans the whole field, so the frustum test
        // can never cull anything. Don't pay for it.
        mesh.frustumCulled = false;
        for (let i = 0; i < matrices.length; i++) {
          mesh.setMatrixAt(i, matrices[i]);
          mesh.setColorAt(i, tints[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
        this.meshes.push(mesh);
      }
    }

    /*
     * Bend in the wind. Patched once per material rather than per mesh — the two
     * tiers share the same five materials, so patching per mesh would install
     * the sway twice and displace everything double.
     *
     * The shadow pass uses its own depth material, which would not sway and
     * would leave every palm's shadow standing still under a moving tree. So the
     * same patch goes on a depth material and is handed to the shadow-casting
     * meshes as `customDepthMaterial`.
     */
    const swayed = new Set<Material>();
    for (const part of parts) {
      if (swayed.has(part.material)) continue;
      swayed.add(part.material);
      applySway(part.material, { amplitude: 0.022, speed: 0.85, flutter: 0.012 });
    }
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    applySway(depth, { amplitude: 0.022, speed: 0.85, flutter: 0.012 });
    this.depthMaterial = depth;
    for (const mesh of this.meshes) {
      if (mesh.castShadow) mesh.customDepthMaterial = depth;
    }
  }

  private readonly depthMaterial: MeshDepthMaterial;

  /**
   * Load the model and plant both tiers.
   *
   * Resolves to null if the file is missing or unreadable — a courtyard with no
   * trees is a perfectly good courtyard, and a failed download must not stop the
   * world from opening.
   */
  static async plant(scene: Scene, yardRadius: number): Promise<Palms | null> {
    try {
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      const parts = toParts(gltf.scene);
      if (!parts.length) {
        console.warn('[palms] model loaded but contained no meshes');
        return null;
      }
      return new Palms(scene, parts, yardRadius);
    } catch (error) {
      console.warn('[palms] could not load', MODEL_URL, '— carrying on without trees:', error);
      return null;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.depthMaterial.dispose();
    this.meshes.length = 0;
  }
}
