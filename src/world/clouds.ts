/**
 * Two decks of drifting cloud — one at 96 m, a thinner one at 340 m.
 *
 * They exist for one moment: the opening descent. The camera comes in from
 * 470 m, and it has to fall past SOMETHING or the drop is just a number
 * changing. Two decks means it falls past something twice, which is what turns
 * a camera move into an arrival.
 *
 * ── The three things that make this read as weather ────────────────────────
 *
 *  1 · Clusters, not a scatter. Puffs are grouped, so the sky has gaps you can
 *      see the ground through.
 *  2 · A tint per puff. One float, and the deck stops being flat white.
 *  3 · Density near the camera. As you approach a deck's altitude its opacity
 *      climbs, so passing through it briefly whites out — the way it does from
 *      a plane window. `setCameraAltitude` is that, and it is the single
 *      cheapest bit of drama in the project.
 *
 * ── The technique worth reading this file for ──────────────────────────────
 *
 * 300 camera-facing quads in ONE draw call. `Sprite` would billboard them for
 * us but a sprite is a draw call each. So: take the instance's translation,
 * throw its rotation away, and add the quad's corner in VIEW space — which is
 * by definition facing the camera. Four lines of vertex shader, and an
 * InstancedMesh becomes 300 sprites.
 *
 * Owned by: the world.
 */

