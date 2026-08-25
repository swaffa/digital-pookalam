/**
 * The നിലവിളക്ക്, on a flat laterite stone beside the kalam — the one
 * hand-placed object in the world. Everything else is scattered by a seeded
 * RNG; this stands at a chosen spot, just off the northern edge of the swept
 * apron, the way one is actually set down next to a pookalam rather than on it.
 *
 * It is also the only object that moves every frame: the flame flickers, and
 * so does the light it throws. That is what stops a static scene from reading
 * as a photograph.
 *
 * Owned by: the world.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector2,
  type Scene,
} from 'three';

/** Metres. Knee-high, which is what a നിലവിളക്ക് actually is — the camera
 *  now gets within a few metres of it, so an oversized one reads as a prop. */
const HEIGHT = 1.15;

/** Where it stands: just off the northern edge of the swept apron, the way
 *  one is set down beside a real pookalam rather than on top of it. */
export const LAMP_POSITION: [number, number] = [0, -7.1];

/**
 * The lamp's silhouette, as a half-profile revolved around the y axis. Radius
 * and height are in units of HEIGHT, so the whole lamp scales from one number.
 *
 * A LatheGeometry from thirteen points is the cheapest way to get something
 * that reads as cast brass. Turning the shape into a model in Blender would
 * have cost an asset pipeline for no more detail than this.
 */
const PROFILE: Array<[number, number]> = [
  [0.0, 0.0],
  [0.15, 0.0],
  [0.15, 0.02],
  [0.1, 0.04],
  [0.035, 0.07],
  [0.025, 0.2],
  [0.05, 0.34],
  [0.03, 0.4],
  [0.028, 0.62],
  [0.06, 0.66],
  [0.075, 0.7],
  [0.16, 0.78],
  [0.175, 0.86],
  [0.12, 0.84],
  [0.05, 0.8],
  [0.0, 0.8],
];

/** A soft radial blob, for the flame and its halo. */
function flameTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,235,1)');
  gradient.addColorStop(0.22, 'rgba(255,214,120,0.92)');
  gradient.addColorStop(0.55, 'rgba(240,140,40,0.32)');
  gradient.addColorStop(1, 'rgba(240,120,20,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class Lamp {
  readonly brass: Mesh;
  readonly pedestal: Mesh;
  readonly flame: Sprite;
  readonly light: PointLight;

  private elapsed = 0;

  constructor(scene: Scene) {
    // A flat laterite stone to stand it on, so the brass is not sitting in
    // the dirt.
    this.pedestal = new Mesh(
      new CylinderGeometry(0.44, 0.5, 0.1, 28, 1),
      new MeshStandardMaterial({ color: 0x9a7b62, roughness: 0.95 }),
    );
    this.pedestal.position.set(LAMP_POSITION[0], 0.05, LAMP_POSITION[1]);
    this.pedestal.castShadow = true;
    this.pedestal.receiveShadow = true;
    this.pedestal.name = 'lamp-pedestal';
    scene.add(this.pedestal);

    const points = PROFILE.map(([r, y]) => new Vector2(r * HEIGHT, y * HEIGHT));
    this.brass = new Mesh(
      new LatheGeometry(points, 44),
      new MeshStandardMaterial({
        color: 0xb98a34,
        roughness: 0.34,
        metalness: 0.85,
      }),
    );
    this.brass.position.set(LAMP_POSITION[0], 0.1, LAMP_POSITION[1]);
    this.brass.castShadow = true;
    this.brass.receiveShadow = true;
    this.brass.name = 'lamp';
    scene.add(this.brass);

    this.flame = new Sprite(
      new SpriteMaterial({
        map: flameTexture(),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        // Additive sprites must not be fogged towards the fog colour, or the
        // flame turns into a grey smudge at distance.
        fog: false,
      }),
    );
    this.flame.position.set(LAMP_POSITION[0], 0.1 + HEIGHT * 0.86, LAMP_POSITION[1]);
    this.flame.scale.set(0.3, 0.42, 1);
    this.flame.name = 'lamp-flame';
    scene.add(this.flame);

    this.light = new PointLight(0xffb35c, 6, 11, 2);
    this.light.position.copy(this.flame.position);
    // No shadow map: a point light shadow is six render passes, and this
    // light exists to tint the pedestal, not to define form.
    this.light.castShadow = false;
    scene.add(this.light);
  }

  /** Called from the world's frame loop. */
  update(dt: number): void {
    this.elapsed += dt;
    // Three sines at unrelated frequencies read as a flicker; one sine reads
    // as a pulse, and a random number per frame reads as a strobe.
    const flicker =
      Math.sin(this.elapsed * 11.3) * 0.5 +
      Math.sin(this.elapsed * 4.1) * 0.3 +
      Math.sin(this.elapsed * 23.7) * 0.2;
    this.flame.scale.set(0.3 + flicker * 0.022, 0.42 + flicker * 0.05, 1);
    this.light.intensity = 6 + flicker * 1.8;
  }

  dispose(): void {
    this.brass.geometry.dispose();
    (this.brass.material as MeshStandardMaterial).dispose();
    this.pedestal.geometry.dispose();
    (this.pedestal.material as MeshStandardMaterial).dispose();
    const flameMaterial = this.flame.material as SpriteMaterial;
    flameMaterial.map?.dispose();
    flameMaterial.dispose();
  }
}
