/**
 * ════════════════════════════════════════════════════════════════════════
 *  M4 · STORAGE & COLLABORATION     owner: ____________
 *  brief: docs/briefs/m4-store.md
 * ════════════════════════════════════════════════════════════════════════
 *
 * Making the pookalam outlive a refresh, and letting several people lay it
 * together.
 *
 * `MockStore` below is complete and working. It seeds the kalam with a
 * part-finished design, and — the interesting part — it fakes a COLLABORATOR:
 * every few seconds somebody who is not you fills one more region. The whole
 * front end is built against "somebody else is painting this too" from day
 * one, so you are not inventing that behaviour, you are making it true.
 *
 * Your job is the other implementation of the same interface. Success looks
 * like changing one line in `main.ts`:
 *
 *     const store = new MockStore();      // becomes
 *     const store = new HttpStore('/api');
 *
 * If the app cannot tell the difference, you are done. **If you find yourself
 * needing to change anything outside this folder, the seam was wrong — say so
 * before you work around it.**
 */

import type { KalamPaint, Store, Unsubscribe } from '../../contracts';
import { makeRng, pick } from '../../util/rng';
import { guides } from '../chalk';
import { flowers } from '../flowers';

export interface MockOptions {
  /** Fraction of the design already laid when the app opens, 0..1. */
  laid?: number;
  /** Seconds between the fake collaborator's strokes. 0 turns them off. */
  paintEvery?: number;
}

export class MockStore implements Store {
  private paint: KalamPaint;
  private readonly listeners = new Set<(paint: KalamPaint) => void>();
  private readonly rng = makeRng(0x1e57);
  private timer: number | null = null;

  constructor(options: MockOptions = {}) {
    const guide = guides.all()[0];
    const laid = options.laid ?? 0.35;
    const fills: Record<string, string> = {};

    // Fill ring by ring, not region by region. A real pookalam is banded, and
    // one random flower per region reads as confetti.
    const perRing = new Map<number, string>();
    for (const region of guide.regions) {
      if (!perRing.has(region.ring)) perRing.set(region.ring, pick(this.rng, flowers.all()).id);
      if (this.rng() < laid) fills[region.id] = perRing.get(region.ring)!;
    }
    this.paint = { guideId: guide.id, fills };

    const every = options.paintEvery ?? 5;
    if (every > 0) {
      this.timer = window.setInterval(() => this.someoneElsePaints(), every * 1000);
    }
  }

  /** One more region, by somebody who is not you. */
  private someoneElsePaints(): void {
    const guide = guides.get(this.paint.guideId);
    if (!guide) return;
    const bare = guide.regions.filter((region) => !this.paint.fills[region.id]);
    if (!bare.length) return;

    const region = pick(this.rng, bare);
    this.paint.fills[region.id] = pick(this.rng, flowers.all()).id;
    this.announce();
  }

  private announce(): void {
    // A copy per listener: a module that mutates what it is handed must not be
    // able to corrupt the store.
    for (const cb of this.listeners) {
      cb({ guideId: this.paint.guideId, fills: { ...this.paint.fills } });
    }
  }

  async load(): Promise<KalamPaint | null> {
    return { guideId: this.paint.guideId, fills: { ...this.paint.fills } };
  }

  async save(paint: KalamPaint): Promise<void> {
    this.paint = { guideId: paint.guideId, fills: { ...paint.fills } };
  }

  onPaint(cb: (paint: KalamPaint) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
  }
}

/**
 * TODO(M4): the real one.
 *
 *     export class HttpStore implements Store { … }
 *
 * Before you write a line of it, settle these in the group. Every one is a
 * decision the front end cannot make for you.
 *
 *   1 · What is the unit of a write? **A region, not a kalam.** This is the
 *       interesting problem in your module, and the mock's shape will talk you
 *       out of noticing it if you let it. `save(wholePaint)` cannot express two
 *       people filling different petals at the same moment — the second write
 *       clobbers the first. So the wire format for an edit is probably
 *
 *           POST /api/fill   { regionId, flowerId }
 *
 *       and `save` becomes the first write and the occasional resync. Decide
 *       this before you write a schema.
 *
 *   2 · How do other people's strokes arrive? Server-sent events are the boring
 *       right answer and they work. WebSockets earn their keep only once you
 *       want cursors — which you might, because seeing WHERE somebody else is
 *       working is what stops two people filling the same petal.
 *
 *   3 · Does an edit need an author? For "Meera just laid the outer ring", yes.
 *       That is a name in the fill payload, and it means M5 needs somewhere to
 *       ask for one. Go and talk to them.
 *
 *   4 · What happens when the network drops mid-stroke? The fill has already
 *       shown on M2's canvas. Either queue and retry, or roll it back visibly —
 *       but never silently diverge from the server.
 *
 *   5 · Who is allowed to paint? If the answer is "anybody with the URL", say
 *       so out loud and rate-limit it. If it is not, you need M5 to have some
 *       notion of a session.
 *
 * Write it against the same interface and prove it by swapping the line in
 * main.ts.
 */
