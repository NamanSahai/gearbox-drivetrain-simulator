import * as THREE from "three";
import type { GearboxModel } from "./GearboxModel";

export class ExplodedView {
  amount = 0;
  private target = 0;
  private readonly model: GearboxModel;

  constructor(model: GearboxModel) {
    this.model = model;
  }

  setTarget(value: number): void {
    this.target = THREE.MathUtils.clamp(value, 0, 1);
  }

  toggle(): boolean {
    this.target = this.target > 0.5 ? 0 : 1;
    return this.target > 0.5;
  }

  isExploded(): boolean {
    return this.target > 0.5;
  }

  update(dt: number): void {
    this.amount = THREE.MathUtils.damp(this.amount, this.target, 6, dt);
    for (const target of this.model.explodeTargets) {
      target.object.position.lerpVectors(target.rest, target.exploded, this.amount);
    }
  }
}
