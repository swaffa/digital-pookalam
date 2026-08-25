/**
 * ════════════════════════════════════════════════════════════════════════
 *  THE SEAMS
 * ════════════════════════════════════════════════════════════════════════
 *
 * This is the only file every team reads. It says nothing about how anything
 * works — it says what each module must hand the others. If your module
 * satisfies its interface here, it drops into `main.ts` and the courtyard
 * accepts it, whatever you did inside.
 *
 * ── The shape of the product, in three lines ───────────────────────────────
 *
 *   One Kerala മുറ്റം, rendered in the browser.
 *   In the middle of it, one circle of swept earth nine metres across.
 *   A group lays a pookalam on it, together.
 *
 * That is the whole thing. There is no lobby, no list of worlds, no navigation
 * — the app opens, the camera falls out of the sky, and you are standing in the
 * courtyard. Everything else was cut so that the one screen that matters could
 * be good.
 *
 * ── Rules for this file ────────────────────────────────────────────────────
 *
 *   1. Nobody edits it alone. A change here is a change to somebody else's
 *      code, so it goes through the group first (docs/conventions.md §3).
 *   2. Types only. No implementation, no THREE-heavy logic, no side effects.
 *   3. If you need a field nobody else needs, it belongs in your module.
 *
 * ── Module map ─────────────────────────────────────────────────────────────
 *
 *   M1 chalk    · the design catalogue and the chalk lines on the ground
 *   M2 painter  · filling those outlines with flowers
 *   M3 flowers  · the palette, the petal look, the 3-D layer
 *   M4 store    · making a kalam survive a refresh, and several people on it
 *   M5 ui       · every pixel that is not the 3-D scene
 *   M6 share    · turning a finished kalam into an image
 *
 * Full briefs in docs/briefs/.
 */

import type { PerspectiveCamera, Scene, Texture, WebGLRenderer } from 'three';
import type { Emitter, Unsubscribe } from './util/events';

export type { Unsubscribe };

/* ──────────────────────────────────────────────────────────────────────────
 * 0 · Where things are
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A point on the kalam, in canvas coordinates — 0..1 across the texture that
 * M2 paints, with (0.5, 0.5) at the centre of the design.
 *
 * Every module that touches the pookalam speaks in these, and nothing outside
 * `world/` ever sees a metre or an x/z. That is what lets M2 and M3 work in the
 * coordinate space of a drawing rather than of a scene graph.
 */
export interface KalamPoint {
  u: number;
  v: number;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 1 · What the world gives you  (already built — see src/world/)
 * ────────────────────────────────────────────────────────────────────────── */

export interface WorldEvents extends Record<string, unknown> {
  /** The scene is up and the first frame has rendered. */
  ready: void;
  /** The opening descent has landed. */
  arrived: void;
  /** Cursor moved over the kalam. Null when it left the disc. */
  'kalam:hover': KalamPoint | null;
  /** A tap on the kalam, not a drag. */
  'kalam:pick': KalamPoint;
  /** Time of day changed, 0 = dawn, 0.5 = noon, 1 = dusk. */
  'sun:change': number;
  /** Window resized; payload is the new drawing-buffer aspect. */
  resize: number;
}

/**
 * The world's public surface. Modules receive this and never reach into
 * `src/world/` themselves — if you need something from the scene that isn't
 * here, ask for it to be added rather than importing a world file directly.
 */
export interface WorldAPI {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly events: Emitter<WorldEvents>;

  /** The kalam's radius in metres. M3 needs it to size a petal. */
  readonly kalamRadius: number;

  /** Register a per-frame callback. `dt` is seconds since the last frame. */
  onFrame(cb: (dt: number, elapsed: number) => void): Unsubscribe;

  /** Ground height in metres at a world point. The courtyard is flat, so this
   *  is 0 anywhere near the kalam — it matters out on the paddy. */
  groundHeight(x: number, z: number): number;

  /** A point on the kalam, in metres. For anything that has to be placed in
   *  the scene rather than drawn on the canvas. */
  kalamToWorld(at: KalamPoint): { x: number; z: number };

  /**
   * Put a module's canvas on the ground. This is THE seam between the drawing
   * and the world: M2 hands over a texture, and it becomes the pookalam.
   * Pass null to go back to bare swept earth.
   */
  setSurface(texture: Texture | null): void;

  /** Glide to a comfortable look at a point on the kalam. Interruptible. */
  lookAt(at: KalamPoint, opts?: { seconds?: number; distance?: number }): Promise<void>;

