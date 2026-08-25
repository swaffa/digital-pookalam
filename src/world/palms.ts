/**
 * Coconut palms, from a downloaded model.
 *
 * This is the only external asset in the project, and it is worth knowing what
 * it costs and what it buys.
 *
 * ── What is in the file ────────────────────────────────────────────────────
 *
 * `public/models/coconut-palm.glb` is ONE palm, about 6.3 units tall, split
 * across five meshes because it has five materials — trunk, crown, fronds,
 * and two more. 6,630 triangles all in, which is nothing. The 11 MB is fifteen
 * PNG textures; the geometry is a rounding error.
 *
 * That shape is what makes this file cheap: five meshes, five materials, so five
 * `InstancedMesh`es — and then a hundred palms cost the same five draw calls as
 * one. An instance costs its matrix, not its triangles. (`clouds.ts` makes the
 * same trade with sprites.)
 *
 * ── Why the geometry gets rewritten on load ────────────────────────────────
 *
 * A downloaded model arrives in whatever space its author left it in: nested
 * node transforms, an arbitrary scale, the origin wherever the modeller's
 * cursor happened to be. Instancing needs the opposite — one canonical space
 * where a matrix means something.
 *
 * So on load, every mesh's node transform is baked into a cloned geometry, and
 * the whole tree is then moved so the TRUNK's base sits at (0, 0, 0) and scaled
 * so the tree is exactly 1 unit tall. After that an instance matrix reads as
 * "put a palm here, this many metres tall, turned this way", and nothing in the
 * rest of the file has to know anything about the file it came from.
 *
 * Note it centres on the trunk, not on the bounding box. The fronds spread
 * asymmetrically, so a bbox-centred palm plants itself about a metre to one side
 * of where you asked — visible the moment you line one up with anything.
 *
 * ── The black fronds ───────────────────────────────────────────────────────
 *
 * Straight out of the file, this model's fronds rendered almost black. Worth
 * writing down, because the cause is not a bug in the model and it will happen
 * again with the next one you download.
 *
 * The frond normals are perfectly valid — all unit length, none NaN — they are
 * just not GEOMETRIC. They fan outward from the centre of the crown rather than
 * standing perpendicular to each blade. That is a deliberate and common trick
 * for foliage: under image-based lighting it makes a tree read as a soft volume
 * instead of as a pile of flat cards, and it is why the model looks good on
 * Sketchfab.
 *
 * This scene has no environment map — one directional sun and a hemisphere
 * light, nothing else. Feed those a normal that points sideways relative to the
 * surface and the diffuse term collapses to nearly nothing, so the blade goes
 * black. Nothing is broken; the model was authored for a lighting rig we do not
 * have.
 *
 * `relight()` below detects it and replaces the authored normals with geometric
 * ones. The alternative — building a PMREM environment map from our sky so the
 * original normals work as intended — is the more faithful fix, and it would
 * also change how everything else in the scene is lit. Not worth it for a tree
 * on the horizon.
 *
 * Owned by: the world.
 */

import {
  Box3,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  Object3D,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bell, makeRng, range } from '../util/rng';
import { terrainHeight } from './terrain';

const MODEL_URL = '/models/coconut-palm.glb';

/** How many palms to aim for. Five draw calls whatever this is. */
const PALMS = 30;
/** Metres, trunk base to the top of the fronds. */
const HEIGHT = [8.5, 15] as const;
/** How far out the stand reaches, past the courtyard's edge. */
const REACH = 130;
/** No two palms closer than this. Real ones compete for light. */
const MIN_GAP = 13;

/** One material's worth of the palm, in canonical space: base at the origin,
 *  one unit tall. */
interface Part {
  mesh: Mesh;
  material: Material;
}

/**
 * How far the supplied normals sit from the surface they belong to, in degrees.
 *
 * Computed by asking the geometry what its own normals WOULD be and comparing.
 * A mesh authored the ordinary way scores a few degrees — smoothing groups and
 * split vertices account for that. One authored for image-based lighting scores
 * tens of degrees, because its normals describe the tree's overall volume rather
 * than each blade's facing.
 */
