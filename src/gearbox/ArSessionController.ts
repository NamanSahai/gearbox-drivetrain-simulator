import * as THREE from "three";
import type { GearboxScene } from "./GearboxScene";

export type ArScaleMode = "table" | "floor";

export interface ArStatus {
  active: boolean;
  placed: boolean;
  repositioning: boolean;
  scaleMode: ArScaleMode;
  hint: string;
}

/**
 * Mobile WebXR immersive-AR controller with real-world Floor and Table surface tracking.
 * Features:
 * - Table Mode (0.35x scale) for desks and tabletops.
 * - Floor Mode (1.0x life-size scale) for 1:1 room/garage scale.
 * - Planar surface hit-testing with orientation-aligned animated reticle.
 * - Contact shadow receiver plane for realistic ground grounding.
 * - Repositioning, continuous Y rotation, and safe DOM overlay interaction.
 */
export class ArSessionController {
  private readonly world: GearboxScene;
  private hitTestSource: XRHitTestSource | null = null;
  private viewerSpace: XRReferenceSpace | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private reticle: THREE.Group | null = null;
  private shadowPlane: THREE.Mesh | null = null;
  private arLight: THREE.DirectionalLight | null = null;

  private _active = false;
  private _placed = false;
  private _repositioning = false;
  private _scaleMode: ArScaleMode = "table";
  private _rotationY = 0;
  private _surfacePose: THREE.Vector3 = new THREE.Vector3();
  private _surfaceQuat: THREE.Quaternion = new THREE.Quaternion();

  onStatusChange?: (status: ArStatus) => void;

  constructor(world: GearboxScene) {
    this.world = world;
  }

  get active(): boolean {
    return this._active;
  }

  get placed(): boolean {
    return this._placed;
  }

  get repositioning(): boolean {
    return this._repositioning;
  }

  get scaleMode(): ArScaleMode {
    return this._scaleMode;
  }

  static async isSupported(): Promise<boolean> {
    if (typeof navigator === "undefined" || !("xr" in navigator) || !navigator.xr) {
      return false;
    }
    try {
      return await navigator.xr.isSessionSupported("immersive-ar");
    } catch {
      return false;
    }
  }