  /** 0 = dawn, 0.5 = noon, 1 = dusk. Moves sun, sky, clouds, fog and shadows. */
  setTimeOfDay(t: number): void;
  readonly timeOfDay: number;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 2 · M1 — Chalk guides
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * One fillable area of a design. A guide is a list of these plus the chalk
 * lines that separate them.
 *
 * `path` is asked for in canvas pixels so the same region can be drawn at any
 * texture resolution: build the Path2D against `size`, centred on
 * `size / 2, size / 2`. The kalam is round and the canvas is square, so
 * anything outside the inscribed circle will never be seen.
 */
export interface GuideRegion {
  /** Unique inside the guide. Goes in storage — keep it stable. */
  id: string;
  /** 0 at the centre, counting outward. Used for "fill ring by ring". */
  ring: number;
  /** Which symmetry sector this region belongs to, 0..sectors-1. */
  sector: number;
  /** The fillable outline, in canvas pixels for a `size`×`size` texture. */
  path(size: number): Path2D;
  /** Flower id this region looks best in — a suggestion, not a rule. */
  suggests?: string;
}

export interface ChalkGuide {
  /** Slug. Goes in storage, so never rename a shipped one. */
  id: string;
  name: string;
  malayalamName?: string;
  /** 1 easy · 2 medium · 3 for the show-offs. */
  difficulty: 1 | 2 | 3;
  /** Rotational symmetry. The painter mirrors a stroke across all sectors,
   *  which is how a beginner gets a clean pookalam in four taps. */
  sectors: number;
  /** Every fillable area, outermost ring last. */
  regions: GuideRegion[];
  /** Draw the chalk lines — the white guide the flowers sit inside. Called
   *  with a transparent canvas; draw nothing but the lines. */
  drawChalk(ctx: CanvasRenderingContext2D, size: number): void;
}

export interface GuideCatalogue {
  all(): ChalkGuide[];
  get(id: string): ChalkGuide | undefined;
  /** Grouped for the picker UI. */
  byDifficulty(): Record<1 | 2 | 3, ChalkGuide[]>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3 · M2 — Painter
 * ────────────────────────────────────────────────────────────────────────── */

/** Everything needed to redraw a kalam from scratch. Keep it small — this is
 *  what gets stored and, once several people are on one kalam, what travels. */
export interface KalamPaint {
  guideId: string;
  /** region id → flower id. Absent region = still bare ground. */
  fills: Record<string, string>;
}

export interface Painter {
  /** The live kalam texture. The world puts this on the ground. */
  readonly texture: Texture;
  /** Texture resolution, one side. */
  readonly size: number;

  /** Switch designs. Clears the fills — warn the group first. */
  load(guide: ChalkGuide): void;
  /** The guide currently loaded, so M3 and M5 don't have to track it. */
  readonly guide: ChalkGuide | null;

  /** Colour one region. Respects the guide's symmetry unless `only` is set. */
  fill(regionId: string, flowerId: string, opts?: { only?: boolean }): void;

  /** A point on the kalam → the region under it, or null for the gaps. */
  pickRegion(at: KalamPoint): string | null;

  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;

  /** Serialise / restore. Round-tripping must be lossless. */
  snapshot(): KalamPaint;
  restore(paint: KalamPaint): void;

  /** Fires after any change that altered the texture. M4 hangs a save off
   *  this; do not debounce inside it — fire honestly and let them debounce. */
  onChange(cb: (paint: KalamPaint) => void): Unsubscribe;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 4 · M3 — Flowers
 * ────────────────────────────────────────────────────────────────────────── */

export interface Flower {
  /** Slug, in storage. Stable forever. */
  id: string;
  name: string;
  malayalamName?: string;
  /** What the painter fills a region with. */
  hex: string;
  /** Deeper tone for the shadowed side of a petal. Defaults to hex × 0.75. */
  shadeHex?: string;
  /** Petal shape for the 3-D layer, in metres. */
  petal: { length: number; width: number; curl: number };
}

export interface FlowerCatalogue {
  all(): Flower[];
  get(id: string): Flower | undefined;
  /** Fallback for an unknown id — never return undefined to the renderer. */
  readonly fallback: Flower;
}

/**
 * The 3-D layer: real petals standing on the kalam.
 *
 * With one large pookalam and a camera that gets within three metres of it,
 * this is not a level-of-detail problem. It is the centrepiece.
 */
export interface PetalField {
  /** Build (or rebuild) the petals. Cheap enough to call on every edit. */
  build(paint: KalamPaint, guide: ChalkGuide): void;
  /** Drop the geometry and free the GPU buffers. */
  dispose(): void;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 5 · M4 — Storage and collaboration
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The data seam. `main.ts` news up one of these and hands it round; swapping
 * the mock for the real one is a single line. Everything is async because one
 * day it is a network call.
 *
 * There is one kalam, so there is nothing to look up — no ids, no lists. Load
 * it, save it, and be told when somebody else changed it.
 */
export interface Store {
  /** The kalam as it stands. Null if nobody has painted anything yet. */
  load(): Promise<KalamPaint | null>;

  /** Write the kalam. Called on every meaningful edit — debounce inside. */
  save(paint: KalamPaint): Promise<void>;

  /**
   * Somebody else painted. This is the collaboration seam: several people on
   * one pookalam, and a region is the unit of edit, which is what keeps two of
   * them from fighting.
   */
  onPaint(cb: (paint: KalamPaint) => void): Unsubscribe;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 6 · M5 — UI
 * ────────────────────────────────────────────────────────────────────────── */

/** What the UI is allowed to touch. Nothing else. */
export interface UIDeps {
  world: WorldAPI;
  store: Store;
  guides: GuideCatalogue;
  flowers: FlowerCatalogue;
  painter: Painter;
  share: Share;
  /** Where to mount. Already in the DOM, above the canvas. */
  root: HTMLElement;
}

export interface UI {
  /** Build the DOM and wire the events. Called once, before the world starts. */
  mount(deps: UIDeps): void;
  /** The loading veil, while the courtyard is being assembled. */
  progress(fraction01: number, label?: string): void;
  /** Lift the veil. Called as the opening descent begins, not after it. */
  veilDone(): void;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 7 · M6 — Share
 * ────────────────────────────────────────────────────────────────────────── */

export interface Share {
  /** Render a shareable image of the kalam. */
  card(paint: KalamPaint): Promise<Blob>;
  /** Native share sheet where it exists, download where it doesn't. */
  offer(paint: KalamPaint): Promise<void>;
}
