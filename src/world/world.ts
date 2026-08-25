/**
 * ════════════════════════════════════════════════════════════════════════
 *  THE WORLD
 * ════════════════════════════════════════════════════════════════════════
 *
 * Renderer, scene, courtyard, sky, camera, loop — and the `WorldAPI` surface
 * every module talks to. This is the file to read first and the one you will
 * touch least.
 *
 * The shape of it:
 *
 *   new World(container)     renderer, scene, camera. Cheap. Synchronous.
 *   await world.build(cb)    everything you can see, in stages, yielding to
 *                            the browser between them so the loading veil
 *                            actually animates
 *   await world.start()      the frame loop begins, and the camera falls out
 *                            of the sky — 620 m, through two cloud decks, in
 *                            five seconds (world/camera.ts)
 *
 * Why `build` is async and staged: putting the two ground meshes, the clouds
 * and the courtyard together is ~250 ms of blocking work. Do it in one go and
 * the progress bar jumps from 0 to 100 in a single frozen frame — which reads
 * as a hang, not as speed.
 *

 * Owned by: the world (that's this). Adding to WorldAPI is a group decision;
 * see docs/conventions.md §3.
 */

import {
  ACESFilmicToneMapping,
  Clock,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Texture,
} from 'three';
import type { KalamPoint, WorldAPI, WorldEvents } from '../contracts';
import { Emitter, type Unsubscribe } from '../util/events';
import { terrainHeight } from './terrain';
import { Sky } from './sky';
import { Daylight } from './daylight';
import { Ground } from './ground';
import { Clouds } from './clouds';
import { Lamp } from './lamp';
import { Yard, KALAM_RADIUS } from './yard';
import { Director } from './camera';

type Stage = { at: number; label: string; run: () => void };