  async start(): Promise<boolean> {
    if (this._active) return true;
    const xr = navigator.xr;
    if (!xr) {
      throw new Error("WebXR is not available in this browser. Use Chrome on Android or WebXR Viewer on iOS.");
    }
    const supported = await xr.isSessionSupported("immersive-ar");
    if (!supported) {
      throw new Error("WebXR Immersive AR is not supported on this device/browser.");
    }

    this.world.renderer.xr.enabled = true;
    const session = await xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "local-floor", "plane-detection"],
      domOverlay: { root: document.getElementById("app") ?? document.body },
    });

    await this.world.renderer.xr.setSession(session);

    // Prefer local-floor for accurate floor level tracking; fall back to local
    try {
      this.referenceSpace = await session.requestReferenceSpace("local-floor");
    } catch {
      this.referenceSpace = await session.requestReferenceSpace("local");
    }

    this.viewerSpace = await session.requestReferenceSpace("viewer");
    this.hitTestSource = (await session.requestHitTestSource!({ space: this.viewerSpace })) ?? null;

    this.hideStudioForAr();
    this.ensureReticle();
    this.ensureShadowPlane();

    this._active = true;
    this._placed = false;
    this._repositioning = false;
    this._rotationY = 0;
    this.world.model.root.visible = false;
    this.world.controls.enabled = false;

    session.addEventListener("select", this.handleSelect);
    session.addEventListener("end", () => this.onSessionEnd());

    this.emitStatus("Aim camera at table or floor to detect surface");
    return true;
  }

  async stop(): Promise<void> {
    const session = this.world.renderer.xr.getSession();
    if (session) {
      await session.end();
    } else {
      this.onSessionEnd();
    }
  }

  setScaleMode(mode: ArScaleMode): void {
    this._scaleMode = mode;
    if (this._placed) {
      this.applyPlacement();
    }
    this.emitStatus(
      this._placed
        ? `Switched to ${mode === "table" ? "Tabletop (0.35x)" : "Floor (1:1 Life-Size)"} scale`
        : `Surface preset set to ${mode === "table" ? "Tabletop" : "Floor"} mode`,
    );
  }

  setRepositioning(reposition: boolean): void {
    if (!this._active) return;
    this._repositioning = reposition;
    if (this.reticle) {
      this.reticle.visible = reposition;
    }
    this.emitStatus(
      reposition
        ? "Aim at a new table or floor surface, then tap to place"
        : "Repositioning cancelled",
    );
  }

  rotate(deltaRadians: number): void {
    this._rotationY += deltaRadians;
    if (this._placed) {
      this.applyPlacement();
    }
  }

  update(_dt: number, frame: XRFrame | null): void {
    if (!this._active || !frame || !this.hitTestSource || !this.referenceSpace || !this.reticle) {
      return;
    }

    // Only look for surface hits if not placed or in reposition mode
    if (this._placed && !this._repositioning) {
      this.reticle.visible = false;
      return;
    }

    const hits = frame.getHitTestResults(this.hitTestSource);
    if (hits.length === 0) {
      this.reticle.visible = false;
      return;
    }

    const pose = hits[0].getPose(this.referenceSpace);
    if (!pose) {
      this.reticle.visible = false;
      return;
    }

    this.reticle.visible = true;
    this.reticle.matrix.fromArray(pose.transform.matrix);
    this.reticle.matrix.decompose(this.reticle.position, this.reticle.quaternion, this.reticle.scale);
    this.reticle.scale.set(1, 1, 1);

    // Save surface pose for placement
    this._surfacePose.copy(this.reticle.position);
    this._surfaceQuat.copy(this.reticle.quaternion);

    this.emitStatus(
      this._scaleMode === "floor"
        ? "Floor surface detected — tap anywhere to place life-size gearbox"
        : "Table surface detected — tap anywhere to place tabletop gearbox",
    );
  }

  private handleSelect = (_ev: XRInputSourceEvent): void => {
    // Avoid double placement if already placed and not actively repositioning
    if (!this._active || (this._placed && !this._repositioning)) return;
    if (!this.reticle || !this.reticle.visible) return;

    this.placeAtReticle();
  };

  private placeAtReticle(): void {
    if (!this.reticle) return;
    this._surfacePose.copy(this.reticle.position);
    this._surfaceQuat.copy(this.reticle.quaternion);

    this._placed = true;
    this._repositioning = false;
    this.reticle.visible = false;

    this.applyPlacement();

    this.emitStatus("Gearbox placed! Drag or use ↺ / ↻ to rotate, or shift gears below.");
  }

  private getTargetScale(): number {
    return this._scaleMode === "table" ? 0.35 : 1.0;
  }

  private applyPlacement(): void {
    const root = this.world.model.root;
    root.visible = true;

    const scale = this.getTargetScale();
    root.scale.setScalar(scale);

    // Base contact point: casing bottom is approx 0.22m below origin at scale 1.0
    const verticalOffset = 0.22 * scale;
    root.position.copy(this._surfacePose);
    root.position.y += verticalOffset;

    // Apply planar rotation combined with user Y rotation
    root.quaternion.copy(this._surfaceQuat);
    root.rotateY(this._rotationY);

    // Position contact shadow plane directly on the detected surface
    if (this.shadowPlane) {
      this.shadowPlane.visible = true;
      this.shadowPlane.position.copy(this._surfacePose);
      this.shadowPlane.position.y += 0.001; // tiny offset to prevent z-fighting with real surface
      this.shadowPlane.quaternion.copy(this._surfaceQuat);
      this.shadowPlane.scale.setScalar(scale);
    }
  }

  private ensureReticle(): void {
    if (this.reticle) {
      this.reticle.visible = true;
      return;
    }

    const group = new THREE.Group();

    // Outer targeting ring
    const outerGeo = new THREE.RingGeometry(0.12, 0.135, 48);
    outerGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const outerRing = new THREE.Mesh(outerGeo, ringMat);
    outerRing.renderOrder = 999;
    group.add(outerRing);

    // Inner center dot
    const innerGeo = new THREE.CircleGeometry(0.024, 24);
    innerGeo.rotateX(-Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x3dff9a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const innerDot = new THREE.Mesh(innerGeo, innerMat);
    innerDot.renderOrder = 999;
    group.add(innerDot);

    // 4 cardinal directional ticks
    const tickGeo = new THREE.PlaneGeometry(0.008, 0.04);
    tickGeo.rotateX(-Math.PI / 2);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthTest: false });

    const tickN = new THREE.Mesh(tickGeo, tickMat);
    tickN.position.z = -0.15;
    tickN.renderOrder = 999;
    group.add(tickN);

    const tickS = new THREE.Mesh(tickGeo, tickMat);
    tickS.position.z = 0.15;
    tickS.renderOrder = 999;
    group.add(tickS);

    const tickE = new THREE.Mesh(tickGeo, tickMat);
    tickE.position.x = 0.15;
    tickE.rotation.y = Math.PI / 2;
    tickE.renderOrder = 999;
    group.add(tickE);

    const tickW = new THREE.Mesh(tickGeo, tickMat);
    tickW.position.x = -0.15;
    tickW.rotation.y = Math.PI / 2;
    tickW.renderOrder = 999;
    group.add(tickW);

    group.matrixAutoUpdate = false;
    group.visible = false;
    this.world.scene.add(group);
    this.reticle = group;
  }

  private ensureShadowPlane(): void {
    if (this.shadowPlane) return;

    // Contact shadow plane that receives shadows from directional light
    const planeGeo = new THREE.PlaneGeometry(3.2, 3.2);
    planeGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.38 });
    this.shadowPlane = new THREE.Mesh(planeGeo, shadowMat);
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.visible = false;
    this.world.scene.add(this.shadowPlane);

    // Add dedicated soft AR directional light above model for realistic ground shadows
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(0.8, 3.5, 1.2);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.1;
    dir.shadow.camera.far = 8;
    dir.shadow.camera.left = -1.5;
    dir.shadow.camera.right = 1.5;
    dir.shadow.camera.top = 1.5;
    dir.shadow.camera.bottom = -1.5;
    dir.shadow.bias = -0.001;
    this.world.scene.add(dir);
    this.arLight = dir;
  }

  private hideStudioForAr(): void {
    this.world.scene.background = null;
    this.world.scene.fog = null;
    this.world.renderer.setClearAlpha(0);
    this.world.studioObjects.forEach((obj) => {
      obj.userData._arWasVisible = obj.visible;
      obj.visible = false;
    });
  }

  private restoreStudio(): void {
    this.world.scene.background = new THREE.Color(0x07090d);
    this.world.scene.fog = new THREE.Fog(0x07090d, 6, 16);
    this.world.renderer.setClearAlpha(1);
    this.world.studioObjects.forEach((obj) => {
      obj.visible = obj.userData._arWasVisible !== false;
    });
  }

  private onSessionEnd(): void {
    this._active = false;
    this._placed = false;
    this._repositioning = false;

    if (this.hitTestSource) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }
    this.viewerSpace = null;
    this.referenceSpace = null;

    if (this.reticle) this.reticle.visible = false;
    if (this.shadowPlane) this.shadowPlane.visible = false;
    if (this.arLight) this.arLight.visible = false;

    const root = this.world.model.root;
    root.visible = true;
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.set(1, 1, 1);

    this.restoreStudio();
    this.world.controls.enabled = true;
    this.world.renderer.xr.enabled = false;
    this.world.resize();

    this.emitStatus("AR Session ended");
  }

  private emitStatus(hint: string): void {
    this.onStatusChange?.({
      active: this._active,
      placed: this._placed,
      repositioning: this._repositioning,
      scaleMode: this._scaleMode,
      hint,
    });
  }
}
