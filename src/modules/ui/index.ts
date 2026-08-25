/**
 * ════════════════════════════════════════════════════════════════════════
 *  M5 · UI            owner: ____________    brief: docs/briefs/m5-ui.md
 * ════════════════════════════════════════════════════════════════════════
 *
 * Every pixel that is not the 3-D scene.
 *
 * What is here now is SCAFFOLDING: a loading veil, a time-of-day slider, and an
 * honest message when you tap the kalam and nothing happens yet. Expect to
 * delete most of it.
 *
 * What you actually own:
 *   · the design picker      — M1's catalogue, browsable, on a phone
 *   · the flower palette     — M3's list, and the flower currently in hand
 *   · undo / redo            — M2's, wired to something thumb-sized
 *   · who else is here       — M4's collaborator strokes, surfaced
 *   · the finish             — "our pookalam is done", and M6's share sheet
 *
 * One rule that is not negotiable: **the chrome must not cover the pookalam.**
 * It is in the middle of the screen and it is the whole point. Everything goes
 * to the edges — which is why the scaffolding below is three corners and a
 * veil, and nothing else.
 *
 * No framework. Not because frameworks are bad, but because this is a few
 * hundred lines of DOM next to a render loop that must not drop a frame, and a
 * reconciler in the middle is a cost with nothing to buy.
 * `docs/why-no-react.md` has the longer version if you want to argue — and you
 * may.
 */

import type { UI, UIDeps } from '../../contracts';

export function createUI(root: HTMLElement): UI {
  /* ── the veil ───────────────────────────────────────────────────────────
   * Up before the first frame, gone as the descent begins. Not decoration:
   * without it the visitor watches an empty canvas for the ~250 ms the ground
   * takes to build, and reads it as broken.
   */
  const veil = document.createElement('div');
  veil.id = 'veil';
  veil.innerHTML = `
    <h1>ഡിജിറ്റൽ മുറ്റം</h1>
    <div class="bar"><i></i></div>
    <small>levelling the ground…</small>
  `;
  document.body.appendChild(veil);
  const bar = veil.querySelector('i')!;
  const caption = veil.querySelector('small')!;

  /* ── the chrome ─────────────────────────────────────────────────────── */
  const chrome = document.createElement('div');
  chrome.id = 'world-ui';
  chrome.innerHTML = `
    <div id="sun" class="panel">
      <label for="sun-slider">time of day</label>
      <input id="sun-slider" type="range" min="0" max="100" value="44" />
    </div>
    <div id="say"></div>
    <div id="hint">
      drag to orbit · scroll to zoom · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> dawn / noon / dusk
    </div>
  `;
  root.appendChild(chrome);

  const slider = chrome.querySelector<HTMLInputElement>('#sun-slider')!;
  const say = chrome.querySelector<HTMLElement>('#say')!;

  let sayTimer = 0;
  /** A transient line near the bottom of the screen. The scaffold's only way
   *  of telling you anything, and the first thing a real HUD replaces. */
  const speak = (text: string) => {
    say.textContent = text;
    say.classList.add('on');
    window.clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => say.classList.remove('on'), 3000);
  };

  return {
    mount(deps: UIDeps) {
      const { world, painter, flowers } = deps;

      slider.value = String(Math.round(world.timeOfDay * 100));
      slider.addEventListener('input', () => {
        world.setTimeOfDay(Number(slider.value) / 100);
      });

      window.addEventListener('keydown', (event) => {
        const preset = { '1': 0.06, '2': 0.5, '3': 0.95 }[event.key];
        if (preset === undefined) return;
        world.setTimeOfDay(preset);
        slider.value = String(Math.round(preset * 100));
      });

      // Reveal the chrome only once the camera has landed. Buttons floating
      // over a 620 m fall make the descent look like a loading screen with a
      // toolbar on it.
      world.events.once('arrived', () => chrome.classList.add('on'));

      // ── the seam that is waiting for M2 ───────────────────────────────
      // A tap on the kalam already arrives here as a point on M2's canvas —
      // the world raycast the disc and did the conversion. The moment
      // `pickRegion` returns a region id instead of null, this becomes a
      // working pookalam painter and nothing else has to change.
      world.events.on('kalam:pick', (at) => {
        const regionId = painter.pickRegion(at);
        if (!regionId) {
          speak(
            `tapped (${at.u.toFixed(2)}, ${at.v.toFixed(2)}) — M2's pickRegion ` +
              'returns null, so nothing fills yet',
          );
          return;
        }
        // TODO(M5): a real held flower, chosen from a palette, instead of
        // whatever happens to be first in M3's catalogue.
        painter.fill(regionId, flowers.all()[0]?.id ?? 'marigold');
      });

      // TODO(M5): everything else.
      //   · the flower palette and a held flower — the most-used control in
      //     the app, and the one that turns the tap handler above into the
      //     core interaction
      //   · the design picker: a strip of M1's guides, thumbnails drawn by
      //     calling `drawChalk` onto a small canvas. Warn before switching; it
      //     clears the fills, and on a shared kalam those are other people's.
      //   · undo/redo, wired to painter.canUndo / canRedo
      //   · who else is here, from store.onPaint. A group needs to see that
      //     somebody just filled a petal, or two of them will fill the same one.
      //   · the finish, and M6's share sheet
      //   · mobile first. The canvas takes the whole screen and your chrome
      //     sits on top of it; test with one thumb before you test with a mouse.
    },

    progress(fraction: number, label?: string) {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
      if (label) caption.textContent = `${label}…`;
    },

    veilDone() {
      veil.classList.add('gone');
      // Remove it rather than leaving a transparent full-screen div over the
      // canvas — it would swallow every pointer event. Belt and braces on the
      // timeout, because a backgrounded tab or reduced motion never fires the
      // transition and a leftover veil eats the whole app.
      veil.addEventListener('transitionend', () => veil.remove(), { once: true });
      window.setTimeout(() => veil.remove(), 1400);
    },
  };
}
