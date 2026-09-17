import {
  FINAL_DRIVE,
  TIRE_RADIUS,
  forcedEngineRpm,
  type GearId,
} from "./GearboxSimulation";

export interface ScenarioDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  consequence: string;
  formula: string;
  destructive: boolean;
}

export const MONEY_SHIFT_SPEED_KMH = 110;
export const MONEY_SHIFT_TARGET_RPM = 13005;

export function moneyShiftForcedRpm(speedKmh = MONEY_SHIFT_SPEED_KMH): number {
  return forcedEngineRpm(speedKmh, 1);
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "money-shift",
    title: "The Money Shift",
    subtitle: "5th → 1st at 110 km/h",
    description:
      "Cruising in 5th at 110 km/h and grabbing 1st (3.60:1) forces the engine to match a huge reduction instantly.",
    consequence:
      "Forced RPM exceeds valve-spring return speed (valve float). Pistons smash open valves, the clutch disc bursts from centrifugal force, and 1st-gear teeth fracture.",
    formula:
      "RPM = (v × 1000 × i_final × i_1) / (60 × 2π × r_tire) ≈ 13,005 RPM at 110 km/h",
    destructive: true,
  },
  {
    id: "reverse-clash",
    title: "Highway Reverse Clash",
    subtitle: "R selected while rolling forward",
    description:
      "The reverse idler is dropped between a countershaft gear and a mainshaft gear that are already spinning the opposite way.",
    consequence:
      "Dog teeth and idler teeth shear on first contact. Shards are thrown through the case window and the reverse train is destroyed.",
    formula: "ω_out must change sign while |v| is large — relative tooth speed ≈ 2 · ω_mesh",
    destructive: true,
  },
  {
    id: "clutch-dump",
    title: "Clutch Dump at Idle",
    subtitle: "Side-step the pedal from standstill",
    description:
      "In 1st gear at idle, the clutch pedal is released in a few milliseconds with no throttle.",
    consequence:
      "Static inertia of the car is reflected through 3.60 × 3.90 to the crank. Engine RPM is pulled through idle and the engine stalls.",
    formula: "P_clutch < 0.20, v < 5 km/h, RPM < 650, k ≠ N → RPM = 0 (ENGINE STALLED)",
    destructive: false,
  },
  {
    id: "no-clutch-shift",
    title: "Shift Without Clutch",
    subtitle: "Dogs vs unmatched shaft speeds",
    description:
      "Selecting another gear while P_clutch < 0.50 keeps the engine tied to the input shaft. The synchro cone cannot absorb the RPM delta.",
    consequence:
      "Gear grinding, red HUD warning, shift refusal. Held long enough, brass baulk rings glaze and dog teeth mushroom.",
    formula: "Shift allowed only if P_clutch ≥ 0.50; otherwise grind + refuse",
    destructive: true,
  },
  {
    id: "clutch-slip",
    title: "Clutch Slip Overheating",
    subtitle: "50% slip + high throttle",
    description:
      "Holding the pedal in the bite window (P ≈ 0.50) while the throttle is pinned dumps slip power into the facings as heat.",
    consequence:
      "Friction disc cooks, glazes, and smokes. μ collapses and the clutch will no longer lock cleanly until rebuilt.",
    formula: "P_slip = τ_clutch · |ω_engine − ω_input|  →  temperature rise in the facings",
    destructive: false,
  },
];

export function getScenario(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export interface ScenarioApplyResult {
  gear: GearId;
  speedKmh: number;
  engineRpm: number;
  clutchPedal: number;
  throttle: number;
  triggerDestroy: boolean;
  triggerStall: boolean;
  triggerGrind: boolean;
  triggerSmoke: boolean;
  feedback: string;
}

export function applyScenario(id: string): ScenarioApplyResult {
  switch (id) {
    case "money-shift":
      return {
        gear: 5,
        speedKmh: MONEY_SHIFT_SPEED_KMH,
        engineRpm: forcedEngineRpm(MONEY_SHIFT_SPEED_KMH, 5),
        clutchPedal: 0.0,
        throttle: 0.35,
        triggerDestroy: true,
        triggerStall: false,
        triggerGrind: false,
        triggerSmoke: false,
        feedback: "MONEY SHIFT — valve float, clutch burst, 1st gear shattered",
      };
    case "reverse-clash":
      return {
        gear: 5,
        speedKmh: 90,
        engineRpm: forcedEngineRpm(90, 5),
        clutchPedal: 0.15,
        throttle: 0.2,
        triggerDestroy: true,
        triggerStall: false,
        triggerGrind: true,
        triggerSmoke: false,
        feedback: "REVERSE CLASH — idler sheared against a forward-spinning main gear",
      };
    case "clutch-dump":
      return {
        gear: 1,
        speedKmh: 0,
        engineRpm: 800,
        clutchPedal: 0.05,
        throttle: 0,
        triggerDestroy: false,
        triggerStall: true,
        triggerGrind: false,
        triggerSmoke: false,
        feedback: "ENGINE STALLED — clutch dumped at idle with no throttle",
      };
    case "no-clutch-shift":
      return {
        gear: 3,
        speedKmh: 55,
        engineRpm: forcedEngineRpm(55, 3),
        clutchPedal: 0.1,
        throttle: 0.4,
        triggerDestroy: true,
        triggerStall: false,
        triggerGrind: true,
        triggerSmoke: false,
        feedback: "SYNCHRO DESTROYED — shift without clutch at unmatched shaft speeds",
      };
    case "clutch-slip":
      return {
        gear: 1,
        speedKmh: 12,
        engineRpm: 4200,
        clutchPedal: 0.5,
        throttle: 0.95,
        triggerDestroy: false,
        triggerStall: false,
        triggerGrind: false,
        triggerSmoke: true,
        feedback: "CLUTCH GLAZED — slip power cooked the friction facings",
      };
    default:
      throw new Error(`Unknown scenario: ${id}`);
  }
}

export function moneyShiftFormulaParts(speedKmh = MONEY_SHIFT_SPEED_KMH) {
  const numerator = speedKmh * 1000 * FINAL_DRIVE * 3.6;
  const denominator = 60 * 2 * Math.PI * TIRE_RADIUS;
  return { numerator, denominator, rpm: numerator / denominator };
}
