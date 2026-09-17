import * as THREE from "three";
import type { GearboxModel } from "./GearboxModel";

interface Shard {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
}

interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

interface Smoke {
  mesh: THREE.Mesh;
  life: number;
  drift: THREE.Vector3;
}

export const SHARD_COUNT = 42;
export const SPARK_COUNT = 180;

function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(mat)) {
    for (const m of mat) m.dispose();
  } else {
    mat.dispose();
  }
}

export class GearFailureAnimation {
  shards: Shard[] = [];
  sparks: Spark[] = [];
  smoke: Smoke[] = [];
  active = false;
  smokingOnly = false;
  private shudderTime = 0;
  private readonly scene: THREE.Scene;
  private readonly model: GearboxModel;
  private readonly shardMat: THREE.MeshStandardMaterial;
  private readonly sparkMat: THREE.MeshBasicMaterial;
  private readonly smokeMat: THREE.MeshStandardMaterial;
  private readonly gravity = new THREE.Vector3(0, -9.8, 0);
  private readonly origin = new THREE.Vector3(0, 0.05, 0.42);
  /** Shared spark/smoke geometries — one instance, never cloned per particle. */
  private readonly sparkGeo = new THREE.SphereGeometry(0.006, 6, 6);
  private readonly smokeGeo = new THREE.SphereGeometry(0.08, 8, 8);
  private readonly shardGeoPool: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene, model: GearboxModel) {
    this.scene = scene;
    this.model = model;
    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0x8a9098,
      metalness: 0.85,
      roughness: 0.35,
    });
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 1,
    });
    this.smokeMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    for (let i = 0; i < 8; i++) {
      this.shardGeoPool.push(
        new THREE.BoxGeometry(0.02 + (i % 3) * 0.008, 0.012 + (i % 2) * 0.006, 0.032 + (i % 4) * 0.006),
      );
    }
  }

  get shardCount(): number {
    return this.shards.length;
  }

  get sparkCount(): number {
    return this.sparks.length;
  }

  get isDestroyed(): boolean {
    return this.active;
  }

  triggerCatastrophe(origin?: THREE.Vector3): void {
    this.clearDebris();
    if (origin) this.origin.copy(origin);
    this.active = true;
    this.smokingOnly = false;
    this.shudderTime = 1.8;
    this.model.setScorched(true);
    this.spawnShards();
    this.spawnSparks();
    this.spawnSmoke(18);
  }

  triggerSmoke(): void {
    this.smokingOnly = true;
    // Cap concurrent smoke so repeated slip scenarios cannot heap-leak puffs.
    if (this.smoke.length > 24) {
      const overflow = this.smoke.splice(0, this.smoke.length - 12);
      for (const puff of overflow) {
        this.scene.remove(puff.mesh);
        // geometry is shared — only dispose cloned materials
        disposeMaterial(puff.mesh.material);
      }
    }
    this.spawnSmoke(10);
  }

  repair(): void {
    this.clearDebris();
    this.active = false;
    this.smokingOnly = false;
    this.shudderTime = 0;
    this.model.setScorched(false);
    this.model.casing.position.set(0, 0, 0);
    this.model.casing.rotation.set(0, 0, 0);
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.05);
    if (this.shudderTime > 0) {
      this.shudderTime = Math.max(0, this.shudderTime - step);
      const damp = this.shudderTime / 1.8;
      const shake = Math.sin(this.shudderTime * Math.PI * 2 * 45) * 0.012 * damp;
      this.model.casing.position.x = shake;
      this.model.casing.position.y = -shake * 0.6;
    }

    for (const shard of this.shards) {
      shard.velocity.addScaledVector(this.gravity, step);
      shard.mesh.position.addScaledVector(shard.velocity, step);
      shard.mesh.rotation.x += shard.spin.x * step;
      shard.mesh.rotation.y += shard.spin.y * step;
      shard.mesh.rotation.z += shard.spin.z * step;
      if (shard.mesh.position.y < -0.72) {
        shard.mesh.position.y = -0.72;
        shard.velocity.y *= -0.35;
        shard.velocity.x *= 0.7;
        shard.velocity.z *= 0.7;
        if (Math.abs(shard.velocity.y) < 0.4) shard.velocity.y = 0;
      }
    }

    for (const spark of this.sparks) {
      spark.life -= step;
      spark.velocity.y -= 4 * step;
      spark.mesh.position.addScaledVector(spark.velocity, step);
      const mat = spark.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, spark.life);
      const heat = Math.max(0, spark.life);
      mat.color.setRGB(1, 0.45 + 0.4 * heat, 0.08 * heat);
    }

    for (const puff of this.smoke) {
      puff.life -= step * 0.25;
      puff.mesh.position.addScaledVector(puff.drift, step);
      puff.mesh.position.y += step * 0.22;
      puff.mesh.scale.addScalar(step * 0.35);
      const mat = puff.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, puff.life * 0.28);
    }

    this.sparks = this.sparks.filter((s) => {
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        disposeMaterial(s.mesh.material);
        return false;
      }
      return true;
    });
    this.smoke = this.smoke.filter((s) => {
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        disposeMaterial(s.mesh.material);
        return false;
      }
      return true;
    });
  }

  private spawnShards(): void {
    for (let i = 0; i < SHARD_COUNT; i++) {
      const geo = this.shardGeoPool[i % this.shardGeoPool.length];
      const mesh = new THREE.Mesh(geo, this.shardMat.clone());
      mesh.position.copy(this.origin);
      mesh.position.x += (Math.random() - 0.5) * 0.08;
      mesh.position.y += Math.random() * 0.06;
      mesh.position.z += (Math.random() - 0.5) * 0.08;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4.5,
        1.5 + Math.random() * 3.8,
        (Math.random() - 0.5) * 4.5,
      );
      const spin = new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
      );
      this.scene.add(mesh);
      this.shards.push({ mesh, velocity, spin });
    }
  }

  private spawnSparks(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat.clone());
      mesh.position.copy(this.origin);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5,
        (Math.random() - 0.5) * 6,
      );
      this.scene.add(mesh);
      this.sparks.push({ mesh, velocity, life: 0.4 + Math.random() * 0.7 });
    }
  }

  private spawnSmoke(count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
      mesh.position.set(-0.02 + Math.random() * 0.04, 0.05, -1.35 + Math.random() * 0.1);
      mesh.scale.setScalar(1);
      const drift = new THREE.Vector3(
        (Math.random() - 0.5) * 0.12,
        0.15 + Math.random() * 0.1,
        (Math.random() - 0.5) * 0.08,
      );
      this.scene.add(mesh);
      this.smoke.push({ mesh, life: 1, drift });
    }
  }

  private clearDebris(): void {
    for (const shard of this.shards) {
      this.scene.remove(shard.mesh);
      // Shared pool geometries — dispose only cloned materials.
      disposeMaterial(shard.mesh.material);
    }
    for (const spark of this.sparks) {
      this.scene.remove(spark.mesh);
      disposeMaterial(spark.mesh.material);
    }
    for (const puff of this.smoke) {
      this.scene.remove(puff.mesh);
      disposeMaterial(puff.mesh.material);
    }
    this.shards = [];
    this.sparks = [];
    this.smoke = [];
  }

  dispose(): void {
    this.clearDebris();
    this.shardMat.dispose();
    this.sparkMat.dispose();
    this.smokeMat.dispose();
    this.sparkGeo.dispose();
    this.smokeGeo.dispose();
    for (const geo of this.shardGeoPool) geo.dispose();
    this.shardGeoPool.length = 0;
  }
}
