export const FINAL_DRIVE = 3.9;
export const TIRE_RADIUS = 0.31;
export const IDLE_RPM = 800;
export const REDLINE_RPM = 6800;
export const TACH_MAX_RPM = 8000;
export const STALL_RPM = 650;
export const STALL_SPEED_KMH = 5;
export const CLUTCH_LOCKED = 0.2;
export const CLUTCH_FREE = 0.8;
export const SHIFT_CLUTCH_MIN = 0.5;
export const MU_CLUTCH = 0.35;
export const F_SPRING = 4500;
export const R_EFF = 0.11;
export const VEHICLE_MASS = 1380;

export const GEAR_RATIOS: Record<1 | 2 | 3 | 4 | 5 | "R", number> = {
  1: 3.6,
  2: 2.1,
  3: 1.4,
  4: 1.0,
  5: 0.78,
  R: 3.4,
};

/** Educational tooth counts that realize the published ratios via the two-step path. */
export const TOOTH_COUNTS = {
  drivePinion: 18,
  counterDrive: 29,
  counter: { 1: 17, 2: 23, 3: 23, 5: 33, R: 18 },
  main: { 1: 38, 2: 30, 3: 20, 5: 16, R: 38 },
} as const;

export type GearId = 0 | 1 | 2 | 3 | 4 | 5 | -1;

export type CasingMode = "cutaway" | "solid" | "wireframe" | "hidden";

export function gearRatio(gear: GearId): number {
  if (gear === 0) return 0;
  if (gear === -1) return GEAR_RATIOS.R;
  return GEAR_RATIOS[gear];
}

export function gearLabel(gear: GearId): string {
  if (gear === 0) return "N";
  if (gear === -1) return "R";
  return String(gear);
}

export function roadSpeedKmh(outputRpm: number): number {
  return (outputRpm * 2 * Math.PI * TIRE_RADIUS * 60) / (1000 * FINAL_DRIVE);
}

export function roadSpeedMph(kmh: number): number {
  return kmh * 0.621371;
}

export function outputRpmFromSpeed(speedKmh: number): number {
  return (speedKmh * 1000 * FINAL_DRIVE) / (60 * 2 * Math.PI * TIRE_RADIUS);
}

export function forcedEngineRpm(speedKmh: number, gear: GearId): number {
  const i = gearRatio(gear);
  if (i === 0) return 0;
  return (speedKmh * 1000 * FINAL_DRIVE * i) / (60 * 2 * Math.PI * TIRE_RADIUS);
}

export function clutchEngageFactor(pedal: number): number {
  if (pedal > CLUTCH_FREE) return 0;
  if (pedal < CLUTCH_LOCKED) return 1;
  return (CLUTCH_FREE - pedal) / (CLUTCH_FREE - CLUTCH_LOCKED);
}

export function clutchTorqueCapacity(pedal: number): number {
  const k = clutchEngageFactor(pedal);
  return k * MU_CLUTCH * F_SPRING * R_EFF * 2;
}

export function countershaftRpm(inputRpm: number): number {
  return inputRpm * (TOOTH_COUNTS.drivePinion / TOOTH_COUNTS.counterDrive);
}

export function speedGearRpm(
  counterRpm: number,
  gear: 1 | 2 | 3 | 5 | "R",
): number {
  const nC = TOOTH_COUNTS.counter[gear];
  const nM = TOOTH_COUNTS.main[gear];
  return counterRpm * (nC / nM);
}

export function wouldGrindOnShift(clutchPedal: number): boolean {
  return clutchPedal < SHIFT_CLUTCH_MIN;
}

export function isMoneyShift(from: GearId, to: GearId, speedKmh: number): boolean {
  return from === 5 && to === 1 && speedKmh >= 100;
}

export function isReverseClash(to: GearId, speedKmh: number): boolean {
  return to === -1 && speedKmh >= 25;
}

export function isOverRevShift(to: GearId, speedKmh: number): boolean {
  if (to === 0) return false;
  return forcedEngineRpm(speedKmh, to) > 8200;
}

export interface ShiftResult {
  accepted: boolean;
  grind: boolean;
  destroyed: boolean;
  destroyReason: string;
  gear: GearId;
  feedback: string;
}

