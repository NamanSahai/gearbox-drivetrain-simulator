import * as THREE from "three";
import { COMPONENTS, requireAllComponents } from "../src/education/ComponentData";
import { GearFailureAnimation, SHARD_COUNT, SPARK_COUNT } from "../src/gearbox/GearFailureAnimation";
import { GearboxModel } from "../src/gearbox/GearboxModel";
import {
  GEAR_RATIOS,
  GearboxSimulation,
  clutchEngageFactor,
  forcedEngineRpm,
  gearRatio,
  outputRpmFromSpeed,
  roadSpeedKmh,
  roadSpeedMph,
  wouldGrindOnShift,
  type GearId,
} from "../src/simulation/GearboxSimulation";
import {
  MONEY_SHIFT_TARGET_RPM,
  applyScenario,
  moneyShiftForcedRpm,
} from "../src/simulation/HypotheticalScenarios";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${message}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${message}`);
  }
}

function approx(actual: number, expected: number, tol: number, message: string): void {
  assert(Math.abs(actual - expected) <= tol, `${message} (got ${actual.toFixed(2)}, expected ${expected} ± ${tol})`);
}

console.log("1) Educational components");
const components = requireAllComponents();
assert(components.length === 18, "exactly 18 inspectable components");
for (const item of COMPONENTS) {
  assert(item.name.trim().length > 0, `${item.id} has a name`);
  assert(item.category.trim().length > 0, `${item.id} has a category`);
  assert(item.primaryFunction.trim().length > 8, `${item.id} has a primary function`);
  assert(item.powerFlowRole.trim().length > 8, `${item.id} has a power-flow role`);
  assert(item.engineeringNote.trim().length > 16, `${item.id} has an engineering note`);
}

console.log("2) Kinematic formulas for all gears");
const testRpm = 3000;
const gears: Array<[GearId, number]> = [
  [1, GEAR_RATIOS[1]],
  [2, GEAR_RATIOS[2]],
  [3, GEAR_RATIOS[3]],
  [4, GEAR_RATIOS[4]],
  [5, GEAR_RATIOS[5]],
  [-1, GEAR_RATIOS.R],
];
for (const [gear, ratio] of gears) {
  const output = testRpm / ratio;
  const kmh = roadSpeedKmh(output);
  const mph = roadSpeedMph(kmh);
  const back = forcedEngineRpm(kmh, gear);
  approx(gearRatio(gear), ratio, 1e-9, `gear ${gear} ratio`);
  approx(back, testRpm, 0.05, `gear ${gear} inverse RPM match`);
  assert(kmh > 0, `gear ${gear} produces positive road speed (${kmh.toFixed(2)} km/h)`);
  assert(mph === kmh * 0.621371, `gear ${gear} mph conversion`);
  const sim = new GearboxSimulation();
  sim.applyExternalState({
    gear,
    speedKmh: kmh,
    engineRpm: testRpm,
    clutchPedal: 0,
    throttle: 0.3,
  });
  const snap = sim.snapshot();
  approx(snap.outputRpm, outputRpmFromSpeed(kmh), 0.05, `gear ${gear} output RPM from speed`);
  approx(snap.speedMph, mph, 0.05, `gear ${gear} snapshot mph`);
}

console.log("3) Money-shift forced RPM");
const money = moneyShiftForcedRpm(110);
approx(money, MONEY_SHIFT_TARGET_RPM, 350, "5th→1st at 110 km/h ≈ 13,005 RPM");
assert(money > 12000, "money shift is deep into valve-float territory");
const moneyScene = applyScenario("money-shift");
assert(moneyScene.triggerDestroy, "money-shift scenario is catastrophic");
approx(moneyScene.speedKmh, 110, 0.01, "money-shift sets 110 km/h");

// Auto-clutch downshift breaking validation:
const autoSim = new GearboxSimulation();
autoSim.restartEngine();
autoSim.attemptShift(5, { autoClutch: true });
assert(autoSim.gear === 5, "auto-clutch shifts cleanly into 5th");
assert(!autoSim.destroyed, "5th gear is safe");

const safeDown = autoSim.attemptShift(4, { autoClutch: true });
assert(safeDown.accepted && !safeDown.destroyed && autoSim.gear === 4, "safe downshift 5th→4th accepted without destruction");

const moneyShiftResult = autoSim.attemptShift(1, { autoClutch: true });
assert(moneyShiftResult.destroyed, "downshifting 4th→1st at speed triggers catastrophic Money Shift");
assert(autoSim.destroyed, "gearbox is destroyed after money shift");
assert(autoSim.destroyReason.includes("MONEY SHIFT"), "destroyReason identifies MONEY SHIFT");

const revSim = new GearboxSimulation();
revSim.restartEngine();
revSim.attemptShift(3, { autoClutch: true });
const revClash = revSim.attemptShift(-1, { autoClutch: true });
assert(revClash.destroyed, "shifting into Reverse while moving forward triggers Reverse Clash");
assert(revSim.destroyed, "gearbox is destroyed after reverse clash");

console.log("4) Clutch dump stall");
const dump = new GearboxSimulation();
dump.restartEngine();
dump.gear = 1;
dump.clutchPedal = 0.9;
dump.throttle = 0;
dump.speedKmh = 0;
dump.engineRpm = 800;
dump.update(0.016);
dump.clutchPedal = 0.05;
dump.update(0.016);
assert(dump.stalled, "clutch dump marks the engine stalled");
assert(dump.engineRpm === 0, "stalled engine RPM is 0");
assert(dump.feedback.toUpperCase().includes("STALL"), "stall status text is set");

const dumpScene = applyScenario("clutch-dump");
const dumpApplied = new GearboxSimulation();
dumpApplied.applyExternalState({
  gear: dumpScene.gear,
  speedKmh: dumpScene.speedKmh,
  engineRpm: dumpScene.engineRpm,
  clutchPedal: dumpScene.clutchPedal,
  throttle: dumpScene.throttle,
  stall: dumpScene.triggerStall,
  feedback: dumpScene.feedback,
});
assert(dumpApplied.engineRpm === 0, "clutch-dump scenario drops RPM to 0");
assert(dumpApplied.stalled, "clutch-dump scenario sets stalled flag");

const restart = new GearboxSimulation();
restart.stall("ENGINE STALLED");
restart.gear = 1;
restart.clutchPedal = 0;
restart.restartEngine();
assert(restart.engineRunning, "restart after stall clears engineRunning=false");
assert(!restart.stalled, "restart after stall clears stalled flag");
approx(restart.engineRpm, 800, 0.01, "restart restores idle RPM");
assert(Number(restart.gear) === 0, "restart parks in Neutral so it cannot instantly re-stall");

console.log("5) Gear grinding without clutch");
assert(wouldGrindOnShift(0.2), "P_clutch 0.20 is below the 0.50 shift threshold");
assert(!wouldGrindOnShift(0.6), "P_clutch 0.60 allows a clean shift");
assert(clutchEngageFactor(0.9) === 0, "pedal > 0.80 is fully disengaged");
assert(clutchEngageFactor(0.1) === 1, "pedal < 0.20 is locked");
approx(clutchEngageFactor(0.5), (0.8 - 0.5) / 0.6, 1e-9, "bite-point engage factor");

const grind = new GearboxSimulation();
grind.restartEngine();
grind.clutchPedal = 0.15;
grind.gear = 1;
grind.speedKmh = 8;
const refused = grind.attemptShift(2);
assert(refused.grind, "shift without clutch grinds");
assert(!refused.accepted, "grinding shift is refused");
assert(grind.grindActive, "simulation exposes grindActive");
assert(grind.feedback.toUpperCase().includes("GRIND"), "HUD grind warning is raised");

const clean = new GearboxSimulation();
clean.restartEngine();
clean.clutchPedal = 0.85;
const ok = clean.attemptShift(1);
assert(ok.accepted && ok.gear === 1, "shift with clutch depressed is accepted");

const dead = new GearboxSimulation();
dead.stall("ENGINE STALLED");
dead.clutchPedal = 0;
const deadShift = dead.attemptShift(2);
assert(!deadShift.grind, "stationary shafts do not grind");
assert(deadShift.accepted, "dead engine still allows gear selection");
assert(!dead.feedback.toUpperCase().includes("GEAR GRINDING"), "UI does not show grinding when engine is dead");

console.log("5b) Lesson-style throttle lift must not false-stall");
const lesson = new GearboxSimulation();
lesson.restartEngine();
lesson.gear = 1;
lesson.clutchPedal = 0;
lesson.throttle = 0.8;
lesson.speedKmh = 28;
lesson.engineRpm = 3000;
lesson.engineRunning = true;
lesson.stalled = false;
for (let i = 0; i < 45; i++) {
  lesson.throttle = 0;
  lesson.update(1 / 60);
}
assert(!lesson.stalled, "lifting throttle at speed in Lesson 2 does not stall the engine");
assert(lesson.engineRunning, "engine stays running after throttle lift at speed");

console.log("6) Catastrophic shards, sparks, and repair");
const scene = new THREE.Scene();
const model = new GearboxModel();
const fx = new GearFailureAnimation(scene, model);
fx.triggerCatastrophe();
assert(fx.shardCount >= 38, `spawns at least 38 shards (got ${fx.shardCount}, want ${SHARD_COUNT})`);
assert(fx.sparkCount >= 160, `spawns at least 160 sparks (got ${fx.sparkCount}, want ${SPARK_COUNT})`);
assert(fx.isDestroyed, "failure animation is active");
fx.repair();
assert(fx.shardCount === 0, "repair dissolves shards");
assert(fx.sparkCount === 0, "repair clears sparks");
assert(!fx.isDestroyed, "repair restores a non-destroyed state");

// Repeat destroy/repair cycles — heap should not retain debris meshes.
for (let i = 0; i < 8; i++) {
  fx.triggerCatastrophe();
  fx.repair();
}
assert(fx.shardCount === 0 && fx.sparkCount === 0, "repeated repair leaves zero debris objects");

const rebuilt = new GearboxSimulation();
rebuilt.destroy("test");
rebuilt.repair();
assert(!rebuilt.destroyed && rebuilt.gear === 0 && rebuilt.engineRpm === 800, "repair idles in Neutral");

console.log("7) AR Component Inspector & markup validation");
import fs from "fs";
import path from "path";
import { ArSessionController } from "../src/gearbox/ArSessionController";

const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
assert(html.includes('id="ar-camera-feed"'), "HTML contains ar-camera-feed video element");
assert(html.includes('id="ar-inspect-sheet"'), "HTML contains ar-inspect-sheet element");
assert(html.includes('id="ar-comp-index-badge"'), "HTML contains ar-comp-index-badge");
assert(html.includes('id="ar-component-select"'), "HTML contains ar-component-select");
assert(html.includes('id="btn-ar-prev-comp"'), "HTML contains btn-ar-prev-comp");
assert(html.includes('id="btn-ar-next-comp"'), "HTML contains btn-ar-next-comp");
assert(html.includes('id="btn-ar-minimize-inspect"'), "HTML contains btn-ar-minimize-inspect");
assert(html.includes('id="ar-card-function"'), "HTML contains ar-card-function");
assert(html.includes('id="ar-card-flow"'), "HTML contains ar-card-flow");
assert(html.includes('id="ar-card-note"'), "HTML contains ar-card-note");
assert(typeof ArSessionController.hasCameraSupport === "function", "ArSessionController exposes hasCameraSupport method");

if (failed > 0) {
  throw new Error(`${failed} failed, ${passed} passed`);
}
console.log(`\nAll ${passed} assertions passed.`);
