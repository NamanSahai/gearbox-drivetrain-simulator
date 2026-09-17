import { SoundEffects } from "./audio/SoundEffects";
import { getComponent } from "./education/ComponentData";
import { ArSessionController } from "./gearbox/ArSessionController";
import { ExplodedView } from "./gearbox/ExplodedView";
import { GearFailureAnimation } from "./gearbox/GearFailureAnimation";
import { GearboxScene } from "./gearbox/GearboxScene";
import { applyScenario } from "./simulation/HypotheticalScenarios";
import { GearboxSimulation, type CasingMode, type GearId } from "./simulation/GearboxSimulation";
import { isIosDevice, launchIosArQuickLook } from "./gearbox/IosArQuickLook";
import { UIManager } from "./ui/UIManager";

const canvas = document.getElementById("viewport");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Viewport canvas is missing");
}

const world = new GearboxScene(canvas);
const sim = new GearboxSimulation();
const explode = new ExplodedView(world.model);
const failure = new GearFailureAnimation(world.scene, world.model);
const audio = new SoundEffects();
const ar = new ArSessionController(world);

const ui = new UIManager({
  onShift: (gear) => handleShift(gear),
  onClutch: (value) => {
    sim.clutchPedal = value;
  },
  onThrottle: (value) => {
    sim.throttle = value;
  },
  onBrake: (value) => {
    sim.brake = value;
  },
  onRestart: () => {
    audio.unlock();
    sim.restartEngine();
    audio.updateEngine(sim.engineRpm, sim.engineRunning, sim.throttle);
  },
  onRepair: () => {
    audio.unlock();
    audio.ratchet();
    sim.repair();
    failure.repair();
  },
  onMute: () => audio.toggleMute(),
  onInspect: (id) => inspect(id),
  onScenario: (id) => runScenario(id),
  onCasing: (mode: CasingMode) => world.model.setCasingMode(mode),
  onExplodeToggle: () => explode.toggle(),
  onExplodeAmount: (value) => explode.setTarget(value),
  onUnlockAudio: () => audio.unlock(),
  onAr: () => void startAr(),
  onArExit: () => void ar.stop(),
  onArScaleMode: (mode) => ar.setScaleMode(mode),
  onArReposition: () => ar.setRepositioning(!ar.repositioning),
  onArRotate: (deltaRadians) => ar.rotate(deltaRadians),
  onAppleQuickLook: () => void launchIosArQuickLook(world.model.root),
});

ar.onStatusChange = (status) => {
  ui.updateArStatus(status);
  sim.feedback = status.hint;
};

ui.bind();
ui.setArAvailable(true);
sim.restartEngine();

let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownTime = 0;

window.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  pointerDownX = ev.clientX;
  pointerDownY = ev.clientY;
  pointerDownTime = performance.now();
});

window.addEventListener("pointerup", (ev) => {
  if (ev.button !== 0) return;
  const dx = ev.clientX - pointerDownX;
  const dy = ev.clientY - pointerDownY;
  const dt = performance.now() - pointerDownTime;
  if (Math.hypot(dx, dy) > 12 || dt > 500) return;

  const target = ev.target as HTMLElement | null;
  if (
    target &&
    target.closest(
      "button, select, input, .sheet, .modal, .ar-bottom-controls, .ar-topbar, .quick-shifter-bar, .ar-inspect-card, a",
    )
  ) {
    return;
  }

  // If in AR mode and not yet placed or repositioning, let surface hit-test place the model
  if (ar.active && (!ar.placed || ar.repositioning)) {
    return;
  }

  const id = world.pick(ev.clientX, ev.clientY);
  if (id) {
    inspect(id);
  } else if (ar.active) {
    ui.hideArComponent();
  }
});

window.addEventListener("resize", () => world.resize());

function inspect(id: string): void {
  const info = getComponent(id);
  if (!info) return;
  world.model.highlight(id);
  audio.unlock();
  audio.shiftClick();

  if (ar.active) {
    ui.showArComponent(info);
    sim.feedback = `AR: ${info.name} selected`;
  } else {
    ui.showComponent(info);
  }
}

