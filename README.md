# ഡിജിറ്റൽ മുറ്റം · Digital Pookalam

One Kerala courtyard, in the browser. The app opens, the camera falls five
hundred metres out of the sky through two decks of cloud, and you are standing
in a മുറ്റം with a nine-metre circle of swept earth in front of you.

**The world is built. The pookalam is yours.**

The disc is bare on purpose. There is no design on it and no chalk — an empty
courtyard is the honest picture of where this project is, and it is what M1's
guides will appear against. One commented line in `main.ts` turns the surface on
when they are ready.

```bash
npm install
npm run dev      # → http://localhost:5173
```

Drag to orbit · scroll to zoom · `1` `2` `3` for dawn, noon and dusk.

---

## The five-minute tour

Open the app, open the console, and type:

```js
pookalam.world.setTimeOfDay(0.95)     // dusk. Watch the lamp take over.
pookalam.world.kalamRadius            // 4.5 — metres
await pookalam.store.load()           // the kalam, part-laid, with real fills
pookalam.painter.guide.regions.length // 41 fillable areas
```

Then tap the bare disc of earth. It says:

> tapped (0.62, 0.41) — M2's pickRegion returns null, so nothing fills yet

That one line is the whole project in miniature. The tap already arrived as a
point on M2's canvas — the world raycast the disc and did the conversion. M1's
guide is already loaded on that canvas. M4's fake collaborator is already
writing to it every five seconds. Nothing is on the ground only because
`world.setSurface(painter.texture)` is a commented line in `main.ts`.

The moment `pickRegion` returns a region id instead of `null`, this becomes a
working pookalam painter and **nothing else has to change**.

## Where to read, in order

| Read this | For |
|---|---|
| [`src/contracts.ts`](src/contracts.ts) | **Start here.** Every seam between every module, in one file. |
| [`src/main.ts`](src/main.ts) | The whole boot sequence, top to bottom, in about forty lines. |
| [`src/world/yard.ts`](src/world/yard.ts) | The plot, and the two calls that are the entire seam between a drawing and the 3-D scene. |
| [`src/world/camera.ts`](src/world/camera.ts) | The opening descent, and why every number in it is what it is. |
| [`src/world/clouds.ts`](src/world/clouds.ts) | ~670 sprites in two draw calls. The instancing technique M3 will need. |

Each module's `index.ts` opens with a header block saying what that module owns,
what already works, and what is deliberately left. Those headers are the brief
for now — the written docs come back separately.

The one architectural rule: **a module never imports another module's internals,
and never reaches into `src/world/`.** It gets what it needs through `WorldAPI`
and the interfaces in `contracts.ts`. That is the only reason six groups can
write code at the same time.

## The tree

```
src/
  contracts.ts          every interface between every module — the only shared file
  main.ts               boot, top to bottom, forty lines of actual sequence
  styles.css            the veil and three corners of chrome

  world/                ← FINISHED. Read it; you should not need to change it.
    world.ts            renderer, scene, loop, and the WorldAPI modules get
    camera.ts           the opening descent, and orbiting one kalam
    yard.ts             the bare disc — and the seam a canvas arrives through
    terrain.ts          the floor's shape, as a pure function
    ground.ts           the same landscape at two resolutions, with no seam
    sky.ts              a gradient and a dot product. No HDRI.
    daylight.ts         time of day as one number: sun, sky, clouds, fog, shadows
    clouds.ts           two decks, ~670 billboard puffs, 2 draw calls
    lamp.ts             the നിലവിളക്ക്, and the only thing that flickers

  modules/              ← YOUR WORK LIVES HERE
    chalk/    M1        one worked design; eleven to go
    painter/  M2        a working canvas; hit-testing to go
    flowers/  M3        six flowers; the palette and the 3-D petals to go
    store/    M4        a mock with a fake collaborator; the server to go
    ui/       M5        a veil and a slider; everything else to go
    share/    M6        nothing yet

  util/                 seeded RNG, typed event bus
```

Zero external assets, and no webfont — the chrome uses the platform's own type,
which already ships the optical sizing and tracking tables a downloaded face
would only approximate. No `.glb`, no HDRI, no image downloads: every cloud and
every square metre of ground is arithmetic.

Measured, headless Chromium at 1440×900: **120 fps**, 10 draw calls, 255 k
triangles for the entire courtyard.