export interface SimulationSnapshot {
  gear: GearId;
  clutchPedal: number;
  throttle: number;
  brake: number;
  engineRpm: number;
  inputRpm: number;
  outputRpm: number;
  counterRpm: number;
  gearSpinRpm: Record<"1" | "2" | "3" | "5" | "R", number>;
  speedKmh: number;
  speedMph: number;
  stalled: boolean;
  engineRunning: boolean;
  destroyed: boolean;
  destroyReason: string;
  grindActive: boolean;
  clutchTemp: number;
  clutchGlazed: boolean;
  smoking: boolean;
  feedback: string;
  engageFactor: number;
  bitePoint: boolean;
  upshiftZone: boolean;
}

export class GearboxSimulation {
  clutchPedal = 1;
  throttle = 0;
  brake = 0;
  gear: GearId = 0;
  engineRpm = 0;
  inputRpm = 0;
  outputRpm = 0;
  counterRpm = 0;
  speedKmh = 0;
  stalled = false;
  engineRunning = false;
  destroyed = false;
  destroyReason = "";
  grindActive = false;
  grindTimer = 0;
  clutchTemp = 30;
  clutchGlazed = false;
  smoking = false;
  feedback = "Ignition off — tap Restart Engine";
  lastShiftRefused = false;

  private prevClutch = 1;
  private smokeTimer = 0;
  private stallArmTimer = 0;
  private restartGrace = 0;

  snapshot(): SimulationSnapshot {
    const gearSpinRpm = {
      "1": speedGearRpm(this.counterRpm, 1),
      "2": speedGearRpm(this.counterRpm, 2),
      "3": speedGearRpm(this.counterRpm, 3),
      "5": speedGearRpm(this.counterRpm, 5),
      R: speedGearRpm(this.counterRpm, "R"),
    };
    const engage = clutchEngageFactor(this.clutchPedal);
    return {
      gear: this.gear,
      clutchPedal: this.clutchPedal,
      throttle: this.throttle,
      brake: this.brake,
      engineRpm: this.engineRpm,
      inputRpm: this.inputRpm,
      outputRpm: this.outputRpm,
      counterRpm: this.counterRpm,
      gearSpinRpm,
      speedKmh: this.speedKmh,
      speedMph: roadSpeedMph(this.speedKmh),
      stalled: this.stalled,
      engineRunning: this.engineRunning,
      destroyed: this.destroyed,
      destroyReason: this.destroyReason,
      grindActive: this.grindActive,
      clutchTemp: this.clutchTemp,
      clutchGlazed: this.clutchGlazed,
      smoking: this.smoking,
      feedback: this.feedback,
      engageFactor: engage,
      bitePoint: this.clutchPedal >= 0.2 && this.clutchPedal <= 0.8 && this.gear !== 0,
      upshiftZone: this.engineRpm >= 2800 && this.engineRpm <= 3600 && this.gear >= 1 && this.gear <= 4,
    };
  }

  restartEngine(): void {
    if (this.destroyed) {
      this.feedback = "Transmission destroyed — repair before restarting";
      return;
    }

    const recovering = this.stalled;
    // Always clear stall/failure flags and restore idle so Restart is never a dead control.
    this.stalled = false;
    this.engineRunning = true;
    this.engineRpm = IDLE_RPM;
    this.inputRpm = 0;
    this.counterRpm = 0;
    this.throttle = 0;
    this.grindActive = false;
    this.grindTimer = 0;
    this.stallArmTimer = 0;
    // Grace only after a real stall recovery — not on cold start — so clutch-dump demos still work.
    this.restartGrace = recovering ? 1.25 : 0;
    if (this.gear !== 0) {
      this.gear = 0;
      this.clutchPedal = Math.max(this.clutchPedal, 1);
    }
    this.feedback = "Engine idle — hold clutch, select 1, feed a little gas";
  }

  stall(reason = "ENGINE STALLED"): void {
    if (this.restartGrace > 0) return;
    this.stalled = true;
    this.engineRunning = false;
    this.engineRpm = 0;
    this.throttle = 0;
    this.feedback = reason;
  }

  /** True when shafts are effectively stopped — grinding cannot occur. */
  shaftsStationary(): boolean {
    return (
      !this.engineRunning ||
      this.stalled ||
      (this.engineRpm < 80 && Math.abs(this.inputRpm) < 80 && Math.abs(this.speedKmh) < 1.5)
    );
  }

  destroy(reason: string): void {
    this.destroyed = true;
    this.destroyReason = reason;
    this.feedback = reason;
    this.engineRpm = 0;
    this.engineRunning = false;
    this.stalled = true;
    this.throttle = 0;
  }

