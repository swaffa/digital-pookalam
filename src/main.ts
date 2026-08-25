/**
 * ════════════════════════════════════════════════════════════════════════
 *  BOOT
 * ════════════════════════════════════════════════════════════════════════
 *
 * The whole application, in one readable sequence. Nothing clever happens in
 * here on purpose: if you want to know what this project is, this file should
 * tell you in twenty seconds.
 *
 *   createUI(chrome)      the veil goes up first, before anything slow
 *   new World(#app)       renderer, scene, camera
 *   world.build(…)        sky, ground, clouds, lamp, the disc — staged, so the
 *                         progress bar actually moves
 *   new MockStore()       ← THE DATA SEAM. M4 swaps this line for HttpStore.
 *   createPainter()       M2's canvas, loaded with M1's guide
 *   ui.mount(deps)        every module handed to the UI, and only through here
 *   world.start()         the loop begins and the camera falls out of the sky
 *
 * Note what does NOT happen: no module imports another module's internals.
 * They meet here, and they meet through the interfaces in `contracts.ts`.
 * That is what lets six groups work at once.
 */

import { World } from './world/world';
import { createUI } from './modules/ui';
import { MockStore } from './modules/store';
import { createPainter } from './modules/painter';
import { createShare } from './modules/share';
import { guides, defaultGuide } from './modules/chalk';
import { flowers } from './modules/flowers';

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  const chrome = document.getElementById('chrome');
  if (!app || !chrome) throw new Error('boot: #app or #chrome missing from index.html');

  const ui = createUI(chrome);
  ui.progress(0.02, 'waking the courtyard');

  const world = new World(app);
  await world.build((fraction, label) => ui.progress(fraction, label));

  // ── the data seam ─────────────────────────────────────────────────────
  // Everything above this line is pixels; everything below it is people.
  // When M4's backend lands, this is the one line that changes.
  const store = new MockStore({ laid: 0.35, paintEvery: 5 });

  const painter = createPainter();
  const share = createShare();

  // M1's chalk guide → M2's canvas. The drawing pipeline is live: the guide is
  // loaded, whatever was already laid is restored, and the two subscriptions
  // below keep it current in both directions.
  const saved = await store.load();
  painter.load(guides.get(saved?.guideId ?? '') ?? defaultGuide);
  if (saved) painter.restore(saved);

  // Somebody else is painting this kalam too. MockStore fakes a collaborator
  // every five seconds, so this path is exercised from day one.
  store.onPaint((paint) => painter.restore(paint));
  painter.onChange((paint) => void store.save(paint));

  // ── THE LINE ──────────────────────────────────────────────────────────
  // Uncomment to put M2's canvas on the ground. It is off while the yard is
  // deliberately empty: an unpainted courtyard is the honest picture of where
  // the project actually is, and it gives M1's designs something to appear
  // against. Everything on the far side of this line already works.
  //
  //     world.setSurface(painter.texture);
  //
  // ──────────────────────────────────────────────────────────────────────

  ui.mount({ world, store, guides, flowers, painter, share, root: chrome });

  // A handle for the console, for a workshop where half the learning happens by
  // typing `pookalam.world.setTimeOfDay(0.9)` and seeing what moves. Published
  // BEFORE the descent, so the five seconds of falling are pokeable too.
  Object.assign(window, { pookalam: { world, store, painter, guides, flowers, share } });

  // The loop starts, the camera begins its fall, and the veil lifts over the
  // top of it. Lifting onto a still frame reads as a screenshot; lifting onto
  // a moving one reads as arriving somewhere.
  const arrived = world.start();
  ui.veilDone();
  await arrived;

  console.info(
    '[pookalam] standing in the courtyard · the disc is bare, and that is the point\n' +
      'poke at it: window.pookalam',
  );
}

boot().catch((error: unknown) => {
  console.error('[pookalam] boot failed', error);
  const veil = document.getElementById('veil');
  if (veil) {
    veil.innerHTML =
      '<h1>The മുറ്റം did not open</h1>' +
      '<small>Check the console. If it mentions WebGL, this browser cannot render the courtyard.</small>';
  }
});
