import { AnimationMixer, Box3, Group, type AnimationClip, type Scene } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Guest = { path: string; x: number; z: number; height: number; turn?: number };

// A wide ring keeps the flower art entirely paintable while making the
// courtyard feel like a festive gathering. Every guest faces the pookalam.
const GUESTS: Guest[] = [
  { path: '/captain_america.glb', x: -7.0, z: -1.5, height: 2.65 },
  { path: '/hulk_fan_art.glb', x: -4.25, z: -6.15, height: 3.9 },
  { path: '/iron_man_mk7.glb', x: 0.8, z: -7.35, height: 2.7 },
  { path: '/loki_magic_supremacy%20(1).glb', x: 5.15, z: -5.15, height: 2.8 },
  { path: '/thor_textured_no_rig.glb', x: 7.05, z: -0.8, height: 2.9 },
  { path: '/spiderman.glb', x: 6.15, z: 4.3, height: 2.55 },
];

export class FestivalGuests {
  private readonly mixers: AnimationMixer[] = [];

  private constructor(scene: Scene, loaded: Array<{ scene: Group; animations: AnimationClip[] }>) {
    loaded.forEach(({ scene: model, animations }, index) => {
      const guest = GUESTS[index];
      const rawBounds = new Box3().setFromObject(model);
      const rawHeight = rawBounds.max.y - rawBounds.min.y;
      model.scale.setScalar(rawHeight ? guest.height / rawHeight : 1);
      const scaledBounds = new Box3().setFromObject(model);
      model.position.set(guest.x, -scaledBounds.min.y, guest.z);
      model.rotation.y = Math.atan2(-guest.x, -guest.z) + (guest.turn ?? 0);
      model.name = `festival-guest-${index + 1}`;
      model.traverse((node) => { node.castShadow = true; node.receiveShadow = true; });
      scene.add(model);
      // Captain America stays in a still, watchful pose. The other guests can
      // play an animation supplied by their respective source model.
      if (index !== 0 && animations.length) {
        const mixer = new AnimationMixer(model);
        animations.forEach((clip) => mixer.clipAction(clip).play());
        this.mixers.push(mixer);
      }
    });
  }

  static async arrive(scene: Scene): Promise<FestivalGuests> {
    const loader = new GLTFLoader();
    const models = await Promise.all(GUESTS.map(async (guest) => {
      const gltf = await loader.loadAsync(guest.path);
      return { scene: gltf.scene, animations: gltf.animations };
    }));
    return new FestivalGuests(scene, models);
  }

  update(dt: number): void { this.mixers.forEach((mixer) => mixer.update(dt)); }
}
