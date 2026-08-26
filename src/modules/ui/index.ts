import type { UI, UIDeps } from '../../contracts';

export function createUI(root: HTMLElement): UI {
  const veil = document.createElement('div'); veil.id = 'veil'; veil.innerHTML = `<div class="veil-flower">✿</div><h1>ഡിജിറ്റൽ പൂക്കളം</h1><div class="bar"><i></i></div><small>preparing your flower courtyard…</small>`; document.body.appendChild(veil);
  const bar = veil.querySelector('i')!, caption = veil.querySelector('small')!;
  const chrome = document.createElement('main'); chrome.id = 'world-ui';
  chrome.innerHTML = `<header class="topbar"><div class="brand"><span>✿</span><div><strong>പൂക്കളം</strong><small>Digital Onam Flower Art</small></div></div><button class="help" aria-label="How to play">?</button></header>
    <aside class="design-panel"><div class="panel-title"><span>1. Choose a design</span><button class="close-design" aria-label="Close designs">×</button></div><div class="design-grid"></div></aside>
    <section class="flower-panel"><div class="step-label">2. Choose flowers</div><div class="flower-row"></div><p><span>✦</span> Tap a section yourself, or ask the guests to help</p><div class="actions"><button class="undo" title="Undo">↶</button><button class="redo" title="Redo">↷</button><button class="guest-help">Guests help</button><button class="finish">Finish പൂക്കളം</button></div></section>
    <button class="design-toggle">⌘ Designs</button><div class="toast" role="status"></div><div class="finish-card" hidden><div>✿</div><h2>അടിപൊളി!</h2><p>Your pookalam is blooming beautifully.</p><button>Make another</button></div>`;
  root.appendChild(chrome);
  const toast = chrome.querySelector<HTMLElement>('.toast')!;
  let toastTimer = 0;
  const speak = (message: string) => { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400); };
  return {
    mount(deps: UIDeps) {
      const { world, painter, guides, flowers } = deps;
      const designGrid = chrome.querySelector<HTMLElement>('.design-grid')!;
      const flowerRow = chrome.querySelector<HTMLElement>('.flower-row')!;
      let selectedFlower = flowers.fallback.id;
      let helpingTimer = 0;
      const drawThumb = (canvas: HTMLCanvasElement, guide: ReturnType<typeof guides.all>[number]) => { const ctx = canvas.getContext('2d')!; const size = canvas.width; ctx.fillStyle = '#4b321e'; ctx.fillRect(0, 0, size, size); guide.drawChalk(ctx, size); };
      const renderDesigns = () => {
        designGrid.innerHTML = '';
        guides.all().forEach(guide => { const button = document.createElement('button'); button.className = `design ${painter.guide?.id === guide.id ? 'selected' : ''}`; button.innerHTML = `<canvas width="104" height="104"></canvas><span>${guide.malayalamName ?? guide.name}</span><small>${guide.name}</small>`; drawThumb(button.querySelector('canvas')!, guide);
          button.addEventListener('click', () => { if (guide.id === painter.guide?.id) return; painter.load(guide); renderDesigns(); speak(`${guide.name} is ready — choose a flower and tap a section.`); chrome.classList.remove('picker-open'); }); designGrid.append(button); });
      };
      flowers.all().forEach(flower => { const button = document.createElement('button'); button.className = `flower ${flower.id === selectedFlower ? 'selected' : ''}`; button.dataset.id = flower.id; button.style.setProperty('--petal', flower.hex); button.innerHTML = `<span class="flower-icon">✿</span><small>${flower.malayalamName ?? flower.name}</small>`;
        button.addEventListener('click', () => { selectedFlower = flower.id; flowerRow.querySelectorAll('.flower').forEach(el => el.classList.toggle('selected', (el as HTMLElement).dataset.id === flower.id)); speak(`${flower.name} is in your hand.`); }); flowerRow.append(button); });
      renderDesigns();
      world.setSurface(painter.texture);
      world.events.once('arrived', () => chrome.classList.add('on'));
      world.events.on('kalam:pick', at => { const region = painter.pickRegion(at); if (!region) { speak('Pick a section inside the chalk outline.'); return; } painter.fill(region, selectedFlower); speak('A fresh flower bed is in bloom — colour each section your way.'); });
      chrome.querySelector('.design-toggle')!.addEventListener('click', () => chrome.classList.toggle('picker-open'));
      chrome.querySelector('.close-design')!.addEventListener('click', () => chrome.classList.remove('picker-open'));
      chrome.querySelector('.undo')!.addEventListener('click', () => { painter.undo(); }); chrome.querySelector('.redo')!.addEventListener('click', () => { painter.redo(); });
      chrome.querySelector('.guest-help')!.addEventListener('click', () => {
        window.clearInterval(helpingTimer);
        const flowerInHand = selectedFlower;
        const help = () => {
          const activeGuide = painter.guide;
          if (!activeGuide) return;
          const existing = painter.snapshot().fills;
          // Maveli and the five animated guests lay flowers together. Captain
          // America remains in his requested still guard position.
          const next = activeGuide.regions.filter(region => !existing[region.id]).slice(0, 6);
          if (!next.length) { window.clearInterval(helpingTimer); speak('The pookalam is complete!'); return; }
          next.forEach(region => painter.fill(region.id, flowerInHand, { only: true }));
        };
        help();
        helpingTimer = window.setInterval(help, 360);
        speak('Maveli and the guests are laying the selected flowers.');
      });
      chrome.querySelector('.help')!.addEventListener('click', () => speak('Choose a pattern, choose a flower, then tap the matching chalk sections.')); 
      const card = chrome.querySelector<HTMLElement>('.finish-card')!;
      chrome.querySelector('.finish')!.addEventListener('click', () => { card.hidden = false; }); card.querySelector('button')!.addEventListener('click', () => { card.hidden = true; chrome.classList.add('picker-open'); });
    },
    progress(fraction, label) { bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`; if (label) caption.textContent = `${label}…`; },
    veilDone() { veil.classList.add('gone'); veil.addEventListener('transitionend', () => veil.remove(), { once: true }); window.setTimeout(() => veil.remove(), 1200); },
  };
}