function normalDeviation(geometry: BufferGeometry): number {
  const supplied = geometry.getAttribute('normal');
  if (!supplied) return 0;

  const probe = new BufferGeometry();
  probe.setIndex(geometry.getIndex());
  probe.setAttribute('position', geometry.getAttribute('position'));
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

/** Past this, treat the normals as authored for a lighting rig we do not have. */
const DEVIATION_LIMIT = 35;

/** Replace non-geometric normals with real ones. Returns true if it acted. */
function relight(geometry: BufferGeometry): boolean {
  if (normalDeviation(geometry) < DEVIATION_LIMIT) return false;
  geometry.deleteAttribute('normal');
  // Tangents were authored against the old normals, so they no longer form an
  // orthonormal basis with the new ones. Drop them and let three derive tangents
  // from screen-space derivatives instead — the normal map still works.
  geometry.deleteAttribute('tangent');
  geometry.computeVertexNormals();
  return true;
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
    parts.push({ mesh: new Mesh(geometry, mesh.material), material: mesh.material as Material });
  });

  if (!parts.length) return parts;

  // The trunk is the part that reaches lowest — everything else starts partway
  // up it. Its footprint is what the palm should stand on.
  let trunk = parts[0];
  for (const part of parts) {
    const box = part.mesh.geometry.boundingBox!;
    if (box.min.y < trunk.mesh.geometry.boundingBox!.min.y) trunk = part;
  }
  const trunkBox = trunk.mesh.geometry.boundingBox!;
  const foot = new Vector3(
    (trunkBox.min.x + trunkBox.max.x) / 2,
    trunkBox.min.y,
    (trunkBox.min.z + trunkBox.max.z) / 2,
  );

  // Whole-tree height, measured across every part, so scaling to 1 unit is
  // exact rather than "about right for the trunk".
  const whole = new Box3();
  for (const part of parts) whole.union(part.mesh.geometry.boundingBox!);
  const scale = 1 / Math.max(whole.max.y - foot.y, 1e-6);

  const relit: string[] = [];
  for (const part of parts) {
    part.mesh.geometry.translate(-foot.x, -foot.y, -foot.z);
    part.mesh.geometry.scale(scale, scale, scale);
    if (relight(part.mesh.geometry)) relit.push(part.material.name || '(unnamed)');
    part.mesh.geometry.computeBoundingSphere();
  }
  if (relit.length) {
    console.info(`[palms] recomputed normals for ${relit.join(', ')} — see the note in palms.ts`);
  }
  return parts;
}

export class Palms {
  private readonly meshes: InstancedMesh[] = [];

  private constructor(scene: Scene, parts: Part[], yardRadius: number) {
    // Every part shares one set of transforms, so the five instanced meshes stay
    // welded together into trees.
    const rng = makeRng(0x2c17);
    const dummy = new Object3D();
    const matrices: Array<Object3D['matrix']> = [];

    /*
     * Rejection sampling, not even angular spacing.
     *
     * The obvious loop — `theta = i / PALMS * 2π`, radius random — looks even on
     * paper and clumps badly on screen: trees at very different distances but
     * similar bearings pile up into the same few pixels, so one arc of the
     * horizon is a thicket and the next is bare. Sampling uniformly by AREA and
     * throwing away anything too close to a tree already placed gives the loose,
     * unpatterned spacing a real stand has.
     */
    const placed: Array<[number, number]> = [];
    /**
     * A tint per tree.
     *
     * Every palm here is the same model, and thirty copies of one tree read as
     * wallpaper however you rotate them. `instanceColor` multiplies the base
     * colour map, so a few percent either way — one a little yellower, one a
     * little deeper — breaks the repetition for the cost of three floats. The
     * same tint goes on all five parts of a tree, so a trunk never disagrees
     * with its own crown.
     */
    const tints: Color[] = [];
    const tint = new Color();
    const inner = yardRadius + 6;
    let attempts = 0;
    while (placed.length < PALMS && attempts < PALMS * 60) {
      attempts++;
      // sqrt of a uniform gives uniform-by-area; a linear radius crowds the rim.
      const r = Math.sqrt(range(rng, (inner / REACH) ** 2, 1)) * REACH;
      const theta = rng() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < MIN_GAP)) continue;
      placed.push([x, z]);

      dummy.position.set(x, terrainHeight(x, z) - 0.05, z);
      dummy.rotation.set(
        // A couple of degrees of lean. Real palms are never plumb, and a stand
        // of perfectly vertical ones reads as clip art.
        range(rng, -0.05, 0.05),
        rng() * Math.PI * 2,
        range(rng, -0.05, 0.05),
      );
      dummy.scale.setScalar(bell(rng, HEIGHT[0], HEIGHT[1]));
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());

      // Warm/cool on one axis, brightness on another. Kept narrow: past a few
      // percent it stops being variation and starts being wrong.
      const warm = range(rng, -0.05, 0.06);
      const lift = range(rng, 0.9, 1.08);
      tints.push(tint.setRGB((1 + warm) * lift, lift, (1 - warm) * lift).clone());
    }

    for (const part of parts) {
      const mesh = new InstancedMesh(part.mesh.geometry, part.material, matrices.length);
      mesh.name = `palm-${part.mesh.geometry.uuid.slice(0, 6)}`;
      mesh.castShadow = true;
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

  /**
   * Load the model and plant the palms.
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
    // Materials belong to the loaded glTF and are shared between the parts;
    // three disposes them with the textures when the loader's scene goes.
    this.meshes.length = 0;
  }
}
