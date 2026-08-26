import type { ChalkGuide, GuideCatalogue, GuideRegion } from '../../contracts';

const TAU = Math.PI * 2;
const polar = (size: number, r: number, a: number): [number, number] => {
  const c = size / 2; return [c + Math.cos(a) * r * c, c + Math.sin(a) * r * c];
};
function sector(size: number, inner: number, outer: number, from: number, to: number): Path2D {
  const c = size / 2, path = new Path2D();
  path.arc(c, c, outer * c, from, to); path.arc(c, c, inner * c, to, from, true); path.closePath(); return path;
}
function petal(size: number, inner: number, outer: number, angle: number, width: number): Path2D {
  const path = new Path2D();
  const [bx, by] = polar(size, inner, angle), [tx, ty] = polar(size, outer, angle);
  const [lx, ly] = polar(size, (inner + outer) / 2, angle - width), [rx, ry] = polar(size, (inner + outer) / 2, angle + width);
  path.moveTo(bx, by); path.quadraticCurveTo(lx, ly, tx, ty); path.quadraticCurveTo(rx, ry, bx, by); path.closePath(); return path;
}

type Pattern = 'petals' | 'rings' | 'sun' | 'lotus' | 'star';
type Recipe = { id: string; name: string; ml: string; sectors: number; pattern: Pattern; difficulty: 1 | 2 | 3 };
const recipes: Recipe[] = [
  { id: 'ashtadala', name: 'Eight Petals', ml: 'അഷ്ടദളം', sectors: 8, pattern: 'petals', difficulty: 1 },
  { id: 'surya', name: 'Sun Wheel', ml: 'സൂര്യചക്രം', sectors: 12, pattern: 'sun', difficulty: 1 },
  { id: 'padmam', name: 'Lotus Bloom', ml: 'താമര', sectors: 10, pattern: 'lotus', difficulty: 2 },
  { id: 'chakra', name: 'Temple Wheel', ml: 'ചക്രം', sectors: 16, pattern: 'rings', difficulty: 2 },
  { id: 'nakshatram', name: 'Star Garland', ml: 'നക്ഷത്രം', sectors: 8, pattern: 'star', difficulty: 2 },
  { id: 'mulla', name: 'Jasmine Ring', ml: 'മുല്ലപ്പൂ', sectors: 14, pattern: 'petals', difficulty: 2 },
  { id: 'deepam', name: 'Lamp Circle', ml: 'ദീപം', sectors: 6, pattern: 'lotus', difficulty: 1 },
  { id: 'vallam', name: 'Festival Mandala', ml: 'ഉത്സവം', sectors: 20, pattern: 'sun', difficulty: 3 },
  { id: 'panchavarna', name: 'Five Colours', ml: 'പഞ്ചവർണം', sectors: 10, pattern: 'rings', difficulty: 2 },
  { id: 'pooram', name: 'Grand Pooram', ml: 'പൂരം', sectors: 18, pattern: 'star', difficulty: 3 },
];

function guideFrom(recipe: Recipe): ChalkGuide {
  const step = TAU / recipe.sectors;
  const regions: GuideRegion[] = [{ id: 'centre', ring: 0, sector: 0, suggests: 'chethi', path: s => sector(s, 0, .14, 0, TAU) }];
  const bounds = recipe.pattern === 'rings' ? [[.16, .32], [.34, .53], [.55, .76], [.78, .94]] : [[.16, .48], [.5, .72], [.74, .94]];
  const suggestions = ['marigold', 'arali', 'thumba', 'mulla', 'chethi'];
  bounds.forEach(([inner, outer], ring) => {
    for (let i = 0; i < recipe.sectors; i++) {
      const angle = i * step - Math.PI / 2;
      const shaped = recipe.pattern === 'petals' || recipe.pattern === 'lotus' || (recipe.pattern === 'sun' && ring === 0) || (recipe.pattern === 'star' && ring === 1);
      regions.push({ id: `r${ring}-${i}`, ring: ring + 1, sector: i, suggests: suggestions[(ring + i) % suggestions.length],
        path: s => shaped ? petal(s, inner, outer, angle + (recipe.pattern === 'star' && i % 2 ? step * .22 : 0), step * (recipe.pattern === 'lotus' && ring === 0 ? .58 : .4)) : sector(s, inner, outer, angle + step * .035, angle + step * .965) });
    }
  });
  return { id: recipe.id, name: recipe.name, malayalamName: recipe.ml, difficulty: recipe.difficulty, sectors: recipe.sectors, regions,
    drawChalk(ctx, size) {
      const c = size / 2; ctx.save(); ctx.strokeStyle = 'rgba(255,250,235,.86)'; ctx.lineWidth = Math.max(1.5, size / 205); ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(255,255,255,.35)'; ctx.shadowBlur = size / 180;
      for (const region of regions) ctx.stroke(region.path(size)); ctx.beginPath(); ctx.arc(c, c, .965 * c, 0, TAU); ctx.stroke(); ctx.restore();
    } };
}
const ALL = recipes.map(guideFrom);
export const guides: GuideCatalogue = { all: () => ALL, get: id => ALL.find(g => g.id === id), byDifficulty: () => ({ 1: ALL.filter(g => g.difficulty === 1), 2: ALL.filter(g => g.difficulty === 2), 3: ALL.filter(g => g.difficulty === 3) }) };
export const defaultGuide = ALL[0];
