/**
 * One wind, shared by everything that should move in it.
 *
 * ── Why this is a file and not three separate animations ───────────────────
 *
 * The palms, the grass and the clouds all have to agree. If the fronds lean
 * east while the clouds run north, the scene stops being a place and becomes
 * three animations sharing a screen — and nobody can say why it looks wrong,
 * only that it does. So there is one direction, one clock and one gust curve,
 * and all three read them.
 *
 * ── How the trees actually bend ───────────────────────────────────────────
 *
 * On the GPU, in the vertex shader, because the alternative is moving 126 trees
 * of geometry on the CPU every frame and that is not a thing anyone should do.
 *
 * `applySway` patches a material through `onBeforeCompile`, replacing three's
 * `project_vertex` chunk so it can add a displacement in WORLD space — after the
 * instance matrix has been applied, but before the view matrix. That position is
 * the only place the offset can go: do it before instancing and every tree bends
 * along its own rotated axis instead of downwind.
 *
 * Two properties of our geometry make the shader cheap:
 *
 *   · `palms.ts` and `grass.ts` normalise every model to exactly ONE UNIT TALL,
 *     so `transformed.y` is already the fraction of the way up the plant — which
 *     is precisely the number a bend curve wants. No extra attribute needed.
 *   · the instance matrix carries the real height in its scale, so amplitude
 *     scales with the plant for free. A 15 m palm sways further than an 8 m one
 *     because it is bigger, not because anything says so.
 *
 * The bend is quadratic in height: a trunk is a cantilever, so it barely moves
 * at the base and most of the motion is in the top third. Linear looks like the
 * whole tree is sliding sideways.
 *
 * Owned by: the world.
 */

import { Vector2, type Material, type WebGLRenderer } from 'three';

/** The subset of three's onBeforeCompile argument this file touches. Typed
 *  locally because `Shader` is not part of three's public type surface. */
interface ShaderPatch {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** Shared uniform objects. The SAME object is spliced into every patched
 *  material's uniform set, so writing `.value` once moves everything. */
const uniforms = {
  uWindDir: { value: new Vector2(0.82, 0.57).normalize() },
  uWindTime: { value: 0 },
  /** Gust multiplier, around 1. */
  uWindGust: { value: 1 },
};

export class Wind {
  /** Where it blows, on the ground plane. Read-only in practice. */
  get direction(): Vector2 {
    return uniforms.uWindDir.value;
  }

  /** Multiplies the gust curve. The descent pushes this up so the sky rushes. */
  boost = 1;

  private elapsed = 0;

  update(dt: number): void {
    this.elapsed += dt;
    uniforms.uWindTime.value = this.elapsed;
    /*
     * Gusts from two slow sines at unrelated periods — about 30 s and 90 s.
     * One sine is a pulse and reads as machinery; two that never quite line up
     * read as weather. Floored at 0.35 so the air is never completely still,
     * because a scene that stops moving looks broken rather than calm.
     */
    const gust =
      1 +
      Math.sin(this.elapsed * 0.21) * 0.5 +
      Math.sin(this.elapsed * 0.071 + 1.3) * 0.28;
    uniforms.uWindGust.value = Math.max(0.35, gust) * this.boost;
  }

  /** What the clouds should multiply their drift by this frame. */
  get gust(): number {
    return uniforms.uWindGust.value;
  }
}

export interface SwayOptions {
  /**
   * Lean at the top of the plant, as a fraction of its height. 0.02 gives a
   * 15 m palm about 30 cm of travel at the crown, which is a stiff breeze.
   */
  amplitude: number;
  /** Beats per second of the main lean. Grass is quicker than a palm. */
  speed: number;
  /**
   * Extra flutter for anything held out away from the trunk, as a fraction of
   * its distance from the axis. Zero on the trunk itself for free, because the
   * trunk IS the axis — no need to tell the shader which mesh it is.
   */
  flutter: number;
}

/**
 * Make a material's geometry bend in the wind.
 *
 * Call once per material. Safe on materials shared between meshes; call it twice
 * on the same one and you get the patch twice, so don't.
 */
export function applySway(material: Material, options: SwayOptions): void {
  const { amplitude, speed, flutter } = options;

  material.onBeforeCompile = (shader: ShaderPatch, _renderer: WebGLRenderer) => {
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindGust = uniforms.uWindGust;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform vec2 uWindDir;
        uniform float uWindTime;
        uniform float uWindGust;
      `,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 mvPosition = vec4( transformed, 1.0 );

        #ifdef USE_INSTANCING
          // Height in metres lives in the instance scale, so amplitude follows
          // the plant's real size without anything having to pass it in.
          float wHeight = length( instanceMatrix[ 1 ].xyz );
          vec3 wOrigin = instanceMatrix[ 3 ].xyz;

          mvPosition = instanceMatrix * mvPosition;

          // Per-plant phase from where it stands. Free, and it stops 126 palms
          // leaning in lockstep like a chorus line.
          float wPhase = dot( wOrigin.xz, vec2( 0.031, 0.047 ) );
          float wT = uWindTime * ${speed.toFixed(3)};

          // The lean: a slow swing plus a faster shiver on top.
          float wSway = sin( wT + wPhase ) * 0.62 + sin( wT * 2.7 + wPhase * 1.7 ) * 0.24;

          // Quadratic in height — a trunk is a cantilever, so the base barely
          // moves and the top does nearly all of it.
          float wBend = clamp( transformed.y, 0.0, 1.0 );
          wBend *= wBend;

          mvPosition.xz += uWindDir * ( wBend * wHeight * ${amplitude.toFixed(4)} * wSway * uWindGust );

          // Flutter for anything reaching away from the axis. The trunk sits on
          // the axis, so this is zero there without a branch.
          float wTip = length( transformed.xz );
          float wFlick = sin( wT * 3.9 + wPhase * 2.3 + wTip * 9.0 );
          mvPosition.xz += uWindDir * ( wTip * wHeight * ${flutter.toFixed(4)} * wFlick * uWindGust );
          mvPosition.y -= abs( wFlick ) * wTip * wHeight * ${(flutter * 0.35).toFixed(4)};
        #endif

        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `,
      );
  };

  /*
   * Without this, three caches shader programs by material type and defines —
   * so a swaying material and a still one with the same settings would share a
   * compiled program, and whichever compiled first would win. The key has to
   * differ for every distinct patch.
   */
  material.customProgramCacheKey = () => `sway:${amplitude}:${speed}:${flutter}`;
  material.needsUpdate = true;
}