import {
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { bell, makeRng, range } from '../util/rng';

/** The lower deck's altitude, metres. Exported because the camera aims to pass
 *  through it and the descent's shape is tuned around it. */
export const CLOUD_DECK = 96;

interface LayerSpec {
  altitude: number;
  /** Vertical thickness of the deck. */
  thickness: number;
  clusters: number;
  perCluster: number;
  /** Puff size range, metres. */
  size: [number, number];
  /** How far out the deck spreads, and where it wraps. */
  spread: number;
  /** Metres per second of wind. */
  wind: number;
  /** Opacity when the camera is nowhere near it. */
  opacity: number;
}

/*
 * Puff sizes are the number to be careful with. An earlier version used 180-420
 * m puffs for the high deck, and at that scale the texture's own structure is
 * invisible — every puff is a pure gradient, and a deck of them reads as cotton
 * wool laid on a table. Smaller puffs, more of them, is the whole fix: the
 * clumping does the work of making a cloud, not the individual sprite.
 */
const LAYERS: LayerSpec[] = [
  // The one you land under.
  { altitude: CLOUD_DECK, thickness: 24, clusters: 46, perCluster: 8, size: [34, 96], spread: 860, wind: 3.6, opacity: 0.78 },
  // The one you fall through first. Higher, wider, and thinner — it has to
  // read as something you can see the ground through.
  { altitude: 340, thickness: 52, clusters: 34, perCluster: 9, size: [70, 190], spread: 1700, wind: 8.5, opacity: 0.34 },
];

/** A soft puff. Several overlapping blobs, not one clean circle — a perfect
 *  radial gradient reads as a bokeh dot rather than as vapour. */
function puffTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = makeRng(0x3f0d);

  for (let i = 0; i < 16; i++) {
    const r = size * range(rng, 0.1, 0.22);
    const x = size / 2 + range(rng, -0.2, 0.2) * size;
    const y = size / 2 + range(rng, -0.17, 0.17) * size;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const VERT = /* glsl */ `
  attribute float aScale;
  attribute float aTint;
  varying vec2 vUv;
  varying float vTint;

  void main() {
    vUv = uv;
    vTint = aTint;

    vec3 centre = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec4 viewCentre = viewMatrix * vec4(centre, 1.0);
    viewCentre.xy += position.xy * aScale;

    gl_Position = projectionMatrix * viewCentre;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vTint;

  void main() {
    float a = texture2D(uMap, vUv).a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uShade, uLit, vTint), a * uOpacity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface Layer {
  spec: LayerSpec;
  mesh: InstancedMesh;
  uniforms: {
    uMap: { value: CanvasTexture };
    uLit: { value: Color };
    uShade: { value: Color };
    uOpacity: { value: number };
  };
  /** Resting positions; the drift is added on top so nothing accumulates error. */
  home: Float32Array;
  drift: number;
}

export class Clouds {
  private readonly layers: Layer[] = [];
  private readonly texture = puffTexture();
  private readonly dummy = new Object3D();
  /** Multiplies every deck's wind. Ramped up during a descent so the sky
   *  streaks past instead of hanging there. */
  private windBoost = 1;
  /** Time-of-day opacity, before the near-camera boost. */
  private readonly baseOpacity: number[] = [];

  constructor(scene: Scene) {
    for (const spec of LAYERS) {
      const count = spec.clusters * spec.perCluster;
      const rng = makeRng(0x51ee + spec.altitude);

      const uniforms = {
        uMap: { value: this.texture },
        uLit: { value: new Color(0xfffaf0) },
        uShade: { value: new Color(0xb9c6d4) },
        uOpacity: { value: spec.opacity },
      };

      const geometry = new PlaneGeometry(1, 1);
      const scales = new Float32Array(count);
      const tints = new Float32Array(count);
      const home = new Float32Array(count * 3);

      let p = 0;
      for (let c = 0; c < spec.clusters; c++) {
        // Cluster centres uniform by area, so the deck is not densest overhead.
        const r = Math.sqrt(rng()) * spec.spread;
        const theta = rng() * Math.PI * 2;
        const cx = Math.cos(theta) * r;
        const cz = Math.sin(theta) * r;
        const cy = spec.altitude + range(rng, -spec.thickness, spec.thickness);
        const clump = bell(rng, spec.size[0] * 0.7, spec.size[1] * 0.9);

        for (let i = 0; i < spec.perCluster; i++, p++) {
          home[p * 3] = cx + range(rng, -clump, clump);
          home[p * 3 + 1] = cy + range(rng, -spec.thickness * 0.3, spec.thickness * 0.3);
          home[p * 3 + 2] = cz + range(rng, -clump * 0.7, clump * 0.7);
          scales[p] = bell(rng, spec.size[0], spec.size[1]);
          tints[p] = 0.35 + rng() * 0.65;
        }
      }

      geometry.setAttribute('aScale', new InstancedBufferAttribute(scales, 1));
      geometry.setAttribute('aTint', new InstancedBufferAttribute(tints, 1));

      const mesh = new InstancedMesh(
        geometry,
        new ShaderMaterial({
          uniforms,
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          // Soft overlapping quads must not write depth, or every puff punches
          // a hole in the one behind it.
          depthWrite: false,
          blending: NormalBlending,
        }),
        count,
      );
      mesh.name = `clouds-${spec.altitude}`;
      mesh.frustumCulled = false;
      // Furthest transparent thing in the scene: after the sky, before all else.
      // The high deck draws behind the low one.
      mesh.renderOrder = -500 - spec.altitude;
      scene.add(mesh);

      this.layers.push({ spec, mesh, uniforms, home, drift: 0 });
      this.baseOpacity.push(spec.opacity);
      this.write(this.layers[this.layers.length - 1]);
    }
  }

  /** Keep a puff inside its deck: past the far edge it returns at the near one. */
  private static wrap(x: number, spread: number): number {
    const span = spread * 2;
    return ((((x + spread) % span) + span) % span) - spread;
  }

  private write(layer: Layer): void {
    const { mesh, home, spec } = layer;
    for (let p = 0; p < mesh.count; p++) {
      this.dummy.position.set(
        Clouds.wrap(home[p * 3] + layer.drift, spec.spread),
        home[p * 3 + 1],
        home[p * 3 + 2],
      );
      this.dummy.updateMatrix();
      mesh.setMatrixAt(p, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Recolour with the time of day, so the decks belong to the sky they are in. */
  setLight(lit: Color, shade: Color, opacity: number): void {
    this.layers.forEach((layer, i) => {
      layer.uniforms.uLit.value.copy(lit);
      layer.uniforms.uShade.value.copy(shade);
      // The high deck is always thinner than the low one, whatever the hour.
      this.baseOpacity[i] = opacity * (layer.spec.opacity / LAYERS[0].opacity);
    });
  }

  /** 1 is still air. The descent ramps this up so the sky streaks past. */
  setWindBoost(multiplier: number): void {
    this.windBoost = Math.max(0, multiplier);
  }

  update(dt: number, cameraY: number): void {
    this.layers.forEach((layer, i) => {
      layer.drift += layer.spec.wind * this.windBoost * dt;
      this.write(layer);

      // Density near the camera. Inside the deck's band the puffs thicken to
      // near-white; a hundred metres away they are back to normal. This is
      // what makes falling through one feel like passing through weather.
      const distance = Math.abs(cameraY - layer.spec.altitude);
      const inside = 1 - Math.min(1, distance / (layer.spec.thickness * 4));
      // A modest boost. Push it further and passing through a deck is a white
      // frame, which is not "flying through cloud", it is a flash cut.
      layer.uniforms.uOpacity.value = this.baseOpacity[i] * (1 + inside * 0.9);
    });
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.mesh.geometry.dispose();
      (layer.mesh.material as ShaderMaterial).dispose();
      layer.mesh.dispose();
    }
    this.texture.dispose();
  }
}