/** Hand the browser a frame, so a progress bar can paint between stages. */
const yieldToBrowser = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export class World implements WorldAPI {
  readonly scene = new Scene();
  readonly renderer: WebGLRenderer;
  readonly events = new Emitter<WorldEvents>();
  readonly kalamRadius = KALAM_RADIUS;

  private readonly director: Director;
  private readonly clock = new Clock();
  private readonly frameCallbacks = new Set<(dt: number, elapsed: number) => void>();

  private daylight!: Daylight;
  private ground!: Ground;
  private clouds!: Clouds;
  private lamp!: Lamp;
  private yard!: Yard;

  /** Latest pointer position in NDC, and whether it is worth raycasting. */
  private readonly pointer = new Vector2();
  private pointerFresh = false;
  private readonly raycaster = new Raycaster();
  /** Where a press began, so a drag is not mistaken for a tap. */
  private pressAt: { x: number; y: number; time: number } | null = null;
  private hovering = false;

  private running = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      // M6 needs to read the canvas back after a frame; without this the
      // buffer may already be cleared by the time it looks.
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Retina phones report 3 and even 4. Past 2 the cost is quadratic and
    // nobody can see it.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Filmic tone mapping, because the lamp and the noon sun both blow out
    // without it and a pookalam's reds are the first thing to go.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.director = new Director(this.renderer);

    window.addEventListener('resize', this.onResize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
    canvas.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
  }

  get camera() {
    return this.director.camera;
  }

  /* ── build ─────────────────────────────────────────────────────────────── */

  /**
   * Assemble the courtyard. `onProgress` is called with 0..1 and a label you
   * can show on the veil.
   */
  async build(onProgress?: (fraction: number, label: string) => void): Promise<void> {
    const stages: Stage[] = [
      {
        at: 0.14,
        label: 'raising the sky',
        run: () => {
          const sky = new Sky(this.scene);
          this.daylight = new Daylight(this.scene, sky, 22);
        },
      },
      {
        at: 0.56,
        label: 'levelling the മുറ്റം',
        run: () => {
          this.ground = new Ground(this.scene);
        },
      },
      {
        at: 0.78,
        label: 'rolling in the clouds',
        run: () => {
          this.clouds = new Clouds(this.scene);
          this.daylight.attachClouds(this.clouds);
          // The descent stirs the sky. Handed over rather than reached for, so
          // the camera never has to know what a cloud is.
          this.director.attachWind((multiplier) => this.clouds.setWindBoost(multiplier));
        },
      },
      {
        at: 0.93,
        label: 'lighting the വിളക്ക്',
        run: () => {
          this.lamp = new Lamp(this.scene);
        },
      },
      {
        at: 1,
        label: 'sweeping the ground',
        run: () => {
          this.yard = new Yard(this.scene);
        },
      },
    ];

    for (const stage of stages) {
      onProgress?.(stage.at - 0.07, stage.label);
      await yieldToBrowser();
      stage.run();
      onProgress?.(stage.at, stage.label);
    }

    // Compile shaders now, while the veil is still up. Skip this and the first
    // frame of the descent costs 300 ms — exactly when the camera is moving
    // fastest and a stutter is most visible.
    this.renderer.compile(this.scene, this.camera);
  }

  /* ── the loop ──────────────────────────────────────────────────────────── */

  /**
   * Start rendering, and fly the opening descent.
   *
   * The order matters: the loop begins BEFORE the descent, so the first frame
   * anybody sees is already moving. A still first frame reads as a screenshot.
   */
  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this.frame);
    this.events.emit('ready', undefined);

    this.director.reset();
    return this.director.intro().then(() => {
      this.events.emit('arrived', undefined);
    });
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  onFrame(cb: (dt: number, elapsed: number) => void): Unsubscribe {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  private frame = (): void => {
    // Clamp the delta: a backgrounded tab returns with a delta of several
    // seconds, and every animation in the project would jump.
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.elapsedTime;

    this.director.update(dt);
    this.lamp.update(dt);
    this.clouds.update(dt, this.camera.position.y);

    // Hover is resolved once per frame, not once per pointer event — a mouse
    // fires far more often than the screen refreshes.
    if (this.pointerFresh) {
      this.pointerFresh = false;
      const at = this.pickKalam();
      if (at || this.hovering) {
        this.hovering = at !== null;
        this.events.emit('kalam:hover', at);
      }
    }

    for (const cb of this.frameCallbacks) {
      try {
        cb(dt, elapsed);
      } catch (err) {
        // A module's bug must not stop the world from rendering.
        console.error('[world] frame callback threw:', err);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  /* ── picking ───────────────────────────────────────────────────────────── */

  /** The pointer, as a point on the kalam's canvas. Null if it missed. */
  private pickKalam(): KalamPoint | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.yard.pick(this.raycaster);
  }

  private setPointer(event: PointerEvent): void {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.setPointer(event);
    this.pointerFresh = true;
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pressAt = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private onPointerUp = (event: PointerEvent): void => {
    const press = this.pressAt;
    this.pressAt = null;
    if (!press) return;
    // A tap is short and still. Anything else was an orbit, and orbiting to a
    // stop over the kalam must not fill a region.
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > 8 || performance.now() - press.time > 500) return;

    this.setPointer(event);
    const at = this.pickKalam();
    if (at) this.events.emit('kalam:pick', at);
  };

  private onPointerLeave = (): void => {
    if (!this.hovering) return;
    this.hovering = false;
    this.events.emit('kalam:hover', null);
  };

  private onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.director.resize(width / height);
    this.events.emit('resize', width / height);
  };

  /* ── WorldAPI ──────────────────────────────────────────────────────────── */

  groundHeight(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  /** Canvas coordinates → metres. The kalam is a disc inscribed in the canvas,
   *  so this is one multiply — and it lives here so no module has to know it. */
  kalamToWorld(at: KalamPoint): { x: number; z: number } {
    return {
      x: (at.u - 0.5) * 2 * KALAM_RADIUS,
      z: (at.v - 0.5) * 2 * KALAM_RADIUS,
    };
  }

  setSurface(texture: Texture | null): void {
    this.yard.setSurface(texture);
  }

  lookAt(at: KalamPoint, opts?: { seconds?: number; distance?: number }): Promise<void> {
    const { x, z } = this.kalamToWorld(at);
    return this.director.lookAt(x, z, opts);
  }

  setTimeOfDay(t: number): void {
    this.daylight.setTimeOfDay(t);
    this.events.emit('sun:change', t);
  }

  get timeOfDay(): number {
    return this.daylight.timeOfDay;
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.director.dispose();
    this.yard.dispose();
    this.lamp.dispose();
    this.clouds.dispose();
    this.ground.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