function handleShift(gear: GearId): void {
  audio.unlock();
  // Auto-clutch enabled for educational POC & responsive mobile touch shifting:
  const result = sim.attemptShift(gear, { autoClutch: true });
  if (result.grind) audio.grind();
  else if (result.accepted) audio.shiftClick();
  if (result.destroyed) {
    audio.explode();
    failure.triggerCatastrophe();
  }
}

function runScenario(id: string): void {
  audio.unlock();
  const applied = applyScenario(id);
  sim.applyExternalState({
    gear: applied.gear,
    speedKmh: applied.speedKmh,
    engineRpm: applied.engineRpm,
    clutchPedal: applied.clutchPedal,
    throttle: applied.throttle,
    feedback: applied.feedback,
    grind: applied.triggerGrind,
    smoke: applied.triggerSmoke,
    stall: applied.triggerStall,
    destroy: applied.triggerDestroy ? applied.feedback : undefined,
  });
  if (applied.triggerGrind) audio.grind(0.7);
  if (applied.triggerStall) audio.stall();
  if (applied.triggerSmoke) failure.triggerSmoke();
  if (applied.triggerDestroy) {
    audio.explode();
    failure.triggerCatastrophe();
  }
  if (id === "money-shift") {
    sim.attemptShift(1);
    if (sim.destroyed) {
      audio.explode();
      failure.triggerCatastrophe();
    }
  }
  if (id === "reverse-clash") {
    sim.attemptShift(-1);
    if (sim.destroyed) {
      audio.explode();
      failure.triggerCatastrophe();
    }
  }
}

async function startAr(): Promise<void> {
  audio.unlock();
  try {
    if (ar.active) {
      await ar.stop();
      return;
    }
    // 1. On iPhone / iPad (iOS Safari), launch native Apple AR Quick Look!
    if (isIosDevice()) {
      sim.feedback = "Launching native Apple AR Quick Look for iPhone/iPad...";
      await launchIosArQuickLook(world.model.root);
      sim.feedback = "Apple AR Quick Look active! Aim camera at table or floor.";
      return;
    }

    // 2. On Android / WebXR browsers, start live WebXR immersive-ar session!
    const supported = await ArSessionController.isSupported();
    if (supported) {
      await ar.start();
      return;
    }

    // 3. Otherwise (desktop or non-WebXR browser), open Mobile AR modal:
    ui.openQr();
    sim.feedback = "Scan QR with your phone camera for Floor & Table AR tracking";
  } catch (err) {
    const message = err instanceof Error ? err.message : "AR failed to start";
    sim.feedback = message;
    ui.openQr();
  }
}

let prevDestroyed = false;
let prevStalled = false;
let prevSmoke = false;

function frame(_time?: number, frameXr?: XRFrame): void {
  const dt = world.tick();
  ar.update(dt, frameXr ?? null);
  sim.update(dt);
  explode.update(dt);
  failure.update(dt);
  const snap = sim.snapshot();
  world.model.applyKinematics({
    engineRpm: snap.engineRpm,
    inputRpm: snap.inputRpm,
    outputRpm: snap.outputRpm,
    counterRpm: snap.counterRpm,
    gearSpin: snap.gearSpinRpm,
    gear: snap.gear,
    clutchPedal: snap.clutchPedal,
    dt,
    explodeAmount: explode.amount,
  });
  audio.updateEngine(snap.engineRpm, snap.engineRunning, snap.throttle);
  ui.render(snap);

  if (snap.destroyed && !prevDestroyed) {
    audio.explode();
    if (!failure.isDestroyed) failure.triggerCatastrophe();
  }
  if (snap.stalled && !prevStalled && !snap.destroyed) audio.stall();
  if (snap.smoking && !prevSmoke) failure.triggerSmoke();
  prevDestroyed = snap.destroyed;
  prevStalled = snap.stalled;
  prevSmoke = snap.smoking;

  world.renderFrame();
}

world.renderer.setAnimationLoop(frame);
