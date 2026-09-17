import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GearboxModel } from "./GearboxModel";

export class GearboxScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly model: GearboxModel;
  readonly raycaster = new THREE.Raycaster();
  readonly pointer = new THREE.Vector2();
  readonly studioObjects: THREE.Object3D[] = [];
  private readonly clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x07090d, 6, 16);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 40);
    this.camera.position.set(2.15, 1.15, 2.4);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x07090d, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.xr.enabled = false;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.set(0, -0.05, 0.05);
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.86;

    this.model = new GearboxModel();
    this.scene.add(this.model.root);
    this.addStudio();
    this.resize();
  }

  addStudio(): void {
    const hemi = new THREE.HemisphereLight(0xc5d4e8, 0x1a140e, 0.7);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4e5, 1.55);
    key.position.set(3.2, 4.2, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 16;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x7ecbff, 0.45);
    fill.position.set(-3, 1.6, -1.5);
    this.scene.add(fill);

    const rim = new THREE.SpotLight(0x00e5ff, 8, 12, 0.5, 0.4, 1);
    rim.position.set(-1.4, 2.2, 3.2);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshStandardMaterial({
        color: 0x10141b,
        metalness: 0.55,
        roughness: 0.38,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.78;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.studioObjects.push(floor);

    const grid = new THREE.GridHelper(8, 32, 0x14303a, 0x121820);
    grid.position.y = -0.775;
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.45;
    this.scene.add(grid);
    this.studioObjects.push(grid);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.85, 48),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.77;
    this.scene.add(glow);
    this.studioObjects.push(glow);
  }

  resize(width = window.innerWidth, height = window.innerHeight): void {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  pick(clientX: number, clientY: number, rect?: DOMRect): string | null {
    const r = rect ?? this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;

    let activeCam: THREE.Camera = this.camera;
    if (this.renderer.xr.isPresenting) {
      const xrCam = this.renderer.xr.getCamera();
      activeCam = xrCam.cameras.length > 0 ? xrCam.cameras[0] : xrCam;
    }

    this.raycaster.setFromCamera(this.pointer, activeCam);
    const hits = this.raycaster.intersectObjects(this.model.pickables, true);

    // Prioritize internal components so the outer casing box never blocks picking:
    const internalHit = hits.find((h) => {
      const id = h.object.userData.componentId as string | undefined;
      return id && id !== "casing";
    });
    if (internalHit) {
      return internalHit.object.userData.componentId as string;
    }

    // Fall back to casing if only the casing was hit (outer edge, drain plug, sight glass):
    for (const hit of hits) {
      const id = hit.object.userData.componentId as string | undefined;
      if (id) return id;
    }
    return null;
  }

  /** Advance clock + controls; returns dt. Rendering is done via renderFrame. */
  tick(): number {
    const dt = this.clock.getDelta();
    if (!this.renderer.xr.isPresenting) this.controls.update();
    return dt;
  }

  renderFrame(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Legacy single-shot render for non-XR loops. */
  render(): number {
    const dt = this.tick();
    this.renderFrame();
    return dt;
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
  }
}
