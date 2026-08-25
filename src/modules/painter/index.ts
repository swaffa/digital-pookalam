/**
 * ════════════════════════════════════════════════════════════════════════
 *  M2 · PAINTER            owner: ____________     brief: docs/briefs/m2-painter.md
 * ════════════════════════════════════════════════════════════════════════
 *
 * Turning taps into a pookalam. You own the canvas that becomes the plot's
 * texture, the hit-testing that decides which region a tap landed in, the
 * symmetry that fills all eight sectors at once, and undo.
 *
 * This is the module the whole experience lives or dies on. If filling a
 * region feels good, a group will stay and make something together. If it
 * feels laggy or fights them, nothing else in the project matters.
 *
 * One kalam per world, nine metres across, several people on it at once — so
 * everything here is bigger and more visible than it looks in the interface.
 *
 * The stub below satisfies the interface and does nothing, so the world runs
 * while you work. Replace it a method at a time — `load` and `fill` first,
 * then `pickRegion`, then undo, then snapshot/restore.
 */

import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { ChalkGuide, KalamPaint, KalamPoint, Painter, Unsubscribe } from '../../contracts';
import { flowers } from '../flowers';

/**
 * Texture resolution for the kalam. The disc is 9 m across, so 2048 px is
 * ~230 px per metre — and the camera gets to within two metres of it, so this
 * is the lowest number that does not show its pixels.
 *
 * There is exactly one of these per world, which is what buys the resolution:
 * the earlier design had a thousand small kalams and could afford 1024 each.
 * Raise it only after measuring; every doubling is four times the memory.
 */
const SIZE = 2048;

export function createPainter(): Painter {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  let guide: ChalkGuide | null = null;
  let fills: Record<string, string> = {};
  const listeners = new Set<(paint: KalamPaint) => void>();

  // TODO(M2): a real history stack. Two arrays of KalamPaint snapshots is the
  // boring answer and it is the right one to start with — a pookalam has at
  // most a few hundred fills, so a snapshot is a few kilobytes.
  const announce = () => {
    texture.needsUpdate = true;
    const paint = { guideId: guide?.id ?? '', fills: { ...fills } };
    for (const cb of listeners) cb(paint);
  };

  /** Redraw everything: chalk first, then every fill on top of it. */
  const repaint = () => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!guide) return;
    guide.drawChalk(ctx, SIZE);
    for (const region of guide.regions) {
      const flowerId = fills[region.id];
      if (!flowerId) continue;
      const flower = flowers.get(flowerId) ?? flowers.fallback;
      ctx.fillStyle = flower.hex;
      ctx.fill(region.path(SIZE));
    }
    // TODO(M2): this redraws the whole canvas on every single fill. Fine for
    // now; measure it before you optimise. When it does start to hurt, the
    // fix is to fill only the region that changed and leave the rest alone.
  };

  return {
    texture: texture as Texture,
    size: SIZE,

    get guide() {
      return guide;
    },

    load(next: ChalkGuide) {
      guide = next;
      fills = {};
      repaint();
      announce();
    },

    fill(regionId: string, flowerId: string, opts?: { only?: boolean }) {
      if (!guide) return;
      const region = guide.regions.find((r) => r.id === regionId);
      if (!region) return;

      if (opts?.only || region.ring === 0) {
        fills[regionId] = flowerId;
      } else {
        // Symmetry: one tap fills the same region in every sector. This is
        // the single feature that makes a beginner's pookalam look good, so
        // it is on by default and `only` is the escape hatch.
        // TODO(M2): this assumes region ids end in `-<sector>`. That is M1's
        // convention today; agree on it properly with them, or match on
        // `ring` + `sector` instead of parsing strings.
        const suffix = `-${region.sector}`;
        const family = region.id.endsWith(suffix)
          ? region.id.slice(0, -suffix.length)
          : null;
        for (const candidate of guide.regions) {
          if (family && candidate.id.startsWith(`${family}-`)) fills[candidate.id] = flowerId;
        }
        if (!family) fills[regionId] = flowerId;
      }
      repaint();
      announce();
    },

    pickRegion(_at: KalamPoint): string | null {
      // TODO(M2): the core of your module.
      //   1. the point → canvas pixels: x = at.u * SIZE, y = at.v * SIZE
      //   2. walk `guide.regions` from the OUTERMOST ring inward and return
      //      the first whose path contains the point — outer-first, because
      //      overlapping shapes should resolve to the one drawn last
      //   3. `ctx.isPointInPath(region.path(SIZE), x, y)` does the test
      // Then measure it. If a 300-region guide is too slow to hit-test on
      // every pointer move, cache a region-id-per-pixel lookup image instead
      // of the geometry — a Uint16Array of SIZE² answers in O(1). At 2048 that
      // is 8 MB, so build it once at `load` time and never per frame.
      return null;
    },

    undo() {
      // TODO(M2)
    },
    redo() {
      // TODO(M2)
    },
    get canUndo() {
      return false;
    },
    get canRedo() {
      return false;
    },

    snapshot(): KalamPaint {
      return { guideId: guide?.id ?? '', fills: { ...fills } };
    },

    restore(paint: KalamPaint) {
      fills = { ...paint.fills };
      repaint();
      announce();
    },

    onChange(cb: (paint: KalamPaint) => void): Unsubscribe {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
