import * as THREE from "three";
import type { ComponentInfo } from "../education/ComponentData";
import { COMPONENTS } from "../education/ComponentData";
import type { CasingMode, GearId, SimulationSnapshot } from "../simulation/GearboxSimulation";
import { TACH_MAX_RPM, gearLabel, roadSpeedMph } from "../simulation/GearboxSimulation";

export interface SpatialButton {
  mesh: THREE.Mesh;
  id: string;
  type: "gear" | "action";
  action: () => void;
  basePosition: THREE.Vector3;
  label: string;
  isPushed?: boolean;
}

export interface SpatialUICallbacks {
  onShift: (gear: GearId) => void;
  onRepair: () => void;
  onExplodeToggle: () => boolean;
  onCasingCycle: () => CasingMode;
  onScaleToggle: () => void;
  onComponentInspect: (id: string) => void;
  onExit: () => void;
  onPlayClick?: () => void;
}

/**
 * Native 3D In-World Spatial UI for Apple Vision Pro (visionOS Safari).
 * Since visionOS Safari does not support 2D HTML DOM overlays in immersive WebXR,
 * this manager creates floating frosted-glass 3D panels with dynamic Canvas textures
 * that can be interacted with via Look & Pinch (transient pointer) or direct Index Finger Poke.
 */
export class SpatialUIManager {
  readonly root = new THREE.Group();
  readonly interactableObjects: THREE.Object3D[] = [];
  private buttons: SpatialButton[] = [];

  // 1. Spatial Floating HUD
  private hudMesh!: THREE.Mesh;
  private hudCanvas!: HTMLCanvasElement;
  private hudCtx!: CanvasRenderingContext2D;
  private hudTexture!: THREE.CanvasTexture;

  // 2. Spatial Floating Controls Bar
  private controlsGroup = new THREE.Group();
  private repairButtonMesh: THREE.Mesh | null = null;
  private scaleButtonMesh: THREE.Mesh | null = null;

  // 3. Spatial Component Inspector Card
  private inspectorGroup = new THREE.Group();
  private inspectorMesh!: THREE.Mesh;
  private inspectorCanvas!: HTMLCanvasElement;
  private inspectorCtx!: CanvasRenderingContext2D;
  private inspectorTexture!: THREE.CanvasTexture;
  private currentComponent: ComponentInfo | null = null;
  private inspectorVisible = false;

  private currentCasingMode: CasingMode = "cutaway";
  private isExploded = false;
  private lastRenderTime = 0;

  constructor(private readonly callbacks: SpatialUICallbacks) {
    this.root.name = "SpatialUIRoot";
    this.buildHud();
    this.buildControlsBar();
    this.buildInspectorCard();
    this.root.add(this.hudMesh, this.controlsGroup, this.inspectorGroup);
  }

  get isInspectorOpen(): boolean {
    return this.inspectorVisible;
  }

  /**
   * Builds the floating HUD showing Gear Badge, Speed, Tachometer, and Status Message.
   */
  private buildHud(): void {
    const width = 0.72;
    const height = 0.28;

    this.hudCanvas = document.createElement("canvas");
    this.hudCanvas.width = 1024;
    this.hudCanvas.height = 400;
    const ctx = this.hudCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D canvas context for Spatial HUD");
    this.hudCtx = ctx;

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;
    this.hudTexture.magFilter = THREE.LinearFilter;
    this.hudTexture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.hudMesh = new THREE.Mesh(geo, mat);
    // Positioned floating above the gearbox, angled toward the viewer
    this.hudMesh.position.set(0, 0.48, -0.15);
    this.hudMesh.rotation.x = 0.12;
  }