  repair(): void {
    this.destroyed = false;
    this.destroyReason = "";
    this.clutchGlazed = false;
    this.smoking = false;
    this.clutchTemp = 30;
    this.smokeTimer = 0;
    this.grindActive = false;
    this.grindTimer = 0;
    this.stallArmTimer = 0;
    this.restartGrace = 1.25;
    this.gear = 0;
    this.speedKmh = 0;
    this.outputRpm = 0;
    this.inputRpm = 0;
    this.counterRpm = 0;
    this.clutchPedal = 1;
    this.throttle = 0;
    this.brake = 0;
    this.stalled = false;
    this.engineRunning = true;
    this.engineRpm = IDLE_RPM;
    this.feedback = "Transmission rebuilt — idle in Neutral";
  }

  attemptShift(next: GearId, options?: { autoClutch?: boolean }): ShiftResult {
    this.lastShiftRefused = false;
    if (this.destroyed) {
      this.lastShiftRefused = true;
      return {
        accepted: false,
        grind: false,
        destroyed: true,
        destroyReason: this.destroyReason,
        gear: this.gear,
        feedback: "Gearbox is destroyed — use Repair Transmission",
      };
    }

    // Auto-clutch mode for mobile/touch or educational quick-shifting:
    if (options?.autoClutch) {
      this.gear = next;
      this.grindActive = false;
      this.grindTimer = 0;
      this.stalled = false;
      this.engineRunning = true;
      this.clutchPedal = 0; // locked in drive

      if (next === 0) {
        this.engineRpm = IDLE_RPM;
        this.speedKmh = Math.max(0, this.speedKmh * 0.7);
        this.feedback = "Neutral — Output shaft decoupled; mainshaft freewheeling";
      } else if (next === 1) {
        this.speedKmh = 18;
        this.engineRpm = Math.max(IDLE_RPM, forcedEngineRpm(this.speedKmh, 1));
        this.feedback = "1st Gear Engaged (3.60:1) — High torque multiplication for launch";
      } else if (next === 2) {
        this.speedKmh = 34;
        this.engineRpm = Math.max(IDLE_RPM, forcedEngineRpm(this.speedKmh, 2));
        this.feedback = "2nd Gear Engaged (2.10:1) — Intermediate reduction for acceleration";
      } else if (next === 3) {
        this.speedKmh = 52;
        this.engineRpm = Math.max(IDLE_RPM, forcedEngineRpm(this.speedKmh, 3));
        this.feedback = "3rd Gear Engaged (1.40:1) — Mid-range ratio for city cruising";
      } else if (next === 4) {
        this.speedKmh = 75;
        this.engineRpm = Math.max(IDLE_RPM, forcedEngineRpm(this.speedKmh, 4));
        this.feedback = "4th Gear Direct Drive (1.00:1) — Input locks to output shaft; 100% efficient";
      } else if (next === 5) {
        this.speedKmh = 96;
        this.engineRpm = Math.max(IDLE_RPM, forcedEngineRpm(this.speedKmh, 5));
        this.feedback = "5th Gear Overdrive (0.78:1) — Output spins faster than engine for highway economy";
      } else if (next === -1) {
        this.speedKmh = -16;
        this.engineRpm = Math.max(IDLE_RPM, forcedEngineRpm(this.speedKmh, -1));
        this.feedback = "Reverse Gear Engaged (3.40:1) — Reverse idler gear inverts shaft rotation";
      }

      this.outputRpm = outputRpmFromSpeed(this.speedKmh);
      this.syncShafts();
      return {
        accepted: true,
        grind: false,
        destroyed: false,
        destroyReason: "",
        gear: this.gear,
        feedback: this.feedback,
      };
    }

    if (next === this.gear) {
      return {
        accepted: true,
        grind: false,
        destroyed: false,
        destroyReason: "",
        gear: this.gear,
        feedback: this.feedback,
      };
    }

    // Stationary shafts cannot grind — allow free selection while dead/stalled.
    if (this.shaftsStationary()) {
      this.gear = next;
      this.grindActive = false;
      this.grindTimer = 0;
      this.feedback =
        next === 0
          ? "Neutral selected — restart the engine when ready"
          : `Gear ${gearLabel(next)} selected — shafts stopped, no clash`;
      return {
        accepted: true,
        grind: false,
        destroyed: false,
        destroyReason: "",
        gear: this.gear,
        feedback: this.feedback,
      };
    }

    if (wouldGrindOnShift(this.clutchPedal) && next !== this.gear) {
      this.grindActive = true;
      this.grindTimer = 0.55;
      this.lastShiftRefused = true;

      if (isMoneyShift(this.gear, next, this.speedKmh) || isOverRevShift(next, this.speedKmh)) {
        const rpm = Math.round(forcedEngineRpm(this.speedKmh, next));
        this.destroy(`MONEY SHIFT — forced ${rpm.toLocaleString()} RPM, valves and 1st gear destroyed`);
        return {
          accepted: false,
          grind: true,
          destroyed: true,
          destroyReason: this.destroyReason,
          gear: this.gear,
          feedback: this.destroyReason,
        };
      }

      if (isReverseClash(next, this.speedKmh)) {
        this.destroy("REVERSE CLASH — idler and dog teeth sheared");
        return {
          accepted: false,
          grind: true,
          destroyed: true,
          destroyReason: this.destroyReason,
          gear: this.gear,
          feedback: this.destroyReason,
        };
      }

      if (this.speedKmh > 20 && next !== 0) {
        this.destroy("SYNCHRO DESTROYED — shift without clutch at speed");
        return {
          accepted: false,
          grind: true,
          destroyed: true,
          destroyReason: this.destroyReason,
          gear: this.gear,
          feedback: this.destroyReason,
        };
      }

      this.feedback = "GEAR GRINDING — clutch not depressed (P < 0.50)";
      return {
        accepted: false,
        grind: true,
        destroyed: false,
        destroyReason: "",
        gear: this.gear,
        feedback: this.feedback,
      };
    }

    if (isMoneyShift(this.gear, next, this.speedKmh) || (next === 1 && isOverRevShift(1, this.speedKmh))) {
      const rpm = Math.round(forcedEngineRpm(this.speedKmh, next));
      this.destroy(`MONEY SHIFT — forced ${rpm.toLocaleString()} RPM, valves and 1st gear destroyed`);
      return {
        accepted: false,
        grind: false,
        destroyed: true,
        destroyReason: this.destroyReason,
        gear: this.gear,
        feedback: this.destroyReason,
      };
    }

    if (isReverseClash(next, this.speedKmh)) {
      this.destroy("REVERSE CLASH — idler sheared against a forward-spinning main gear");
      return {
        accepted: false,
        grind: true,
        destroyed: true,
        destroyReason: this.destroyReason,
        gear: this.gear,
        feedback: this.destroyReason,
      };
    }

    this.gear = next;
    const label = gearLabel(next);
    if (next === 0) this.feedback = "Neutral — output decoupled, speed gears still spinning";
    else if (next === 4) this.feedback = "4th DIRECT DRIVE — countershaft unloaded, 1:1 lockup";
    else if (next === 5) this.feedback = "5th OVERDRIVE — output 28% faster than engine";
    else if (next === -1) this.feedback = "Reverse selected — idler inverts rotation";
    else this.feedback = `Gear ${label} engaged (${gearRatio(next).toFixed(2)}:1)`;

    return {
      accepted: true,
      grind: false,
      destroyed: false,
      destroyReason: "",
      gear: this.gear,
      feedback: this.feedback,
    };
  }

