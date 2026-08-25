/**
 * The camera. One kalam to look at, so this file is mostly about the twenty
 * seconds around arriving.
 *
 * ── The opening ────────────────────────────────────────────────────────────
 *
 * The app has one screen, so it gets one entrance. `intro()` is it, and it is
 * the most important animation in the project: five seconds that turn a page
 * load into arriving somewhere. Every part of it is deliberate:
 *
 *   · it starts 470 m up and 580 m out, above BOTH cloud decks, coming in at
 *     an angle — so the frame has a horizon in it and the courtyard is a coin
 *     on the ground far below, not a dot in a green wash.
 *   · it falls PAST things. Through the high cirrus at 340 m, then through the
 *     low deck at 96 m, and each deck thickens as you approach it
 *     (`clouds.ts` → `update`). Falling past nothing is a number changing.
 *   · it follows a CUBIC curve, not a straight line and not a simple arc. The
 *     first control point sits almost directly below the start, so the move
 *     BEGINS as a drop; the second sits out beyond the resting pose and above
 *     it, so it ENDS as a long shallow glide. A plane landing, not a lift.
 *   · it banks. About six degrees of roll, easing to level as it settles. Roll
 *     is the one cue that says "this is a flight" rather than "this is a
 *     camera on rails", and nobody ever notices it consciously.
 *   · the wind picks up. Cloud drift ramps to 5× through the middle, so the
 *     sky streaks past instead of hanging there.
 *   · the lens opens 10° through the middle and comes back. Nobody can name
 *     ten degrees, but it is the difference between being moved and moving.
 *   · it cannot be interrupted. Every other camera move here yields to the
 *     visitor instantly; a stray wheel event halfway down would leave them
 *     hanging in the sky with the controls configured for the ground.
 *
 * Owned by: the world. Modules go through WorldAPI.
 */

import { PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { terrainHeight } from './terrain';
import { KALAM_RADIUS } from './yard';

const BASE_FOV = 52;
/** Degrees the lens opens through the middle of the opening flight. */
const FOV_KICK = 10;
/** Radians of bank at the steepest part of a descent. ~6°. */
const ROLL = 0.105;
/** How much faster the clouds run through the middle of a descent. */
const WIND_RUSH = 5;

/**
 * Where the descent begins: 470 m up and 580 m out, above both cloud decks.
 *
 * The angle is the point. An earlier version started almost directly overhead,
 * and looking straight down at 600 m gets you a flat green wash with a dot in
 * it — no sky, no horizon, no sense of height. Coming in obliquely puts the
 * horizon in the top of the frame, the cloud tops in the middle and the
 * courtyard below, which is what an approach actually looks like.
 */
const SKY_POSE = new Vector3(150, 470, 560);
/** What the camera looks at while it is still high up. Above the ground, so
 *  the horizon sits high in frame rather than the view being all floor. */
const SKY_TARGET = new Vector3(0, 46, 0);
/*
 * There is no matching `close()`. There used to be — the camera climbed back
 * out to a grid of other courtyards. There is no grid any more, so the only
 * way out of this world is the back button, and a flight to nowhere is dead
 * code that still has to be maintained.
 */
/**
 * Where it ends, on a landscape screen: standing back from the kalam, looking
 * down into it. On a narrow screen the camera pulls further back along the same
 * line — see `restPose()`.
 */
const REST_POSE = new Vector3(6.4, 5.4, 11.2);
const REST_TARGET = new Vector3(0, 0.35, 0);
/** How much of the frame the kalam should fill at rest. 1 would touch the edges. */
const FRAMING = 1.32;

/** How long the descent takes. Long enough to be a journey, short enough that
 *  a visitor opening their fourth courtyard does not resent it. */
const DESCENT_SECONDS = 5.2;

/** A 620 m swooping fall with a bank in it is exactly the kind of motion this
 *  setting exists to switch off. When it is set, the camera simply arrives. */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Seconds of stillness before the camera drifts on its own. */
const IDLE_AFTER = 20;
const IDLE_SPEED = 1.4;
const FLOOR_CLEARANCE = 0.9;
/** How far from the kalam a visitor may wander before being reeled back. The
 *  courtyard is 16 m; past its edge there is nothing to look at. */
const LEASH = 19;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Flight {
  fromPosition: Vector3;
  fromTarget: Vector3;
  /** Bézier control points: one for a quadratic, two for a cubic, none for a
   *  straight lerp. The descent wants two — see the header. */
  via: Vector3[];
  toPosition: Vector3;
  toTarget: Vector3;
  seconds: number;
  elapsed: number;
  /** A locked flight ignores visitor input until it lands. */
  locked: boolean;
  fov: boolean;
  /** Bank into the move, and rush the clouds through it. */
  cinematic: boolean;
  resolve: () => void;
}

/** de Casteljau, for 0, 1 or 2 control points. Fewer branches than three
 *  separate polynomial forms, and it reads like what it is. */
function bezier(out: Vector3, points: Vector3[], k: number): void {
  const work = points.map((p) => p.clone());
  for (let n = work.length - 1; n > 0; n--) {
    for (let i = 0; i < n; i++) work[i].lerp(work[i + 1], k);
  }
  out.copy(work[0]);
}

export class Director {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;

  private flight: Flight | null = null;
  private idleFor = 0;
  private readonly scratch = new Vector3();
  /** Set by the world once the decks exist, so a descent can stir them. */
  private wind: ((multiplier: number) => void) | null = null;
  /** Bank, in radians. Applied after the controls have aimed the camera. */
  private roll = 0;

  constructor(renderer: WebGLRenderer) {
    this.camera = new PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 4200);
    this.camera.position.copy(SKY_POSE);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.copy(SKY_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.zoomSpeed = 0.85;
    this.controls.rotateSpeed = 0.8;
    this.controls.panSpeed = 0.7;
    // Straight down is allowed on purpose: overhead is how a pookalam is
    // photographed, and it is the view a group will want of their own.
    this.controls.minPolarAngle = 0.02;
    // Stop just short of the horizon — past this you see the seam where the
    // ground plane ends and the fog has not yet taken over.
    this.controls.maxPolarAngle = 1.5;
    this.controls.minDistance = 3.4;
    this.controls.maxDistance = 34;
    this.controls.screenSpacePanning = false;

    for (const event of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) {
      renderer.domElement.addEventListener(event, () => this.interrupt(), { passive: true });
    }
  }

  /**
   * The resting camera position for the CURRENT aspect ratio.
   *
   * A 9-metre disc that frames nicely on a laptop runs off both edges of a
   * phone held upright: the vertical field of view is fixed, so a tall narrow
   * viewport has a much narrower horizontal one. So work out which axis is
   * tighter, and push the camera back along the same line until the kalam fits
   * in it. Same shot, same angle, more distance.
   */
  private restPose(): Vector3 {
    const halfV = (this.camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const needed = (KALAM_RADIUS * FRAMING) / Math.tan(Math.min(halfV, halfH));
    const scale = Math.max(1, needed / REST_POSE.length());
    const pose = REST_POSE.clone().multiplyScalar(scale);
    // Having pulled back, also climb. Straight scaling keeps the elevation at
    // 23°, which on a tall phone spends the bottom half of the frame on bare
    // foreground. A pookalam is a thing you look DOWN at, so the further back
    // the frame forces us, the steeper the angle gets.
    pose.y *= 1 + (scale - 1) * 0.55;
    return pose;
  }

  /** The world hands over the cloud deck's wind control after building it. */
  attachWind(setWind: (multiplier: number) => void): void {
    this.wind = setWind;
  }

  private launch(flight: Omit<Flight, 'elapsed' | 'resolve'>): Promise<void> {
    return new Promise<void>((resolve) => {
      if (flight.locked) this.controls.enabled = false;
      this.flight = { ...flight, elapsed: 0, resolve };
    });
  }

  /** Put the camera back in the sky with no animation, ready to descend. */
  reset(): void {
    this.flight = null;
    this.controls.enabled = true;
    this.camera.position.copy(SKY_POSE);
    this.controls.target.copy(SKY_TARGET);
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.idleFor = 0;
  }

  /** The descent. Played once, when the app opens. */
  intro(seconds = DESCENT_SECONDS): Promise<void> {
    const rest = this.restPose();
    if (reducedMotion()) {
      this.camera.position.copy(rest);
      this.controls.target.copy(REST_TARGET);
      return Promise.resolve();
    }
    const from = this.camera.position.clone();

    // Control point 1: most of the height gone, barely any of the distance.
    // Pulls the first third of the curve into a steep sink.
    const c1 = new Vector3(from.x * 0.82, from.y * 0.3, from.z * 0.82);
    // Control point 2: out past the resting pose and above it. Pulls the last
    // third into a long shallow glide in, instead of a stop.
    const c2 = new Vector3(rest.x * 3.1, rest.y + 34, rest.z * 3.1);

    return this.launch({
      fromPosition: from,
      fromTarget: SKY_TARGET.clone(),
      via: [c1, c2],
      toPosition: rest,
      toTarget: REST_TARGET.clone(),
      seconds,
      locked: true,
      fov: true,
      cinematic: true,
    });
  }

  /**
   * Glide to a comfortable look at a point on the kalam — for "show me the
   * ring I just filled". Interruptible: the visitor always wins.
   */
  lookAt(x: number, z: number, opts: { seconds?: number; distance?: number } = {}): Promise<void> {
    const distance = opts.distance ?? 6;
    const target = new Vector3(x, terrainHeight(x, z) + 0.2, z);
    // Approach from the direction the camera already lies in, so the world
    // does not appear to spin around the visitor on arrival.
    const approach = this.scratch.subVectors(this.camera.position, target).setY(0);
    if (approach.lengthSq() < 0.01) approach.set(0.6, 0, 0.8);
    approach.normalize().multiplyScalar(distance);

    return this.launch({
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      via: [],
      toPosition: target.clone().add(approach).setY(target.y + distance * 0.55),
      toTarget: target,
      seconds: opts.seconds ?? 1.5,
      locked: false,
      fov: false,
      cinematic: false,
    });
  }

  /** Cancel whatever the camera was doing by itself. Locked flights ignore it. */
  private interrupt(): void {
    this.idleFor = 0;
    if (!this.flight || this.flight.locked) return;
    // Resolve rather than reject: callers await this to learn "the camera has
    // settled", and a cancelled flight has settled — just not there.
    this.flight.resolve();
    this.flight = null;
  }

  update(dt: number): void {
    if (this.flight) {
      const flight = this.flight;
      flight.elapsed += dt;
      const t = Math.min(1, flight.elapsed / flight.seconds);
      const k = easeInOutCubic(t);

      bezier(this.camera.position, [flight.fromPosition, ...flight.via, flight.toPosition], k);
      // The target eases on a DIFFERENT curve to the position — later and
      // faster. The camera spends the first half of the drop still looking
      // straight down, then swings its gaze up to the horizon as it flattens
      // out. Ease them together and the whole move reads as one flat pan.
      const gaze = easeInOutCubic(Math.min(1, Math.max(0, (t - 0.22) / 0.78)));
      this.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, gaze);

      if (flight.fov) {
        this.camera.fov = BASE_FOV + Math.sin(Math.PI * t) * FOV_KICK;
        this.camera.updateProjectionMatrix();
      }
      if (flight.cinematic) {
        // Bank hardest just past the halfway point, level by the end.
        this.roll = ROLL * Math.sin(Math.PI * t ** 0.78);
        this.wind?.(1 + Math.sin(Math.PI * t) * (WIND_RUSH - 1));
      }

      if (t >= 1) {
        this.flight = null;
        this.roll = 0;
        if (flight.fov) {
          this.camera.fov = BASE_FOV;
          this.camera.updateProjectionMatrix();
        }
        if (flight.cinematic) this.wind?.(1);
        if (flight.locked) this.controls.enabled = true;
        this.idleFor = 0;
        flight.resolve();
      }
    } else {
      this.idleFor += dt;
      if (this.idleFor > IDLE_AFTER) {
        // Rotate about the target by hand rather than with `autoRotate`, so
        // the drift eases in under the same damping as everything else.
        const angle = ((IDLE_SPEED * Math.PI) / 180) * dt;
        const offset = this.scratch.subVectors(this.camera.position, this.controls.target);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.camera.position.set(
          this.controls.target.x + offset.x * cos - offset.z * sin,
          this.camera.position.y,
          this.controls.target.z + offset.x * sin + offset.z * cos,
        );
      }
    }

    if (this.flight?.locked) {
      // A scripted flight aims the camera itself, and MUST NOT go through the
      // controls.
      //
      // `OrbitControls.update()` clamps the camera's distance from its target
      // to [minDistance, maxDistance] on every call — and `enabled = false`
      // only stops it listening to input, not doing that. Ours caps at 34 m, so
      // routing the descent through it silently truncated a 620 m fall into a
      // 34 m one. The clouds still went past; there was just far less sky.
      this.camera.lookAt(this.controls.target);
    } else {
      this.controls.update();
    }

    // Roll goes on last, because whichever branch ran above has just re-aimed
    // the camera and would have wiped it. Applying it here is idempotent for
    // exactly that reason.
    if (this.roll !== 0) this.camera.rotateZ(this.roll);

    // Two clamps the controls cannot express, applied after update so damping
    // has already had its say and cannot fight them.
    if (!this.flight) {
      const floor = terrainHeight(this.camera.position.x, this.camera.position.z) + FLOOR_CLEARANCE;
      if (this.camera.position.y < floor) this.camera.position.y = floor;
    }
    const wander = Math.hypot(this.controls.target.x, this.controls.target.z);
    if (wander > LEASH) {
      const pull = LEASH / wander;
      this.controls.target.x *= pull;
      this.controls.target.z *= pull;
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // Turning a phone sideways changes which axis is the tight one. Nudge the
    // camera out along its own view line if the kalam no longer fits — never
    // in, because pulling the frame tighter than the visitor chose would be
    // taking their zoom away.
    if (this.flight) return;
    const needed = this.restPose().length();
    const offset = this.scratch.subVectors(this.camera.position, this.controls.target);
    if (offset.length() >= needed) return;
    this.camera.position.copy(this.controls.target).addScaledVector(
      offset.normalize(),
      Math.min(needed, this.controls.maxDistance),
    );
  }

  dispose(): void {
    this.controls.dispose();
  }
}
