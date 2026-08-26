/**
 * Grass at the foot of the palms, from a downloaded model.
 *
 * ── What is in the file, and why it needs cutting up ──────────────────────
 *
 * `public/models/grass-pack.glb` is not a tuft. It is a STRIP — 288 units long
 * by 26 wide — holding roughly eleven clumps in a row, the way asset packs are
 * usually laid out so you can see everything at once in a thumbnail. And its
 * three meshes are not three clumps: they are three MATERIALS (a dark green, a
 * yellow-green and a near-black), each spread across the whole row.
 *
 * So neither axis of the file matches what we need. Instancing the strip as-is
 * would plant a 288-unit hedge every time we wanted one tuft.
 *
 * This file therefore does two rearrangements, and they are the interesting part:
 *
 *   1 · MERGE ACROSS MATERIALS. The three material groups become one geometry
 *       with the colours baked into a `color` attribute. Three materials with
 *       no textures and nothing but a base colour between them is exactly the
 *       case vertex colours exist for, and it means every clump — whatever mix
 *       of the three it contains — draws with one shared material.
 *
 *   2 · SPLIT ALONG THE LONG AXIS. Triangles are binned by where their centroid
 *       falls along the strip, which cuts the row back into the individual
 *       clumps it was made of. Each bin is then recentred on its own footprint
 *       and scaled to one unit tall.
 *
 * The result is a handful of distinct clumps, each an `InstancedMesh`, sharing
 * one material — so a couple of hundred tufts cost one draw call per variant.
 *
 * Like the palms, the normals are authored for image-based lighting; see
 * `gltfnormals.ts`.
 *
 * Owned by: the world.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type MeshStandardMaterial as StandardMaterial,
  type Scene,
} from 'three';
import { Color } from 'three';
import { bell, makeRng, range } from '../util/rng';
import { relight } from './gltfnormals';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Root } from './palms';
import { terrainHeight } from './terrain';
import { applySway } from './wind';

const MODEL_URL = '/models/grass-pack.glb';

/** How many clumps to cut the strip into. More variants means more draw calls
 *  and diminishing returns — past about six, nobody can tell. */
const VARIANTS = 6;
/** Tufts per palm. */
const PER_PALM = [10, 20] as const;
/** How far from the trunk they grow, as a multiple of the palm's height. Grass
 *  gathers where the trunk shades the ground, not in a neat collar. */
const SPREAD = [0.04, 0.30] as const;
/** Tuft height, metres. Knee-high — anything shorter is invisible from
 *  standing height, which is the only place anyone looks at it from. */
const HEIGHT = [0.4, 0.95] as const;

/**
 * How much of the pack's own tonal spread to keep, 0..1.
 *
 * The three source materials are a near-black, a mid green and a bright
 * yellow-green — a range wide enough to look like three different plants, which
 * next to the palms' fairly even canopy read as a different scene rather than
 * a different species. Squeezing it toward the mean keeps the variation without
 * the argument.
 */
const CONTRAST = 0.55;

/**
 * Retune the grass to the colour of the canopy above it.
 *
 * Two steps, and the order matters: pull the pack's internal contrast in toward
 * its own mean FIRST, then shift that mean onto the reference. Doing it the
 * other way round scales the outliers by the gain as well, and the bright tone
 * ends up further out than it started.
 *
 * `reference` is measured from the palm frond texture (`palms.ts` → `canopy`),
 * not chosen by eye, so the two plants agree by construction and keep agreeing
 * if either model is ever swapped.
 */
function harmonise(soup: Soup, reference: Color): void {
  const n = soup.color.length / 3;
  if (!n) return;

  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < soup.color.length; i += 3) {
    mr += soup.color[i];
    mg += soup.color[i + 1];
    mb += soup.color[i + 2];
  }
  mr /= n;
  mg /= n;
  mb /= n;

  // Aim a little brighter than the canopy: grass is underneath it and in the
  // open, and matching exactly makes it read as being in the tree's shadow.
  const target = reference.clone().multiplyScalar(1.25);
  const gain = [
    mr > 1e-4 ? target.r / mr : 1,
    mg > 1e-4 ? target.g / mg : 1,
    mb > 1e-4 ? target.b / mb : 1,
  ];

  const mean = [mr, mg, mb];
  for (let i = 0; i < soup.color.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const pulled = mean[k] + (soup.color[i + k] - mean[k]) * CONTRAST;
      soup.color[i + k] = Math.min(1, Math.max(0, pulled * gain[k]));
    }
  }
}

/** Positions, normals and colours, gathered across every material group. */
interface Soup {
  position: number[];
  normal: number[];
  color: number[];
}

/**
 * Flatten the model into one vertex soup with the material colours baked in.
 *
 * Non-indexed on purpose: the split below works on whole triangles, and once
 * vertices are no longer shared, binning them is a matter of reading three at a
 * time. 4,921 triangles is 14,763 vertices — nothing worth indexing.
 */
function toSoup(root: Object3D): Soup {
  root.updateMatrixWorld(true);
  const soup: Soup = { position: [], normal: [], color: [] };

  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh;

    const baked = mesh.geometry.clone();
    baked.applyMatrix4(mesh.matrixWorld);
    relight(baked);
    const geometry = baked.toNonIndexed();
    baked.dispose();

    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    // glTF's baseColorFactor is already linear, and so is a three vertex colour,
    // so this goes across untouched. Converting it here is the classic
    // double-conversion bug — see docs on colour management in architecture.
    const { color } = mesh.material as StandardMaterial;

    for (let i = 0; i < position.count; i++) {
      soup.position.push(position.getX(i), position.getY(i), position.getZ(i));
      soup.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      soup.color.push(color.r, color.g, color.b);
    }
    geometry.dispose();
  });

  return soup;
}