  applyExternalState(opts: {
    gear?: GearId;
    speedKmh?: number;
    engineRpm?: number;
    clutchPedal?: number;
    throttle?: number;
    stall?: boolean;
    destroy?: string;
    smoke?: boolean;
    grind?: boolean;
    feedback?: string;
  }): void {
    if (opts.gear !== undefined) this.gear = opts.gear;
    if (opts.speedKmh !== undefined) {
      this.speedKmh = opts.speedKmh;
      this.outputRpm = outputRpmFromSpeed(opts.speedKmh);
    }
    if (opts.engineRpm !== undefined) this.engineRpm = opts.engineRpm;
    if (opts.clutchPedal !== undefined) this.clutchPedal = opts.clutchPedal;
    if (opts.throttle !== undefined) this.throttle = opts.throttle;
    if (opts.feedback) this.feedback = opts.feedback;
    if (opts.grind) {
      this.grindActive = true;
      this.grindTimer = 1;
    }
    if (opts.smoke) {
      this.smoking = true;
      this.clutchGlazed = true;
      this.clutchTemp = 420;
    }
    if (opts.stall) this.stall(opts.feedback ?? "ENGINE STALLED");
    if (opts.destroy) this.destroy(opts.destroy);
    this.syncShafts();
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.05);
    if (this.restartGrace > 0) this.restartGrace = Math.max(0, this.restartGrace - step);
    if (this.grindTimer > 0) {
      this.grindTimer -= step;
      if (this.grindTimer <= 0) this.grindActive = false;
    }

