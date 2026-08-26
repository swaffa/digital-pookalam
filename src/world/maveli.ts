import { AnimationMixer, Box3, Group, type Scene } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** The locally supplied Maveli is part of the courtyard, not a browser overlay. */
export class Maveli {
  private readonly mixer: AnimationMixer | null;
  private readonly model: Group;

  private constructor(scene: Scene, model: Group, animations: Parameters<AnimationMixer['clipAction']>[0][]) {
    this.model = model;
    this.mixer = animations.length ? new AnimationMixer(model) : null;
    if (this.mixer) animations.forEach((clip) => this.mixer!.clipAction(clip).play());
    scene.add(model);
  }

  static async place(scene: Scene): Promise<Maveli> {
    const gltf = await new GLTFLoader().loadAsync('/maveli/source/maveli.glb');
    const model = gltf.scene;
    model.name = 'maveli';

    // Asset files arrive at arbitrary units. Scale to a welcoming, life-size
    // figure beside the 9 m pookalam and put its feet exactly on the ground.
    const bounds = new Box3().setFromObject(model);
    const height = bounds.max.y - bounds.min.y;
    model.scale.setScalar(height ? 3.15 / height : 1);
    const scaled = new Box3().setFromObject(model);
    model.position.set(-5.85, -scaled.min.y, 3.75);
    model.rotation.y = Math.PI * 0.12;
    model.traverse((node) => { node.castShadow = true; node.receiveShadow = true; });

    return new Maveli(scene, model, gltf.animations);
  }

  update(dt: number): void {
    this.mixer?.update(dt);
    // A faint, friendly movement keeps even a static source model alive.
    this.model.rotation.y = Math.PI * 0.12 + Math.sin(performance.now() * 0.0012) * 0.035;
  }
}
