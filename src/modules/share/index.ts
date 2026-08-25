/**
 * ════════════════════════════════════════════════════════════════════════
 *  M6 · SHARE & CAPTURE      owner: ____________    brief: docs/briefs/m6-share.md
 * ════════════════════════════════════════════════════════════════════════
 *
 * Turning a finished pookalam into an image a group can post.
 *
 * This is the smallest module here, which makes it the right one for a pair who
 * want to finish something and then go and help M2 or M3. Finishing early is
 * the assignment, not a consolation.
 *
 * Nothing is implemented. Both methods throw, on purpose — a stub that quietly
 * returns an empty blob is worse than one that says what is missing.
 */

import type { KalamPaint, Share } from '../../contracts';

export function createShare(): Share {
  return {
    async card(_paint: KalamPaint): Promise<Blob> {
      // TODO(M6): the image. Roughly:
      //   · an offscreen canvas at 1200×630, and a 1080×1080 for stories
      //   · the kalam itself — ASK M2 FOR THEIR PIXELS. Their painter already
      //     has it rendered on a 2048² canvas. Do not re-implement the drawing;
      //     you will drift out of sync with M1's guides within a day.
      //   · a wordmark, and the date. An Onam pookalam is dated by definition.
      //   · `canvas.toBlob()` and you are done
      //
      // The tempting alternative — screenshotting the WebGL canvas with
      // `renderer.domElement.toDataURL()` — works, and the world already sets
      // `preserveDrawingBuffer` so it will not come back blank. It gets you the
      // real scene with the real light, and a dusk pookalam with the brass lamp
      // beside it is a far better image than anything flat. It is also 3 MB,
      // the wrong aspect ratio, and will have M5's chrome in it if you call it
      // at the wrong moment.
      //
      // Try both. The flat one is probably the shippable one; the 3-D one is
      // probably the one people actually send.
      throw new Error('M6: share card not built yet — see docs/briefs/m6-share.md');
    },

    async offer(_paint: KalamPaint): Promise<void> {
      // TODO(M6): `navigator.share({ files: [...] })` where it exists — iOS
      // Safari and Android Chrome both do. Everywhere else, an `<a download>`.
      // Check `navigator.canShare({ files })` before trusting it: several
      // browsers ship `share` but refuse files.
      throw new Error('M6: share sheet not built yet — see docs/briefs/m6-share.md');
    },
  };
}