/** Which axis the strip runs along: the one it is longest in. */
function longAxis(position: number[]): { axis: number; min: number; max: number } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], position[i + k]);
      hi[k] = Math.max(hi[k], position[i + k]);
    }
  }
  let axis = 0;
  for (let k = 1; k < 3; k++) if (hi[k] - lo[k] > hi[axis] - lo[axis]) axis = k;
  return { axis, min: lo[axis], max: hi[axis] };
}

/**
 * Cut the strip into clumps and put each one in canonical space: centred on its
 * own footprint in XZ, sitting on y = 0, exactly one unit tall.
 *
 * Bins are dropped if they came out nearly empty — the gaps between clumps in
 * the original layout land in bins of their own, and an empty InstancedMesh is
 * a draw call for nothing.
 */
function toClumps(soup: Soup): BufferGeometry[] {
  const { axis, min, max } = longAxis(soup.position);
  const span = Math.max(max - min, 1e-6);

  const bins: Soup[] = Array.from({ length: VARIANTS }, () => ({
    position: [],
    normal: [],
    color: [],
  }));

  for (let t = 0; t < soup.position.length; t += 9) {
    // Bin by the triangle's centroid, so a triangle is never split across two.
    const centre = (soup.position[t + axis] + soup.position[t + 3 + axis] + soup.position[t + 6 + axis]) / 3;
    const bin = Math.min(VARIANTS - 1, Math.floor(((centre - min) / span) * VARIANTS));
    const into = bins[bin];
    for (let v = 0; v < 9; v++) {
      into.position.push(soup.position[t + v]);
      into.normal.push(soup.normal[t + v]);
      into.color.push(soup.color[t + v]);
    }
  }

  const clumps: BufferGeometry[] = [];
  for (const bin of bins) {
    if (bin.position.length < 3 * 3 * 12) continue; // fewer than 12 triangles

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(bin.position), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(bin.normal), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(bin.color), 3));
    geometry.computeBoundingBox();

    const box = geometry.boundingBox!;
    geometry.translate(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    geometry.scale(1 / Math.max(box.max.y - box.min.y, 1e-6), 1 / Math.max(box.max.y - box.min.y, 1e-6), 1 / Math.max(box.max.y - box.min.y, 1e-6));
    geometry.computeBoundingSphere();
    clumps.push(geometry);
  }
  return clumps;
}

export class Grass {
  private readonly meshes: InstancedMesh[] = [];
  private readonly material: MeshStandardMaterial;

  private constructor(scene: Scene, clumps: BufferGeometry[], roots: Root[]) {
    this.material = new MeshStandardMaterial({
      vertexColors: true,
      // Blades are thin and two-sided by nature; backface culling only puts
      // holes in them.
      side: DoubleSide,
      roughness: 0.88,
      metalness: 0,
    });
    // Quicker and looser than a palm — a tuft has no trunk to resist with.
    applySway(this.material, { amplitude: 0.34, speed: 1.9, flutter: 0.12 });

    const rng = makeRng(0x6a55);
    const dummy = new Object3D();
    // One list of transforms per variant, so each becomes one InstancedMesh.
    const perVariant: Array<Object3D['matrix'][]> = clumps.map(() => []);

    for (const root of roots) {
      const tufts = Math.round(range(rng, PER_PALM[0], PER_PALM[1]));
      for (let i = 0; i < tufts; i++) {
        // Clustered around the trunk rather than ringed at a fixed radius — a
        // collar of evenly spaced tufts reads as a planted border, not as grass
        // that happened to survive where the tree shades it.
        const r = root.height * range(rng, SPREAD[0], SPREAD[1]) * Math.sqrt(rng());
        const theta = rng() * Math.PI * 2;
        const x = root.x + Math.cos(theta) * r;
        const z = root.z + Math.sin(theta) * r;

        dummy.position.set(x, terrainHeight(x, z) - 0.02, z);
        dummy.rotation.set(range(rng, -0.06, 0.06), rng() * Math.PI * 2, range(rng, -0.06, 0.06));
        const height = bell(rng, HEIGHT[0], HEIGHT[1]);
        // Slightly wider than tall at random, so tufts do not all read as one
        // stamp scaled up and down.
        dummy.scale.set(height * range(rng, 0.85, 1.35), height, height * range(rng, 0.85, 1.35));
        dummy.updateMatrix();

        perVariant[Math.floor(rng() * clumps.length) % clumps.length].push(dummy.matrix.clone());
      }
    }

    clumps.forEach((geometry, v) => {
      const matrices = perVariant[v];
      if (!matrices.length) return;
      const mesh = new InstancedMesh(geometry, this.material, matrices.length);
      mesh.name = `grass-${v}`;
      // No shadows either way. A tuft's shadow is a smudge the size of the
      // tuft, and there are two hundred of them.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.meshes.push(mesh);
    });
  }

  /**
   * Load the pack and grow grass at the foot of every palm in `roots`.
   *
   * `canopy` is the palms' measured average colour; pass it and the grass tunes
   * itself to match. Without it the pack's own greens are used as-is, which do
   * not agree with the trees.
   */
  static async plant(scene: Scene, roots: Root[], canopy?: Color | null): Promise<Grass | null> {
    if (!roots.length) return null;
    try {
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      const soup = toSoup(gltf.scene);
      if (canopy) harmonise(soup, canopy);
      const clumps = toClumps(soup);
      if (!clumps.length) {
        console.warn('[grass] model loaded but yielded no clumps');
        return null;
      }
      return new Grass(scene, clumps, roots);
    } catch (error) {
      console.warn('[grass] could not load', MODEL_URL, '— carrying on bare:', error);
      return null;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
    this.meshes.length = 0;
  }
}