    if (this.destroyed) {
      this.engineRpm = 0;
      this.throttle = 0;
      this.decayVehicle(step, 1.8);
      this.syncShafts();
      this.prevClutch = this.clutchPedal;
      return;
    }

    if (!this.engineRunning) {
      this.engineRpm = 0;
      this.decayVehicle(step, this.brake > 0.1 ? 1 + this.brake * 4 : 0.7);
      this.syncShafts();
      this.prevClutch = this.clutchPedal;
      return;
    }

    const dumped =
      this.restartGrace <= 0 &&
      this.gear !== 0 &&
      this.prevClutch > 0.55 &&
      this.clutchPedal < CLUTCH_LOCKED &&
      this.speedKmh < STALL_SPEED_KMH &&
      this.throttle < 0.12 &&
      this.engineRpm < 1400;

    if (dumped) {
      this.stall("ENGINE STALLED — clutch dumped at idle");
      this.prevClutch = this.clutchPedal;
      this.syncShafts();
      return;
    }

    const k = clutchEngageFactor(this.clutchPedal);
    const ratio = gearRatio(this.gear);
    const locked = k >= 1 && this.gear !== 0;
    const slipping = k > 0 && k < 1 && this.gear !== 0;

    const engineTorque = this.engineRunning
      ? this.throttle * 210 * this.torqueCurve(this.engineRpm) - 18 - this.engineRpm * 0.004
      : 0;

    if (locked) {
      const wheelForce = (engineTorque * ratio * FINAL_DRIVE) / TIRE_RADIUS;
      const accel = this.longitudinalAccel(wheelForce);
      this.speedKmh = Math.max(
        this.gear === -1 ? -180 : 0,
        Math.min(this.gear === -1 ? 0 : 220, this.speedKmh + accel * step * 3.6),
      );
      this.engineRpm = Math.max(0, forcedEngineRpm(this.speedKmh, this.gear));
      if (this.engineRpm < IDLE_RPM * 0.85 && this.throttle > 0.05) {
        this.engineRpm = Math.max(this.engineRpm, IDLE_RPM * 0.7);
      }

      // Stall only when truly stopped under load — never from a routine throttle lift at speed.
      const stallCandidate =
        this.restartGrace <= 0 &&
        Math.abs(this.speedKmh) < 2.5 &&
        this.engineRpm < STALL_RPM &&
        this.throttle < 0.08;
      if (stallCandidate) {
        this.stallArmTimer += step;
        if (this.stallArmTimer > 0.35) {
          this.stall("ENGINE STALLED");
          this.prevClutch = this.clutchPedal;
          this.syncShafts();
          return;
        }
      } else {
        this.stallArmTimer = 0;
      }

      this.engineRpm = Math.min(this.engineRpm, REDLINE_RPM);
      this.inputRpm = this.engineRpm;
    } else if (slipping) {
      this.stallArmTimer = 0;
      const tau = clutchTorqueCapacity(this.clutchPedal) * (this.clutchGlazed ? 0.35 : 1);
      const slip = (this.engineRpm - this.inputRpm) / 60;
      this.engineRpm += ((engineTorque - tau * Math.sign(slip || 1)) / 0.22) * step * 9.55;
      this.engineRpm = Math.min(REDLINE_RPM, Math.max(400, this.engineRpm));

      const driveTau = tau * Math.sign(this.engineRpm - this.inputRpm || 1);
      const wheelForce = (driveTau * ratio * FINAL_DRIVE) / TIRE_RADIUS;
      const accel = this.longitudinalAccel(wheelForce);
      const signed = this.gear === -1 ? -1 : 1;
      this.speedKmh += signed * Math.abs(accel) * step * 3.6 * Math.sign(driveTau || signed);
      if (this.gear !== -1) this.speedKmh = Math.max(0, this.speedKmh);
      else this.speedKmh = Math.min(0, this.speedKmh);

      this.inputRpm += ((this.engineRpm - this.inputRpm) * k + (forcedEngineRpm(this.speedKmh, this.gear) - this.inputRpm) * 0.35) * step * 4;
      this.clutchTemp += Math.abs(slip) * tau * 0.00008 * step * 60;
      if (this.clutchPedal >= 0.2 && this.clutchPedal <= 0.8 && this.throttle > 0.7) {
        this.clutchTemp += 80 * step;
      }
    } else {
      this.stallArmTimer = 0;
      if (this.engineRpm < IDLE_RPM) {
        this.engineRpm += (IDLE_RPM - this.engineRpm) * Math.min(1, step * 8);
      }
      this.engineRpm += this.throttle * 5200 * step;
      this.engineRpm -= (1 - this.throttle) * 1400 * step;
      this.engineRpm = Math.min(REDLINE_RPM, Math.max(IDLE_RPM * 0.9, this.engineRpm));
      this.inputRpm += (0 - this.inputRpm) * Math.min(1, step * 1.2);
      this.decayVehicle(step, this.brake > 0.05 ? 1 + this.brake * 5 : 0.35);
      this.clutchTemp += (30 - this.clutchTemp) * step * 0.15;
    }

