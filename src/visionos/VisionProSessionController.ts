import * as THREE from "three";
import type { GearboxScene } from "../gearbox/GearboxScene";
import type { GearboxSimulation, GearId, CasingMode } from "../simulation/GearboxSimulation";
import type { ExplodedView } from "../gearbox/ExplodedView";
import type { GearFailureAnimation } from "../gearbox/GearFailureAnimation";
import type { SoundEffects } from "../audio/SoundEffects";
import { SpatialUIManager } from "./SpatialUIManager";
import { SpatialGestureController } from "./SpatialGestureController";
import { getPreferredSpatialMode } from "./VisionProDetector";
import { getComponent } from "../education/ComponentData";

export interface VisionProSessionStatus {
  active: boolean;
  scaleMode: "table" | "life";
  scale: number;
  hint: string;
}

/**
 * Controller for Apple Vision Pro experiential spatial computing in visionOS Safari.
 * Manages WebXR immersive sessions with:
 * - Natural Gaze & Pinch (transient pointer)
 * - 25-Joint WebXR Hand Tracking & Gestures (Poking, Pinching, Two-handed scaling & rotation)
 * - Native 3D Spatial Glass HUD, Quick Shifter, and Component Inspector (no DOM overlay needed)
 * - Ergonomic spatial positioning and contact shadow grounding
 */
export class VisionProSessionController {
  private readonly world: GearboxScene;
  private readonly sim: GearboxSimulation;
  private readonly explode: ExplodedView;
  private readonly failure: GearFailureAnimation;
  private readonly audio: SoundEffects;

  private _active = false;
  private _scaleMode: "table" | "life" = "table";
  private _scale = 0.35;
  private referenceSpace: XRReferenceSpace | null = null;

  // In-World 3D Spatial UI & Hand Gesture Controller
  spatialUI: SpatialUIManager | null = null;
  gestureController: SpatialGestureController | null = null;

  private spatialGroup = new THREE.Group();
  private shadowPlane: THREE.Mesh | null = null;
  private spatialLight: THREE.DirectionalLight | null = null;
  private currentComponentId: string | null = null;

  onStatusChange?: (status: VisionProSessionStatus) => void;

  constructor(
    world: GearboxScene,
    sim: GearboxSimulation,
    explode: ExplodedView,
    failure: GearFailureAnimation,
    audio: SoundEffects,
  ) {
    this.world = world;
    this.sim = sim;
    this.explode = explode;
    this.failure = failure;
    this.audio = audio;

    this.spatialGroup.name = "VisionProSpatialWorkspace";
    this.world.scene.add(this.spatialGroup);
  }

  get active(): boolean {
    return this._active;
  }

  get scaleMode(): "table" | "life" {
    return this._scaleMode;
  }

  get scale(): number {
    return this._scale;
  }

  get currentComponent(): string | null {
    return this.currentComponentId;
  }

  get xrReferenceSpace(): XRReferenceSpace | null {
    return this.referenceSpace;
  }