  /**
   * Builds the 3D interactive controls bar with gear buttons and action toggles.
   */
  private buildControlsBar(): void {
    this.controlsGroup.position.set(0, -0.32, 0.52);
    this.controlsGroup.rotation.x = -0.35; // Tilted ergonomically toward user's hands

    // Frosted glass background backing plate
    const backingGeo = new THREE.PlaneGeometry(0.88, 0.24);
    const backingMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.2,
      roughness: 0.35,
      transparent: true,
      opacity: 0.78,
      transmission: 0.3,
      side: THREE.DoubleSide,
    });
    const backing = new THREE.Mesh(backingGeo, backingMat);
    backing.position.z = -0.01;
    this.controlsGroup.add(backing);

    // Row 1: Gear Selection Buttons [R] [1] [2] [3] [4] [5] [N]
    const gears: Array<{ id: GearId; label: string }> = [
      { id: -1, label: "R" },
      { id: 1, label: "1" },
      { id: 2, label: "2" },
      { id: 3, label: "3" },
      { id: 4, label: "4" },
      { id: 5, label: "5" },
      { id: 0, label: "N" },
    ];

    const gearSpacing = 0.11;
    const gearStartX = -((gears.length - 1) * gearSpacing) / 2;
    const gearY = 0.055;

    gears.forEach((g, i) => {
      const x = gearStartX + i * gearSpacing;
      const btn = this.createButton({
        label: g.label,
        width: 0.088,
        height: 0.072,
        color: g.id === -1 ? 0xf59e0b : g.id === 0 ? 0x64748b : 0x0284c7,
        fontSize: 38,
        type: "gear",
        id: `gear-${g.id}`,
        action: () => {
          this.callbacks.onPlayClick?.();
          this.callbacks.onShift(g.id);
        },
      });
      btn.mesh.position.set(x, gearY, 0.008);
      btn.basePosition.copy(btn.mesh.position);
      this.controlsGroup.add(btn.mesh);
      this.buttons.push(btn);
      this.interactableObjects.push(btn.mesh);
    });

    // Row 2: Actions Row [Repair] [Explode] [Casing] [Scale] [Exit]
    const actionY = -0.055;

    // 1. Repair Button (pulsing crimson, hidden when not destroyed)
    const repairBtn = this.createButton({
      label: "Repair",
      width: 0.14,
      height: 0.058,
      color: 0xef4444,
      fontSize: 26,
      type: "action",
      id: "action-repair",
      action: () => {
        this.callbacks.onPlayClick?.();
        this.callbacks.onRepair();
      },
    });
    repairBtn.mesh.position.set(-0.33, actionY, 0.008);
    repairBtn.basePosition.copy(repairBtn.mesh.position);
    repairBtn.mesh.visible = false;
    this.controlsGroup.add(repairBtn.mesh);
    this.buttons.push(repairBtn);
    this.interactableObjects.push(repairBtn.mesh);
    this.repairButtonMesh = repairBtn.mesh;

    // 2. Explode Button
    const explodeBtn = this.createButton({
      label: "Explode",
      width: 0.14,
      height: 0.058,
      color: 0x334155,
      fontSize: 26,
      type: "action",
      id: "action-explode",
      action: () => {
        this.callbacks.onPlayClick?.();
        this.isExploded = this.callbacks.onExplodeToggle();
        this.updateButtonLabel(explodeBtn, this.isExploded ? "Collapse" : "Explode");
      },
    });
    explodeBtn.mesh.position.set(-0.16, actionY, 0.008);
    explodeBtn.basePosition.copy(explodeBtn.mesh.position);
    this.controlsGroup.add(explodeBtn.mesh);
    this.buttons.push(explodeBtn);
    this.interactableObjects.push(explodeBtn.mesh);

    // 3. Casing Mode Button
    const casingBtn = this.createButton({
      label: "Cutaway",
      width: 0.14,
      height: 0.058,
      color: 0x334155,
      fontSize: 26,
      type: "action",
      id: "action-casing",
      action: () => {
        this.callbacks.onPlayClick?.();
        this.currentCasingMode = this.callbacks.onCasingCycle();
        const label =
          this.currentCasingMode.charAt(0).toUpperCase() + this.currentCasingMode.slice(1);
        this.updateButtonLabel(casingBtn, label);
      },
    });
    casingBtn.mesh.position.set(0.01, actionY, 0.008);
    casingBtn.basePosition.copy(casingBtn.mesh.position);
    this.controlsGroup.add(casingBtn.mesh);
    this.buttons.push(casingBtn);
    this.interactableObjects.push(casingBtn.mesh);

    // 4. Scale Button
    const scaleBtn = this.createButton({
      label: "Table",
      width: 0.13,
      height: 0.058,
      color: 0x334155,
      fontSize: 26,
      type: "action",
      id: "action-scale",
      action: () => {
        this.callbacks.onPlayClick?.();
        this.callbacks.onScaleToggle();
      },
    });
    scaleBtn.mesh.position.set(0.17, actionY, 0.008);
    scaleBtn.basePosition.copy(scaleBtn.mesh.position);
    this.controlsGroup.add(scaleBtn.mesh);
    this.buttons.push(scaleBtn);
    this.interactableObjects.push(scaleBtn.mesh);
    this.scaleButtonMesh = scaleBtn.mesh;

    // 5. Exit Button
    const exitBtn = this.createButton({
      label: "Exit",
      width: 0.11,
      height: 0.058,
      color: 0x475569,
      fontSize: 26,
      type: "action",
      id: "action-exit",
      action: () => {
        this.callbacks.onPlayClick?.();
        this.callbacks.onExit();
      },
    });
    exitBtn.mesh.position.set(0.31, actionY, 0.008);
    exitBtn.basePosition.copy(exitBtn.mesh.position);
    this.controlsGroup.add(exitBtn.mesh);
    this.buttons.push(exitBtn);
    this.interactableObjects.push(exitBtn.mesh);
  }

  /**
   * Builds the 3D floating Component Inspector card for visionOS.
   */
  private buildInspectorCard(): void {
    const width = 0.58;
    const height = 0.44;

    this.inspectorCanvas = document.createElement("canvas");
    this.inspectorCanvas.width = 1024;
    this.inspectorCanvas.height = 760;
    const ctx = this.inspectorCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D canvas context for Spatial Inspector");
    this.inspectorCtx = ctx;

    this.inspectorTexture = new THREE.CanvasTexture(this.inspectorCanvas);
    this.inspectorTexture.minFilter = THREE.LinearFilter;
    this.inspectorTexture.magFilter = THREE.LinearFilter;
    this.inspectorTexture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      map: this.inspectorTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.inspectorMesh = new THREE.Mesh(geo, mat);

    // Inspector card navigation buttons (Prev, Next, Dismiss)
    const prevBtn = this.createButton({
      label: "◀ Prev",
      width: 0.13,
      height: 0.05,
      color: 0x1e293b,
      fontSize: 24,
      type: "action",
      id: "inspector-prev",
      action: () => this.navigateComponent(-1),
    });
    prevBtn.mesh.position.set(-0.16, -0.17, 0.012);
    prevBtn.basePosition.copy(prevBtn.mesh.position);

    const nextBtn = this.createButton({
      label: "Next ▶",
      width: 0.13,
      height: 0.05,
      color: 0x1e293b,
      fontSize: 24,
      type: "action",
      id: "inspector-next",
      action: () => this.navigateComponent(1),
    });
    nextBtn.mesh.position.set(0.01, -0.17, 0.012);
    nextBtn.basePosition.copy(nextBtn.mesh.position);

    const closeBtn = this.createButton({
      label: "✕ Close",
      width: 0.13,
      height: 0.05,
      color: 0x334155,
      fontSize: 24,
      type: "action",
      id: "inspector-close",
      action: () => this.hideInspector(),
    });
    closeBtn.mesh.position.set(0.18, -0.17, 0.012);
    closeBtn.basePosition.copy(closeBtn.mesh.position);

    this.inspectorGroup.add(this.inspectorMesh, prevBtn.mesh, nextBtn.mesh, closeBtn.mesh);
    this.buttons.push(prevBtn, nextBtn, closeBtn);
    this.interactableObjects.push(prevBtn.mesh, nextBtn.mesh, closeBtn.mesh);

    // Positioned floating to the right of the transmission, angled inward
    this.inspectorGroup.position.set(0.55, 0.12, 0.1);
    this.inspectorGroup.rotation.y = -0.32;
    this.inspectorGroup.visible = false;
  }

  /**
   * Helper to create a 3D clickable button with dynamic Canvas label and rounded border.
   */
  private createButton(opts: {
    label: string;
    width: number;
    height: number;
    color: number;
    fontSize: number;
    type: "gear" | "action";
    id: string;
    action: () => void;
  }): SpatialButton {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    this.drawButtonCanvas(ctx, canvas.width, canvas.height, opts.label, opts.color, false);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(opts.width, opts.height);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
      isSpatialButton: true,
      buttonId: opts.id,
      canvas,
      ctx,
      texture,
      label: opts.label,
      baseColor: opts.color,
    };

    return {
      mesh,
      id: opts.id,
      type: opts.type,
      action: opts.action,
      basePosition: new THREE.Vector3(),
      label: opts.label,
      isPushed: false,
    };
  }

  private drawButtonCanvas(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    label: string,
    bgColor: number,
    highlight: boolean,
  ): void {
    ctx.clearRect(0, 0, w, h);

    const hex = `#${bgColor.toString(16).padStart(6, "0")}`;
    const radius = 22;

    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, radius);
    ctx.fillStyle = highlight ? "#38bdf8" : hex;
    ctx.fill();

    ctx.lineWidth = highlight ? 6 : 3;
    ctx.strokeStyle = highlight ? "#ffffff" : "rgba(255, 255, 255, 0.4)";
    ctx.stroke();

    ctx.fillStyle = highlight ? "#000000" : "#ffffff";
    ctx.font = `bold ${Math.round(h * 0.42)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, w / 2, h / 2 + 2);
  }

  private updateButtonLabel(btn: SpatialButton, newLabel: string): void {
    btn.label = newLabel;
    const data = btn.mesh.userData as {
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      texture: THREE.CanvasTexture;
      baseColor: number;
    };
    if (data) {
      this.drawButtonCanvas(
        data.ctx,
        data.canvas.width,
        data.canvas.height,
        newLabel,
        data.baseColor,
        false,
      );
      data.texture.needsUpdate = true;
    }
  }

  /**
   * Updates the spatial HUD visuals every frame using simulation snapshot data.
   */
  update(snap: SimulationSnapshot, nowMs: number): void {
    // Show/hide repair button based on destroyed state
    if (this.repairButtonMesh) {
      this.repairButtonMesh.visible = snap.destroyed;
    }

    // Refresh active gear button styling
    for (const btn of this.buttons) {
      if (btn.type === "gear") {
        const gearNum = Number(btn.id.replace("gear-", ""));
        const isActive = gearNum === snap.gear;
        const data = btn.mesh.userData as {
          canvas: HTMLCanvasElement;
          ctx: CanvasRenderingContext2D;
          texture: THREE.CanvasTexture;
          label: string;
          baseColor: number;
        };
        if (data) {
          const color = gearNum === -1 ? 0xf59e0b : gearNum === 0 ? 0x64748b : 0x0284c7;
          this.drawButtonCanvas(
            data.ctx,
            data.canvas.width,
            data.canvas.height,
            data.label,
            color,
            isActive,
          );
          data.texture.needsUpdate = true;
        }
      }
    }

    // Throttle HUD canvas redraws to ~30 FPS to optimize mobile/Vision Pro GPU fill rate
    if (nowMs - this.lastRenderTime > 32) {
      this.lastRenderTime = nowMs;
      this.drawHud(snap);
    }
  }

  private drawHud(snap: SimulationSnapshot): void {
    const ctx = this.hudCtx;
    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background glass card with subtle border
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 32);
    ctx.fillStyle = "rgba(10, 15, 24, 0.88)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = snap.destroyed ? "rgba(239, 68, 68, 0.75)" : "rgba(56, 189, 248, 0.4)";
    ctx.stroke();

    // 1. Gear Indicator Badge
    ctx.beginPath();
    ctx.roundRect(32, 32, 110, 110, 24);
    ctx.fillStyle = snap.gear === -1 ? "#d97706" : snap.gear === 0 ? "#334155" : "#0284c7";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 72px "SF Mono", monospace, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(gearLabel(snap.gear), 87, 87);

    // 2. Speedometer Readout
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("SPEED", 175, 55);

    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 64px "SF Mono", monospace, sans-serif';
    const kmhStr = Math.round(Math.abs(snap.speedKmh)).toString();
    ctx.fillText(kmhStr, 175, 118);

    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("km/h", 175 + ctx.measureText(kmhStr).width + 12, 114);

    ctx.fillStyle = "#64748b";
    ctx.font = '500 24px "SF Mono", monospace, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(roadSpeedMph(snap.speedKmh)))} mph`, 175, 148);

    // 3. Tachometer Readout & Animated Bar
    ctx.fillStyle = "#94a3b8";
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("TACHOMETER", 460, 55);

    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 64px "SF Mono", monospace, sans-serif';
    const rpmStr = Math.round(snap.engineRpm).toLocaleString();
    ctx.fillText(rpmStr, 460, 118);

    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("RPM", 460 + ctx.measureText(rpmStr).width + 12, 114);

    // Tachometer gauge bar
    const barX = 460;
    const barY = 135;
    const barW = 500;
    const barH = 22;

    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 11);
    ctx.fillStyle = "#1e293b";
    ctx.fill();

    // Colored gradient zones: Green (cruising), Amber (upshift), Red (redline)
    const fillFrac = Math.min(1, Math.max(0, snap.engineRpm / TACH_MAX_RPM));
    if (fillFrac > 0.01) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(0.55, "#10b981");
      grad.addColorStop(0.72, "#f59e0b");
      grad.addColorStop(0.85, "#ef4444");
      grad.addColorStop(1.0, "#ef4444");

      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * fillFrac, barH, 11);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Moving needle marker
    const needleX = barX + barW * fillFrac;
    ctx.beginPath();
    ctx.roundRect(needleX - 3, barY - 4, 6, barH + 8, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // 4. Feedback Marquee Banner
    ctx.beginPath();
    ctx.roundRect(32, 185, w - 64, 180, 20);
    ctx.fillStyle = snap.destroyed
      ? "rgba(239, 68, 68, 0.22)"
      : snap.stalled
        ? "rgba(245, 158, 11, 0.2)"
        : "rgba(30, 41, 59, 0.65)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = snap.destroyed ? "#ef4444" : snap.stalled ? "#f59e0b" : "rgba(255, 255, 255, 0.15)";
    ctx.stroke();

    ctx.fillStyle = snap.destroyed ? "#fca5a5" : snap.stalled ? "#fde68a" : "#e2e8f0";
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Text wrapping for feedback string
    const maxTextW = w - 100;
    const words = snap.feedback.split(" ");
    let line = "";
    const lines: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      if (ctx.measureText(testLine).width > maxTextW && i > 0) {
        lines.push(line);
        line = words[i] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    const startY = 275 - ((lines.length - 1) * 38) / 2;
    lines.forEach((l, idx) => {
      ctx.fillText(l.trim(), w / 2, startY + idx * 40);
    });

    this.hudTexture.needsUpdate = true;
  }

  /**
   * Displays the 3D floating Component Inspector card for the given component.
   */
  showComponent(info: ComponentInfo): void {
    this.currentComponent = info;
    this.inspectorVisible = true;
    this.inspectorGroup.visible = true;

    const ctx = this.inspectorCtx;
    const w = this.inspectorCanvas.width;
    const h = this.inspectorCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background glass card
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 28);
    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.stroke();

    // Category Eyebrow & Index Badge
    ctx.textAlign = "left";
    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 22px "SF Mono", monospace, sans-serif';
    ctx.fillText(info.category.toUpperCase(), 40, 56);

    const idx = COMPONENTS.findIndex((c) => c.id === info.id);
    const badgeText = `${idx >= 0 ? idx + 1 : 1} / ${COMPONENTS.length}`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#94a3b8";
    ctx.font = 'bold 22px "SF Mono", monospace, sans-serif';
    ctx.fillText(badgeText, w - 40, 56);

    // Component Name
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(info.name, 40, 116);

    // Divider line
    ctx.beginPath();
    ctx.moveTo(40, 138);
    ctx.lineTo(w - 40, 138);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();

    let curY = 175;

    // 1. Primary Function
    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("PRIMARY FUNCTION", 40, curY);
    curY += 32;

    ctx.fillStyle = "#e2e8f0";
    ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    curY = this.renderWrappedText(ctx, info.primaryFunction, 40, curY, w - 80, 32);
    curY += 18;

    // 2. Power Flow Role
    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("POWER FLOW ROLE", 40, curY);
    curY += 32;

    ctx.fillStyle = "#cbd5e1";
    ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    curY = this.renderWrappedText(ctx, info.powerFlowRole, 40, curY, w - 80, 32);
    curY += 18;

    // 3. Engineering Note
    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("ENGINEERING NOTE", 40, curY);
    curY += 32;

    ctx.fillStyle = "#94a3b8";
    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.renderWrappedText(ctx, info.engineeringNote, 40, curY, w - 80, 30);

    this.inspectorTexture.needsUpdate = true;
  }

  private renderWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): number {
    const words = text.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, y);
    return y + lineHeight;
  }

  hideInspector(): void {
    this.inspectorVisible = false;
    this.inspectorGroup.visible = false;
  }

  navigateComponent(delta: number): void {
    const total = COMPONENTS.length;
    let idx = 0;
    if (this.currentComponent) {
      idx = COMPONENTS.findIndex((c) => c.id === this.currentComponent!.id);
      if (idx < 0) idx = 0;
    }
    const nextIdx = (idx + delta + total) % total;
    const nextComp = COMPONENTS[nextIdx];
    this.callbacks.onPlayClick?.();
    this.callbacks.onComponentInspect(nextComp.id);
  }

  setScaleLabel(label: string): void {
    if (this.scaleButtonMesh) {
      const btn = this.buttons.find((b) => b.mesh === this.scaleButtonMesh);
      if (btn) this.updateButtonLabel(btn, label);
    }
  }

  /**
   * Handles raycast trigger on any spatial button (e.g. from visionOS Look & Pinch).
   */
  handleTrigger(object: THREE.Object3D): boolean {
    const btn = this.buttons.find((b) => b.mesh === object);
    if (!btn) return false;

    // Visual press depression animation
    btn.mesh.position.z = btn.basePosition.z - 0.015;
    setTimeout(() => {
      btn.mesh.position.z = btn.basePosition.z;
    }, 120);

    btn.action();
    return true;
  }

  /**
   * Checks for direct Index Finger Poke against spatial buttons.
   * If the index finger tip penetrates the button's proximity zone, triggers the button!
   */
  checkFingerPoke(fingerWorldPos: THREE.Vector3): boolean {
    const triggerDist = 0.045; // 4.5 cm interaction proximity

    for (const btn of this.buttons) {
      if (!btn.mesh.visible || !btn.mesh.parent?.visible) continue;

      const btnWorldPos = new THREE.Vector3();
      btn.mesh.getWorldPosition(btnWorldPos);

      const dist = fingerWorldPos.distanceTo(btnWorldPos);
      if (dist < triggerDist) {
        if (!btn.isPushed) {
          btn.isPushed = true;
          btn.mesh.position.z = btn.basePosition.z - 0.018;
          btn.action();
          return true;
        }
      } else if (dist > triggerDist * 1.5) {
        if (btn.isPushed) {
          btn.isPushed = false;
          btn.mesh.position.z = btn.basePosition.z;
        }
      }
    }
    return false;
  }
}
