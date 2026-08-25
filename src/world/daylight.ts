/**
 * Time of day, as one number. `setTimeOfDay(0)` is dawn, `0.5` is noon, `1`
 * is dusk — and that single call moves the sun, recolours the sky, retints
 * the fog, swings every shadow in the yard and warms the ambient bounce.
 *
 * Everything is interpolated between three keyframes. Adding a fourth (a blue
 * hour after dusk, say) means adding one entry to KEYS and nothing else.
 *
 * Owned by: the world. Module 5 may call `setTimeOfDay` from a slider.
 */

import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Vector3,
  type Scene,
} from 'three';
import type { Sky } from './sky';
import type { Clouds } from './clouds';

interface Key {
  t: number;
  /** Sun elevation above the horizon, degrees. */
  elevation: number;
  /** Sun azimuth, degrees, sweeping east → west. */
  azimuth: number;
  top: number;
  horizon: number;
  sun: number;
  /** Direct sun strength. */
  intensity: number;
  /** Sky bounce strength. */
  ambient: number;
  fog: number;
  /**
   * Haze. `FogExp2`, so this is squared with distance — and it does two jobs at
   * once, which is why it is fussy to tune. Up close it is atmosphere; at 1.3 km
   * it is the only thing hiding the far ground plane's own edge. Thin it out for
   * a clearer aerial shot during the descent and a hard horizon line appears.
   */
  fogDensity: number;
  /** Bounce colour off the ground — Kerala laterite, so it is warm. */
  bounce: number;
  /** The face of a cloud the sun reaches, and the face it doesn't. */
  cloudLit: number;
  cloudShade: number;
  cloudOpacity: number;
}

const KEYS: Key[] = [
  {
    t: 0,
    elevation: 4,
    azimuth: -96,
    top: 0x2f4f74,
    horizon: 0xf0a862,
    sun: 0xffb066,
    intensity: 1.5,
    ambient: 0.45,
    fog: 0xe0b189,
    fogDensity: 0.0021,
    bounce: 0x6b4a32,
    cloudLit: 0xffd4a4,
    cloudShade: 0xa2879e,
    cloudOpacity: 0.9,
  },
  {
    t: 0.5,
    elevation: 66,
    azimuth: 6,
    top: 0x3f7fc4,
    horizon: 0xd3e6f2,
    sun: 0xfff6e6,
    intensity: 3.1,
    ambient: 0.95,
    fog: 0xc9dcec,
    fogDensity: 0.00105,
    bounce: 0x7d6a4e,
    cloudLit: 0xfffdf6,
    cloudShade: 0xb4c3d3,
    cloudOpacity: 0.84,
  },
  {
    t: 1,
    elevation: 3,
    azimuth: 104,
    top: 0x243257,
    horizon: 0xdc7040,
    sun: 0xff8b4a,
    intensity: 1.3,
    ambient: 0.38,
    fog: 0xca8b68,
    fogDensity: 0.0024,
    bounce: 0x5c3b28,
    cloudLit: 0xffb078,
    cloudShade: 0x86708e,
    cloudOpacity: 0.92,
  },
];

/** How far out the sun sits. Only its direction matters for a directional
 *  light — but the shadow camera is positioned from it, so it must be close
 *  enough that the yard fills the shadow map. */
const SUN_DISTANCE = 420;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Daylight {
  readonly sun: DirectionalLight;
  readonly ambient: HemisphereLight;
  readonly direction = new Vector3();

  private readonly scene: Scene;
  private readonly sky: Sky;
  private readonly fog: FogExp2;
  private time = 0.44;

  private readonly cTop = new Color();
  private readonly cHorizon = new Color();
  private readonly cSun = new Color();
  private readonly cFog = new Color();
  private readonly cBounce = new Color();
  private readonly cCloudLit = new Color();
  private readonly cCloudShade = new Color();
  private clouds: Clouds | null = null;

  constructor(scene: Scene, sky: Sky, yardRadius: number) {
    this.scene = scene;
    this.sky = sky;

    this.fog = new FogExp2(0xc9dcec, 0.0016);
    scene.fog = this.fog;

    this.sun = new DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    // One shadow map, and a real trade. It has to cover the courtyard AND the
    // nearest palms, because their long shadows falling across the swept earth
    // are most of what the light does here. Widening it costs sharpness
    // everywhere: at 2048², a 40 m reach is ~4 cm per texel, which is fine on a
    // 9 m disc and would not be if this went much further.
    const reach = Math.min(yardRadius, 150);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -reach;
    this.sun.shadow.camera.right = reach;
    this.sun.shadow.camera.top = reach;
    this.sun.shadow.camera.bottom = -reach;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = SUN_DISTANCE * 2;
    // Slope-scaled bias: without it, a low sun makes the ground shade itself
    // in stripes (shadow acne) across the whole yard.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.ambient = new HemisphereLight(0xffffff, 0x8a7355, 1);
    scene.add(this.ambient);

    this.setTimeOfDay(this.time);
  }

  get timeOfDay(): number {
    return this.time;
  }

  /**
   * The cloud deck is built after the lights are, so it hands itself over here
   * and gets recoloured from then on. Without this the clouds stay noon-white
   * against a dusk sky, which is the single most obvious way to make a sky
   * look composited.
   */
  attachClouds(clouds: Clouds): void {
    this.clouds = clouds;
    this.setTimeOfDay(this.time);
  }

  setTimeOfDay(t: number): void {
    this.time = Math.min(1, Math.max(0, t));

    // Find the pair of keyframes we sit between, and how far along.
    let i = 0;
    while (i < KEYS.length - 2 && this.time > KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const k = (this.time - a.t) / (b.t - a.t);

    const elevation = lerp(a.elevation, b.elevation, k) * (Math.PI / 180);
    const azimuth = lerp(a.azimuth, b.azimuth, k) * (Math.PI / 180);

    this.direction
      .set(
        Math.cos(elevation) * Math.sin(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.cos(azimuth),
      )
      .normalize();

    this.sun.position.copy(this.direction).multiplyScalar(SUN_DISTANCE);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = lerp(a.intensity, b.intensity, k);

    this.cSun.set(a.sun).lerp(new Color(b.sun), k);
    this.sun.color.copy(this.cSun);

    this.cTop.set(a.top).lerp(new Color(b.top), k);
    this.cHorizon.set(a.horizon).lerp(new Color(b.horizon), k);
    this.cBounce.set(a.bounce).lerp(new Color(b.bounce), k);
    this.cFog.set(a.fog).lerp(new Color(b.fog), k);

    this.ambient.intensity = lerp(a.ambient, b.ambient, k);
    this.ambient.color.copy(this.cHorizon);
    this.ambient.groundColor.copy(this.cBounce);

    this.fog.color.copy(this.cFog);
    this.fog.density = lerp(a.fogDensity, b.fogDensity, k);

    this.sky.set(this.cTop, this.cHorizon, this.cSun, this.direction);

    if (this.clouds) {
      this.cCloudLit.set(a.cloudLit).lerp(new Color(b.cloudLit), k);
      this.cCloudShade.set(a.cloudShade).lerp(new Color(b.cloudShade), k);
      this.clouds.setLight(
        this.cCloudLit,
        this.cCloudShade,
        lerp(a.cloudOpacity, b.cloudOpacity, k),
      );
    }

    // The renderer clears to fog colour, so the frame's edges agree with the
    // haze even before the sky sphere draws.
    this.scene.background = null;
  }
}
