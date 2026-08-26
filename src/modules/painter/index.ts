import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { ChalkGuide, KalamPaint, KalamPoint, Painter } from '../../contracts';
import { flowers } from '../flowers';

const SIZE = 2048;
export function createPainter(): Painter {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
  let guide: ChalkGuide | null = null, fills: Record<string, string> = {};
  let history: Record<string, string>[] = [], future: Record<string, string>[] = [];
  const listeners = new Set<(paint: KalamPaint) => void>();
  const announce = () => { texture.needsUpdate = true; const paint = { guideId: guide?.id ?? '', fills: { ...fills } }; listeners.forEach(cb => cb(paint)); };
  const paintFlower = (path: Path2D, flowerId: string) => {
    const flower = flowers.get(flowerId) ?? flowers.fallback;
    ctx.fillStyle = flower.hex; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    const deep = flower.shadeHex ?? '#542719';
    // Small flower clusters turn each coloured section into a bed of petals,
    // instead of a flat paint bucket. Everything remains clipped to its chalk shape.
    for (let x = 22; x < SIZE; x += 64) for (let y = (x / 64 % 2) * 32 + 18; y < SIZE; y += 64) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(((x + y) % 7) * .42);
      ctx.globalAlpha = .42; ctx.fillStyle = deep;
      for (let p = 0; p < 6; p++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.ellipse(11, 0, 12, 5.5, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = .9; ctx.fillStyle = '#ffd86e'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  };
  const repaint = () => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const c = SIZE / 2;
    const ground = ctx.createRadialGradient(c, c, 50, c, c, c); ground.addColorStop(0, '#5e3c23'); ground.addColorStop(1, '#27180f');
    ctx.fillStyle = ground; ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
    if (!guide) return;
    for (const region of guide.regions) { const id = fills[region.id]; if (id) paintFlower(region.path(SIZE), id); }
    guide.drawChalk(ctx, SIZE);
  };
  const saveStep = () => { history.push({ ...fills }); if (history.length > 40) history.shift(); future = []; };
  return {
    texture: texture as Texture, size: SIZE, get guide() { return guide; },
    load(next) { guide = next; fills = {}; history = []; future = []; repaint(); announce(); },
    fill(regionId, flowerId, _opts) {
      if (!guide || !guide.regions.find(r => r.id === regionId)) return;
      saveStep();
      // Every chalk shape is its own flower bed. This lets visitors compose
      // a genuinely multicoloured pookalam, petal by petal.
      fills[regionId] = flowerId;
      repaint(); announce();
    },
    pickRegion(at: KalamPoint) { if (!guide) return null; const x = at.u * SIZE, y = at.v * SIZE; return [...guide.regions].sort((a,b) => b.ring - a.ring).find(r => ctx.isPointInPath(r.path(SIZE), x, y))?.id ?? null; },
    undo() { const previous = history.pop(); if (!previous) return; future.push({ ...fills }); fills = previous; repaint(); announce(); },
    redo() { const next = future.pop(); if (!next) return; history.push({ ...fills }); fills = next; repaint(); announce(); },
    get canUndo() { return history.length > 0; }, get canRedo() { return future.length > 0; },
    snapshot: () => ({ guideId: guide?.id ?? '', fills: { ...fills } }),
    restore(paint) { fills = { ...paint.fills }; repaint(); announce(); },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
}