    if (this.engineRpm > REDLINE_RPM - 50 && this.throttle > 0.9) {
      this.feedback = "Redline — lift or upshift";
    } else if (slipping && this.gear !== 0) {
      this.feedback = "Bite point reached — friction is transferring torque";
    } else if (this.engineRpm >= 2800 && this.engineRpm <= 3600 && this.gear >= 1 && this.gear <= 4 && locked) {
      this.feedback = "Optimal upshift zone";
    }

    if (this.clutchTemp > 280) {
      this.smoking = true;
      this.smokeTimer = 4;
      this.clutchGlazed = true;
      this.feedback = "CLUTCH OVERHEAT — facings glazing, smoke from bellhousing";
    }
    if (this.smokeTimer > 0) this.smokeTimer -= step;
    else if (!this.clutchGlazed) this.smoking = false;
    this.clutchTemp = Math.max(30, this.clutchTemp - step * 12);

    this.engineRpm = Math.max(0, Math.min(TACH_MAX_RPM, this.engineRpm));
    this.syncShafts();
    this.prevClutch = this.clutchPedal;
  }

  private torqueCurve(rpm: number): number {
    const n = rpm / REDLINE_RPM;
    return Math.max(0.25, Math.sin(Math.min(1, n) * Math.PI) * 0.85 + 0.35);
  }

  private longitudinalAccel(wheelForce: number): number {
    const v = (this.speedKmh / 3.6) * (this.speedKmh < 0 ? -1 : 1);
    const speed = Math.abs(v);
    const drag = 0.32 * 1.225 * 2.15 * 0.5 * speed * speed;
    const roll = VEHICLE_MASS * 9.81 * 0.013;
    const brakeForce = this.brake * 9000;
    const net = wheelForce - drag - roll - brakeForce * Math.sign(speed || 1);
    return net / VEHICLE_MASS;
  }

  private decayVehicle(dt: number, extra: number): void {
    const v = this.speedKmh / 3.6;
    const drag = 0.32 * 1.225 * 2.15 * 0.5 * v * v * Math.sign(v);
    const roll = VEHICLE_MASS * 9.81 * 0.013 * Math.sign(v || 0);
    const brakeForce = this.brake * 9000 * Math.sign(v || 0);
    const a = -(drag + roll + brakeForce * extra) / VEHICLE_MASS;
    this.speedKmh += a * dt * 3.6;
    if (Math.abs(this.speedKmh) < 0.15) this.speedKmh = 0;
  }

  private syncShafts(): void {
    this.outputRpm = outputRpmFromSpeed(this.speedKmh);
    const k = clutchEngageFactor(this.clutchPedal);
    if (this.gear !== 0 && k >= 1 && this.engineRunning && !this.stalled) {
      this.inputRpm = this.engineRpm;
    } else if (this.gear !== 0 && k > 0) {
      const lockedInput = forcedEngineRpm(this.speedKmh, this.gear);
      this.inputRpm = this.inputRpm * (1 - k * 0.15) + (k * 0.5 * this.engineRpm + (1 - k * 0.5) * lockedInput) * (k * 0.15 + 0.02);
    }
    if (!this.engineRunning && k < 0.2 && this.gear !== 0) {
      this.inputRpm = this.outputRpm * gearRatio(this.gear);
    }
    this.counterRpm = countershaftRpm(this.inputRpm);
  }
}