  async start(): Promise<boolean> {
    if (this._active) return true;
    if (typeof navigator === "undefined" || !navigator.xr) {
      throw new Error("WebXR is not available in this browser.");
    }

    const mode = await getPreferredSpatialMode();
    if (!mode) {
      throw new Error("Spatial WebXR (immersive-vr / immersive-ar) is not supported on this device/browser.");
    }

    this.world.renderer.xr.enabled = true;

    // On visionOS Safari, we request immersive-vr/ar with hand-tracking without dom-overlay
    let session: XRSession;
    try {
      session = await navigator.xr.requestSession(mode, {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hand-tracking", "hit-test", "layers"],
      });
    } catch {
      // Fallback if local-floor is not granted
      session = await navigator.xr.requestSession(mode, {
        requiredFeatures: ["local"],
        optionalFeatures: ["hand-tracking", "hit-test", "layers"],
      });
    }

    await this.world.renderer.xr.setSession(session);

    try {
      this.referenceSpace = await session.requestReferenceSpace("local-floor");
    } catch {
      this.referenceSpace = await session.requestReferenceSpace("local");
    }

    this._active = true;
    this.hideStudioForSpatial();
    this.setupSpatialScene();
    this.setupSpatialUI();
    this.setupGestureController();

    session.addEventListener("end", () => this.onSessionEnd());

    this.emitStatus("Vision Pro Spatial Experience active! Pinch to shift gears or inspect parts.");
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

  private setupSpatialScene(): void {
    // Grounding contact shadow plane
    if (!this.shadowPlane) {
      const planeGeo = new THREE.PlaneGeometry(3.5, 3.5);
      planeGeo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
      this.shadowPlane = new THREE.Mesh(planeGeo, shadowMat);
      this.shadowPlane.receiveShadow = true;
      this.spatialGroup.add(this.shadowPlane);
    }
    this.shadowPlane.visible = true;

    // Directional light from above for realistic grounding
    if (!this.spatialLight) {
      const light = new THREE.DirectionalLight(0xffffff, 1.35);
      light.position.set(0.6, 3.2, 1.2);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.001;
      this.spatialGroup.add(light);
      this.spatialLight = light;
    }
    this.spatialLight.visible = true;

    // Attach gearbox model to spatial group
    this.spatialGroup.add(this.world.model.root);

    // Position the workspace at a comfortable eye-level desk height in front of the user:
    // 1.05m elevation, 1.15m forward distance
    this.spatialGroup.position.set(0, 1.05, -1.15);
    this.spatialGroup.rotation.set(0, 0, 0);

    this.applyScale(this._scaleMode === "table" ? 0.35 : 1.0);
    this.world.controls.enabled = false;
  }

  private setupSpatialUI(): void {
    if (this.spatialUI) {
      this.spatialGroup.remove(this.spatialUI.root);
    }

    this.spatialUI = new SpatialUIManager({
      onShift: (gear: GearId) => {
        this.audio.unlock();
        const result = this.sim.attemptShift(gear, { autoClutch: true });
        if (result.grind) this.audio.grind();
        else if (result.accepted) this.audio.shiftClick();
        if (result.destroyed) {
          this.audio.explode();
          this.failure.triggerCatastrophe();
        }
      },
      onRepair: () => {
        this.audio.unlock();
        this.audio.ratchet();
        this.sim.repair();
        this.failure.repair();
      },
      onExplodeToggle: () => {
        this.audio.unlock();
        this.audio.shiftClick();
        return this.explode.toggle();
      },
      onCasingCycle: () => {
        this.audio.unlock();
        this.audio.shiftClick();
        const modes: CasingMode[] = ["cutaway", "solid", "wireframe", "hidden"];
        const current = this.world.model.getCasingMode();
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        this.world.model.setCasingMode(next);
        return next;
      },
      onScaleToggle: () => {
        this.audio.unlock();
        this.audio.shiftClick();
        this.toggleScaleMode();
      },
      onComponentInspect: (id: string) => {
        this.inspectComponent(id);
      },
      onExit: () => {
        void this.stop();
      },
      onPlayClick: () => {
        this.audio.unlock();
        this.audio.shiftClick();
      },
    });

    this.spatialGroup.add(this.spatialUI.root);
  }

  private setupGestureController(): void {
    if (this.gestureController) {
      this.gestureController.dispose();
    }

    this.gestureController = new SpatialGestureController(
      this.world.scene,
      this.world.renderer,
      this.spatialUI!,
      {
        onPinchSelect: (_point: THREE.Vector3, ray?: THREE.Ray) => {
          this.handlePinchRaySelect(ray);
        },
        onTwoHandedScale: (scaleDelta: number) => {
          const newScale = THREE.MathUtils.clamp(this._scale * scaleDelta, 0.2, 1.4);
          this.applyScale(newScale);
          this.emitStatus(`Spatial Scale: ${this._scale.toFixed(2)}x`);
        },
        onTwoHandedRotate: (angleDelta: number) => {
          this.spatialGroup.rotateY(angleDelta);
        },
        onTwoHandedTranslate: (delta: THREE.Vector3) => {
          this.spatialGroup.position.add(delta);
        },
      },
    );
  }

  private handlePinchRaySelect(ray?: THREE.Ray): void {
    let intersectRay = ray;
    if (!intersectRay) {
      // Raycast from active camera forward
      const xrCam = this.world.renderer.xr.getCamera();
      const origin = new THREE.Vector3();
      const dir = new THREE.Vector3(0, 0, -1);
      xrCam.getWorldPosition(origin);
      dir.applyQuaternion(xrCam.quaternion).normalize();
      intersectRay = new THREE.Ray(origin, dir);
    }

    this.world.raycaster.ray.copy(intersectRay);

    // 1. First check if a Spatial UI button was pinched
    if (this.spatialUI) {
      const uiHits = this.world.raycaster.intersectObjects(this.spatialUI.interactableObjects, true);
      if (uiHits.length > 0) {
        const topHit = uiHits[0].object;
        if (this.spatialUI.handleTrigger(topHit)) {
          return;
        }
      }
    }

    // 2. Next check if a gearbox component was pinched
    const hits = this.world.raycaster.intersectObjects(this.world.model.pickables, true);
    const internalHit = hits.find((h) => {
      const id = h.object.userData.componentId as string | undefined;
      return id && id !== "casing";
    });

    const targetHit = internalHit || hits[0];
    if (targetHit) {
      const id = targetHit.object.userData.componentId as string | undefined;
      if (id) {
        this.inspectComponent(id);
      }
    }
  }

  inspectComponent(id: string): void {
    const info = getComponent(id);
    if (!info) return;

    this.currentComponentId = id;
    this.world.model.highlight(id);
    this.audio.unlock();
    this.audio.shiftClick();

    if (this.spatialUI) {
      this.spatialUI.showComponent(info);
      this.sim.feedback = `Selected: ${info.name}`;
    }
  }

  toggleScaleMode(): void {
    if (this._scaleMode === "table") {
      this._scaleMode = "life";
      this.applyScale(1.0);
      this.spatialUI?.setScaleLabel("Life (1.0x)");
      this.emitStatus("Switched to Life-Size (1:1 scale)");
    } else {
      this._scaleMode = "table";
      this.applyScale(0.35);
      this.spatialUI?.setScaleLabel("Table (0.35x)");
      this.emitStatus("Switched to Tabletop (0.35x scale)");
    }
  }

  applyScale(scale: number): void {
    this._scale = scale;
    this.world.model.root.scale.setScalar(scale);

    // Position contact shadow receiver plane directly under the scaled casing
    if (this.shadowPlane) {
      this.shadowPlane.scale.setScalar(scale);
      this.shadowPlane.position.y = -0.22 * scale;
    }

    // Adjust spatial UI positions relative to gearbox scale
    if (this.spatialUI) {
      this.spatialUI.root.position.set(0, 0, 0);
    }
  }

  update(_dt: number, frame: XRFrame | null): void {
    if (!this._active) return;

    // Update hand joint tracking and spatial gestures
    if (this.gestureController) {
      this.gestureController.update(frame);
    }

    // Update 3D in-world HUD and controls
    if (this.spatialUI) {
      const snap = this.sim.snapshot();
      this.spatialUI.update(snap, performance.now());
    }
  }

  private hideStudioForSpatial(): void {
    this.world.scene.background = null;
    this.world.scene.fog = null;
    this.world.renderer.setClearAlpha(0);
    this.world.studioObjects.forEach((obj) => {
      obj.userData._spatialWasVisible = obj.visible;
      obj.visible = false;
    });
  }

  private restoreStudio(): void {
    this.world.scene.background = new THREE.Color(0x07090d);
    this.world.scene.fog = new THREE.Fog(0x07090d, 6, 16);
    this.world.renderer.setClearAlpha(1);
    this.world.studioObjects.forEach((obj) => {
      obj.visible = obj.userData._spatialWasVisible !== false;
    });
  }

  private onSessionEnd(): void {
    this._active = false;
    this.referenceSpace = null;

    if (this.gestureController) {
      this.gestureController.dispose();
      this.gestureController = null;
    }

    if (this.spatialUI) {
      this.spatialGroup.remove(this.spatialUI.root);
      this.spatialUI = null;
    }

    if (this.shadowPlane) {
      this.shadowPlane.visible = false;
    }
    if (this.spatialLight) {
      this.spatialLight.visible = false;
    }

    // Reattach model back to world.scene root
    this.world.scene.add(this.world.model.root);
    this.world.model.root.position.set(0, 0, 0);
    this.world.model.root.quaternion.identity();
    this.world.model.root.scale.set(1, 1, 1);

    this.restoreStudio();
    this.world.controls.enabled = true;
    this.world.renderer.xr.enabled = false;
    this.world.resize();

    this.emitStatus("Vision Pro Spatial Session ended");
  }

  private emitStatus(hint: string): void {
    this.onStatusChange?.({
      active: this._active,
      scaleMode: this._scaleMode,
      scale: this._scale,
      hint,
    });
  }
}
