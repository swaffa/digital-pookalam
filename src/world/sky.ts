/**
 * The sky: one inside-out sphere with a gradient on it, plus a sun disc drawn
 * in the shader. No cubemap, no HDRI, nothing to download — which is the
 * point. The whole atmosphere is four colours and a dot product.
 *
 * Owned by: the world. `daylight.ts` drives the uniforms.
 */

import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type Scene,
  type Vector3,
} from 'three';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);

    // Vertical gradient. The 0.42 exponent keeps the horizon band thin and
    // the zenith broad, which is how a real sky reads.
    float up = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(up, 0.42));

    // The sun. Two powers of the same dot product: a hard disc and a wide
    // bloom around it.
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(d, 900.0) * 6.0;
    col += uSunColor * pow(d, 6.0) * 0.22;

    // Below the horizon: dust and haze, not more sky.
    col = mix(uHorizon * 0.62, col, smoothstep(-0.20, 0.03, dir.y));

    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  readonly mesh: Mesh;
  private readonly uniforms;

  constructor(scene: Scene, radius = 2600) {
    // No colour conversion anywhere in this file: three's ColorManagement is
    // on by default, so `new Color(0xRRGGBB)` has ALREADY converted sRGB to
    // the linear working space. Converting again is the classic three.js
    // colour bug — everything comes out dark and oversaturated.
    this.uniforms = {
      uTop: { value: new Color(0x4a86c8) },
      uHorizon: { value: new Color(0xcfe3f0) },
      uSunColor: { value: new Color(0xfff4e0) },
      uSunDir: { value: { x: 0.3, y: 0.6, z: 0.5 } },
    };

    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      // Nothing behind the sky, so it never needs to be sorted or fogged.
      fog: false,
      toneMapped: true,
    });

    this.mesh = new Mesh(new SphereGeometry(radius, 32, 20), material);
    this.mesh.name = 'sky';
    // The sky must never be culled out by the frustum test — it IS the frustum.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  /** Called by `daylight.ts` on every time-of-day change. */
  set(top: Color, horizon: Color, sunColor: Color, sunDir: Vector3): void {
    this.uniforms.uTop.value.copy(top);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSunDir.value = sunDir;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
