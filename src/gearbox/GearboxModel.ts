import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CasingMode, GearId } from "../simulation/GearboxSimulation";

export interface ExplodeTarget {
  object: THREE.Object3D;
  rest: THREE.Vector3;
  exploded: THREE.Vector3;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

function tag(obj: THREE.Object3D, id: string, name: string): void {
  obj.name = name;
  obj.userData.componentId = id;
  obj.traverse((child) => {
    child.userData.componentId = child.userData.componentId ?? id;
  });
}

function metal(color: number, extras: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.82,
    roughness: 0.32,
    ...extras,
  });
}

function gearGeometry(teeth: number, outerR: number, width: number, bore = 0.03): THREE.BufferGeometry {
  const root = outerR * 0.8;
  const pieces: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(root, root, width, Math.max(20, teeth));
  pieces.push(body);
  const toothW = ((2 * Math.PI * outerR) / teeth) * 0.42;
  const toothD = outerR - root;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(toothW, width * 0.95, toothD);
    tooth.translate(0, 0, root + toothD / 2);
    tooth.rotateY(a);
    pieces.push(tooth);
  }
  const rim = new THREE.TorusGeometry(root * 0.62, 0.008, 6, 20);
  rim.rotateX(Math.PI / 2);
  pieces.push(rim);
  const merged = mergeGeometries(pieces);
  if (!merged) throw new Error("Failed to merge gear geometry");
  merged.rotateX(Math.PI / 2);
  merged.computeVertexNormals();
  void bore;
  return merged;
}

function shaftGeometry(length: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 20);
  g.rotateX(Math.PI / 2);
  return g;
}

function makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class GearboxModel {
  readonly root = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly explodeTargets: ExplodeTarget[] = [];

  readonly inputShaft: THREE.Group;
  readonly countershaft: THREE.Group;
  readonly outputShaft: THREE.Group;
  readonly reverseIdler: THREE.Group;
  readonly flywheel: THREE.Group;
  readonly clutchDisc: THREE.Group;
  readonly pressurePlate: THREE.Group;
  readonly diaphragm: THREE.Group;
  readonly releaseBearing: THREE.Group;
  readonly clutchFork: THREE.Group;
  readonly synchro12: THREE.Group;
  readonly synchro34: THREE.Group;
  readonly synchro5r: THREE.Group;
  readonly fork12: THREE.Mesh;
  readonly fork34: THREE.Mesh;
  readonly fork5r: THREE.Mesh;
  readonly casing: THREE.Group;
  readonly differential: THREE.Group;
  readonly ringGear: THREE.Mesh;
  readonly spiders: THREE.Group;
  readonly halfShaftL: THREE.Mesh;
  readonly halfShaftR: THREE.Mesh;

  private readonly freeGears = new Map<string, THREE.Object3D>();
  private readonly casingMeshes: THREE.Mesh[] = [];
  private readonly casingMaterials = new Map<THREE.Mesh, THREE.Material>();
  private readonly originalColors = new Map<THREE.Mesh, number>();
  private readonly wireMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });
  private readonly cutawayMat = new THREE.MeshPhysicalMaterial({
    color: 0xb7c4ce,
    metalness: 0.55,
    roughness: 0.28,
    transparent: true,
    opacity: 0.16,
    transmission: 0.45,
    thickness: 0.3,
    side: THREE.DoubleSide,
  });
  private casingMode: CasingMode = "cutaway";

  constructor() {
    this.root.name = "GearboxRoot";

    this.flywheel = this.buildFlywheel();
    this.clutchDisc = this.buildClutchDisc();
    this.pressurePlate = this.buildPressurePlate();
    this.diaphragm = this.buildDiaphragm();
    this.releaseBearing = this.buildReleaseBearing();
    this.clutchFork = this.buildClutchFork();
    this.inputShaft = this.buildInputShaft();
    this.countershaft = this.buildCountershaft();
    this.outputShaft = this.buildOutputShaft();
    this.reverseIdler = this.buildReverseIdler();
    const syn = this.buildSynchros();
    this.synchro12 = syn.s12;
    this.synchro34 = syn.s34;
    this.synchro5r = syn.s5r;
    this.fork12 = syn.f12;
    this.fork34 = syn.f34;
    this.fork5r = syn.f5r;
    const diff = this.buildDifferential();
    this.differential = diff.group;
    this.ringGear = diff.ring;
    this.spiders = diff.spiders;
    this.halfShaftL = diff.left;
    this.halfShaftR = diff.right;
    this.casing = this.buildCasing();

    this.root.add(
      this.flywheel,
      this.clutchDisc,
      this.pressurePlate,
      this.diaphragm,
      this.releaseBearing,
      this.clutchFork,
      this.inputShaft,
      this.countershaft,
      this.outputShaft,
      this.reverseIdler,
      this.synchro12,
      this.synchro34,
      this.synchro5r,
      this.fork12,
      this.fork34,
      this.fork5r,
      this.differential,
      this.casing,
    );

    this.collectOriginalColors(this.root);
    this.setCasingMode("cutaway");
  }

  setCasingMode(mode: CasingMode): void {
    this.casingMode = mode;
    if (mode === "hidden") {
      this.casing.visible = false;
      return;
    }
    this.casing.visible = true;
    for (const mesh of this.casingMeshes) {
      if (mode === "wireframe") {
        mesh.material = this.wireMat;
        mesh.castShadow = false;
      } else if (mode === "cutaway") {
        mesh.material = this.cutawayMat;
        mesh.castShadow = false;
      } else {
        mesh.material = this.casingMaterials.get(mesh) ?? mesh.material;
        mesh.castShadow = true;
      }
    }
  }

  getCasingMode(): CasingMode {
    return this.casingMode;
  }

  setScorched(on: boolean): void {
    this.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (Array.isArray(mat)) return;
      if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) return;
      const base = this.originalColors.get(obj) ?? 0x888888;
      if (on) {
        mat.color.setHex(0x2a2018);
        mat.roughness = 0.92;
        mat.metalness = 0.35;
        mat.emissive = new THREE.Color(0x331800);
        mat.emissiveIntensity = 0.15;
      } else {
        mat.color.setHex(base);
        mat.roughness = mat.userData.restRoughness ?? 0.32;
        mat.metalness = mat.userData.restMetalness ?? 0.82;
        mat.emissive = new THREE.Color(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  }

  highlight(componentId: string | null): void {
    this.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (Array.isArray(mat) || !("emissive" in mat)) return;
      const std = mat as THREE.MeshStandardMaterial;
      const match = componentId !== null && obj.userData.componentId === componentId;
      std.emissive = new THREE.Color(match ? 0x38bdf8 : 0x000000);
      std.emissiveIntensity = match ? 0.35 : 0;
    });
  }

  applyKinematics(opts: {
    engineRpm: number;
    inputRpm: number;
    outputRpm: number;
    counterRpm: number;
    gearSpin: Record<"1" | "2" | "3" | "5" | "R", number>;
    gear: GearId;
    clutchPedal: number;
    dt: number;
    explodeAmount: number;
  }): void {
    const w = (rpm: number) => (rpm / 60) * Math.PI * 2 * opts.dt;
    this.flywheel.rotateOnAxis(Z_AXIS, w(opts.engineRpm));
    this.pressurePlate.rotateOnAxis(Z_AXIS, w(opts.engineRpm));
    this.diaphragm.rotateOnAxis(Z_AXIS, w(opts.engineRpm));
    this.clutchDisc.rotateOnAxis(Z_AXIS, w(opts.inputRpm));
    this.inputShaft.rotateOnAxis(Z_AXIS, w(opts.inputRpm));
    this.countershaft.rotateOnAxis(Z_AXIS, -w(opts.counterRpm));
    this.outputShaft.rotateOnAxis(Z_AXIS, w(opts.outputRpm));
    this.synchro12.rotateOnAxis(Z_AXIS, w(opts.outputRpm));
    this.synchro34.rotateOnAxis(Z_AXIS, w(opts.outputRpm));
    this.synchro5r.rotateOnAxis(Z_AXIS, w(opts.outputRpm));
    this.freeGears.get("1")?.rotateOnAxis(Z_AXIS, w(opts.gearSpin["1"]));
    this.freeGears.get("2")?.rotateOnAxis(Z_AXIS, w(opts.gearSpin["2"]));
    this.freeGears.get("3")?.rotateOnAxis(Z_AXIS, w(opts.gearSpin["3"]));
    this.freeGears.get("5")?.rotateOnAxis(Z_AXIS, w(opts.gearSpin["5"]));
    this.freeGears.get("R")?.rotateOnAxis(Z_AXIS, w(opts.gearSpin.R));
    this.reverseIdler.rotateOnAxis(Z_AXIS, -w(opts.gearSpin.R * 0.85));
    this.ringGear.rotateOnAxis(new THREE.Vector3(1, 0, 0), w(opts.outputRpm / 3.9));
    this.spiders.rotateOnAxis(new THREE.Vector3(0, 1, 0), w(opts.outputRpm / 3.9) * 0.4);
    this.halfShaftL.rotateOnAxis(new THREE.Vector3(1, 0, 0), w(opts.outputRpm / 3.9));
    this.halfShaftR.rotateOnAxis(new THREE.Vector3(1, 0, 0), w(opts.outputRpm / 3.9));

    this.animateClutch(opts.clutchPedal, opts.explodeAmount);
    this.animateSynchros(opts.gear, opts.explodeAmount);
  }

  private explodedBase(obj: THREE.Object3D, amount: number): THREE.Vector3 {
    const target = this.explodeTargets.find((item) => item.object === obj);
    if (!target) return obj.position.clone();
    return new THREE.Vector3().lerpVectors(target.rest, target.exploded, amount);
  }

  private animateClutch(pedal: number, explodeAmount: number): void {
    const travel = THREE.MathUtils.clamp(pedal, 0, 1);
    const bearing = this.explodedBase(this.releaseBearing, explodeAmount);
    const plate = this.explodedBase(this.pressurePlate, explodeAmount);
    this.releaseBearing.position.copy(bearing);
    this.releaseBearing.position.z += travel * 0.07;
    this.diaphragm.scale.set(1, 1, 1 - travel * 0.08);
    this.pressurePlate.position.copy(plate);
    this.pressurePlate.position.z += travel * 0.035;
    this.clutchFork.rotation.x = -0.15 - travel * 0.35;
  }

  private animateSynchros(gear: GearId, explodeAmount: number): void {
    const slide = (group: THREE.Group, offset: number) => {
      const base = this.explodedBase(group, explodeAmount);
      group.position.copy(base);
      group.position.z += offset;
    };
    slide(this.synchro34, gear === 4 ? -0.055 : gear === 3 ? 0.055 : 0);
    slide(this.synchro12, gear === 2 ? -0.055 : gear === 1 ? 0.055 : 0);
    slide(this.synchro5r, gear === 5 ? -0.055 : gear === -1 ? 0.055 : 0);
    const alignFork = (fork: THREE.Mesh, synchro: THREE.Group) => {
      const base = this.explodedBase(fork, explodeAmount);
      fork.position.copy(base);
      fork.position.z += synchro.position.z - this.explodedBase(synchro, explodeAmount).z;
    };
    alignFork(this.fork34, this.synchro34);
    alignFork(this.fork12, this.synchro12);
    alignFork(this.fork5r, this.synchro5r);
  }

  private registerExplode(object: THREE.Object3D, exploded: THREE.Vector3): void {
    this.explodeTargets.push({
      object,
      rest: object.position.clone(),
      exploded,
    });
  }

  private collectOriginalColors(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (Array.isArray(mat)) return;
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        this.originalColors.set(obj, mat.color.getHex());
        mat.userData.restRoughness = mat.roughness;
        mat.userData.restMetalness = mat.metalness;
      }
    });
  }

  private track(obj: THREE.Object3D): void {
    this.pickables.push(obj);
  }

  private buildFlywheel(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, 0, -1.72);
    const disc = makeMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.055, 48), metal(0x3a3f46, { roughness: 0.4 }));
    disc.rotation.x = Math.PI / 2;
    const ring = makeMesh(gearGeometry(72, 0.365, 0.03), metal(0x6d7380, { roughness: 0.28 }));
    const hub = makeMesh(shaftGeometry(0.06, 0.05), metal(0x888f99));
    g.add(disc, ring, hub);
    tag(g, "flywheel", "Engine Flywheel");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0, -2.35));
    return g;
  }

  private buildClutchDisc(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, 0, -1.56);
    const facingMat = new THREE.MeshStandardMaterial({
      color: 0x6b4a2a,
      metalness: 0.08,
      roughness: 0.78,
    });
    const facing = makeMesh(new THREE.CylinderGeometry(0.29, 0.29, 0.012, 40), facingMat);
    facing.rotation.x = Math.PI / 2;
    const core = makeMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 24), metal(0x9aa3ad));
    core.rotation.x = Math.PI / 2;
    const hub = makeMesh(shaftGeometry(0.07, 0.035), metal(0xc5ccd4));
    g.add(facing, core, hub);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spring = makeMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.028, 10), metal(0xc9a227));
      spring.position.set(Math.cos(a) * 0.175, Math.sin(a) * 0.175, 0);
      g.add(spring);
      const window = makeMesh(new THREE.BoxGeometry(0.05, 0.034, 0.008), metal(0x7a828c));
      window.position.copy(spring.position);
      g.add(window);
    }
    tag(g, "clutch-disc", "Clutch Friction Disc");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0, -2.05));
    return g;
  }

  private buildPressurePlate(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, 0, -1.46);
    const plate = makeMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 40), metal(0x4a4e55, { roughness: 0.48 }));
    plate.rotation.x = Math.PI / 2;
    g.add(plate);
    tag(g, "pressure-plate", "Pressure Plate");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0, -1.85));
    return g;
  }

  private buildDiaphragm(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, 0, -1.4);
    const ring = makeMesh(new THREE.TorusGeometry(0.2, 0.018, 8, 32), metal(0x8a9099, { roughness: 0.3 }));
    g.add(ring);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const finger = makeMesh(new THREE.BoxGeometry(0.028, 0.006, 0.16), metal(0x7c838c));
      finger.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0);
      finger.lookAt(0, 0, 0);
      g.add(finger);
    }
    tag(g, "pressure-plate", "Diaphragm Spring");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0, -1.72));
    return g;
  }

  private buildReleaseBearing(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, 0, -1.22);
    const bearing = makeMesh(new THREE.TorusGeometry(0.055, 0.016, 10, 20), metal(0xd7dde4, { roughness: 0.18 }));
    const carrier = makeMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16), metal(0x9aa2ab));
    carrier.rotation.x = Math.PI / 2;
    g.add(bearing, carrier);
    tag(g, "release-bearing", "Clutch Release Bearing");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0.15, -1.55));
    return g;
  }

  private buildClutchFork(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, -0.22, -1.2);
    const arm = makeMesh(new THREE.BoxGeometry(0.04, 0.35, 0.03), metal(0x667078));
    arm.rotation.z = 0.4;
    g.add(arm);
    tag(g, "release-bearing", "Clutch Fork");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, -0.55, -1.45));
    return g;
  }

  private buildInputShaft(): THREE.Group {
    const g = new THREE.Group();
    const shaft = makeMesh(shaftGeometry(1.05, 0.028), metal(0xd4b483));
    shaft.position.z = -1.05;
    const spline = makeMesh(shaftGeometry(0.16, 0.032), metal(0xe6d3a3));
    spline.position.z = -1.55;
    const pinion = makeMesh(gearGeometry(18, 0.125, 0.048), metal(0xe0c07a));
    pinion.position.z = -0.7;
    const dogs = makeMesh(gearGeometry(24, 0.075, 0.03), metal(0xf0e6c8));
    dogs.position.z = -0.52;
    g.add(shaft, spline, pinion, dogs);
    tag(g, "input-shaft", "Transmission Input Shaft");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0, -0.55));
    return g;
  }

  private buildCountershaft(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, -0.36, 0);
    const shaft = makeMesh(shaftGeometry(1.85, 0.03), metal(0x6ea0c8));
    shaft.position.z = 0.15;
    const drive = makeMesh(gearGeometry(29, 0.2, 0.05), metal(0x5b8fb8));
    drive.position.z = -0.7;
    const c3 = makeMesh(gearGeometry(23, 0.155, 0.042), metal(0x6aa0c4));
    c3.position.z = -0.22;
    const c2 = makeMesh(gearGeometry(23, 0.15, 0.042), metal(0x7aaccc));
    c2.position.z = 0.02;
    const c1 = makeMesh(gearGeometry(17, 0.11, 0.048), metal(0x89bad6));
    c1.position.z = 0.42;
    const c5 = makeMesh(gearGeometry(33, 0.215, 0.038), metal(0x4f88b0));
    c5.position.z = 0.68;
    const cR = makeMesh(gearGeometry(18, 0.12, 0.04), metal(0x3d6f96));
    cR.position.z = 1.08;
    g.add(shaft, drive, c3, c2, c1, c5, cR);
    tag(g, "countershaft", "Countershaft Cluster");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, -0.95, 0));
    return g;
  }

  private buildOutputShaft(): THREE.Group {
    const g = new THREE.Group();
    const shaft = makeMesh(shaftGeometry(1.85, 0.026), metal(0xcfd6de));
    shaft.position.z = 0.4;
    const g3 = makeMesh(gearGeometry(20, 0.205, 0.042), metal(0x8f9a4a));
    g3.position.z = -0.22;
    const g2 = makeMesh(gearGeometry(30, 0.21, 0.042), metal(0xc9a227));
    g2.position.z = 0.02;
    const g1 = makeMesh(gearGeometry(38, 0.25, 0.05), metal(0xb87333));
    g1.position.z = 0.42;
    const g5 = makeMesh(gearGeometry(16, 0.145, 0.038), metal(0x2ec4b6));
    g5.position.z = 0.68;
    const gR = makeMesh(gearGeometry(38, 0.24, 0.04), metal(0xc23b4a));
    gR.position.z = 1.08;
    const flange = makeMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.04, 16), metal(0xb8c0c8));
    flange.rotation.x = Math.PI / 2;
    flange.position.z = 1.28;
    g.add(shaft, flange);
    const gears = [
      [g3, "3", "gear-3"],
      [g2, "2", "gear-2"],
      [g1, "1", "gear-1"],
      [g5, "5", "gear-5"],
      [gR, "R", "reverse-idler"],
    ] as const;
    for (const [mesh, key, id] of gears) {
      g.add(mesh);
      this.freeGears.set(key, mesh);
      tag(mesh, id, `Main ${key}`);
      this.track(mesh);
      this.registerExplode(mesh, mesh.position.clone().add(new THREE.Vector3(0, 0.12 + Number(key === "R" ? 0.08 : 0.02) + 0.08, key === "R" ? 0.22 : 0.12)));
    }
    tag(g, "input-shaft", "Output / Mainshaft");
    tag(shaft, "input-shaft", "Mainshaft");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0, 0, 0.35));
    this.registerExplode(flange, new THREE.Vector3(0, 0, 1.7));
    return g;
  }

  private buildReverseIdler(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0.26, -0.16, 1.08);
    const gear = makeMesh(gearGeometry(22, 0.1, 0.038), metal(0xe35d6a));
    const stub = makeMesh(shaftGeometry(0.16, 0.018), metal(0x9aa3ad));
    g.add(gear, stub);
    tag(g, "reverse-idler", "Reverse Idler Assembly");
    this.track(g);
    this.registerExplode(g, new THREE.Vector3(0.7, -0.16, 1.25));
    return g;
  }

  private buildSynchros(): {
    s12: THREE.Group;
    s34: THREE.Group;
    s5r: THREE.Group;
    f12: THREE.Mesh;
    f34: THREE.Mesh;
    f5r: THREE.Mesh;
  } {
    const mk = (z: number, id: string, name: string) => {
      const g = new THREE.Group();
      g.position.set(0, 0, z);
      const hub = makeMesh(shaftGeometry(0.04, 0.045), metal(0x8d949c));
      const sleeve = makeMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.045, 20), metal(0x4d555c, { roughness: 0.4 }));
      sleeve.rotation.x = Math.PI / 2;
      const ringA = makeMesh(new THREE.TorusGeometry(0.068, 0.008, 8, 24), metal(0xc4a35a, { metalness: 0.7, roughness: 0.35 }));
      ringA.position.z = -0.028;
      const ringB = ringA.clone();
      ringB.position.z = 0.028;
      g.add(hub, sleeve, ringA, ringB);
      tag(g, id, name);
      this.track(g);
      this.registerExplode(g, new THREE.Vector3(0, 0.28, z));
      return g;
    };
    const fork = (z: number) => {
      const mesh = makeMesh(new THREE.BoxGeometry(0.018, 0.16, 0.03), metal(0x6b7380));
      mesh.position.set(0.12, 0.12, z);
      tag(mesh, "selector", "Shift Fork");
      this.track(mesh);
      this.registerExplode(mesh, new THREE.Vector3(0.38, 0.42, z));
      return mesh;
    };
    const s34 = mk(-0.42, "synchro-34", "3rd/4th Synchronizer");
    const s12 = mk(0.22, "synchro-12", "1st/2nd Synchronizer");
    const s5r = mk(0.88, "synchro-5r", "5th/Reverse Synchronizer");
    const fourthDogs = makeMesh(gearGeometry(20, 0.078, 0.028), metal(0xf2efe6));
    fourthDogs.position.set(0, 0, -0.5);
    tag(fourthDogs, "gear-4", "4th Direct Drive Dog Clutch");
    this.track(fourthDogs);
    this.inputShaft.add(fourthDogs);
    this.registerExplode(fourthDogs, new THREE.Vector3(0, 0.22, -0.68));
    return {
      s12,
      s34,
      s5r,
      f12: fork(0.22),
      f34: fork(-0.42),
      f5r: fork(0.88),
    };
  }

  private buildDifferential(): {
    group: THREE.Group;
    ring: THREE.Mesh;
    spiders: THREE.Group;
    left: THREE.Mesh;
    right: THREE.Mesh;
  } {
    const group = new THREE.Group();
    group.position.set(0, -0.05, 1.55);
    const pinion = makeMesh(gearGeometry(12, 0.07, 0.04), metal(0xc5ccd4));
    pinion.position.set(0, 0, -0.12);
    const ring = makeMesh(gearGeometry(36, 0.22, 0.045), metal(0x9aa7b5));
    ring.rotation.z = Math.PI / 2;
    const caseMesh = makeMesh(new THREE.SphereGeometry(0.1, 16, 12), metal(0x7d8792, { roughness: 0.45 }));
    const spiders = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const spider = makeMesh(gearGeometry(10, 0.035, 0.02), metal(0xb8c2cc));
      const a = (i / 4) * Math.PI * 2;
      spider.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0);
      spider.rotation.z = a;
      spiders.add(spider);
    }
    const left = makeMesh(shaftGeometry(0.55, 0.02), metal(0xaeb6be));
    left.rotation.z = Math.PI / 2;
    left.position.x = -0.38;
    const right = makeMesh(shaftGeometry(0.55, 0.02), metal(0xaeb6be));
    right.rotation.z = Math.PI / 2;
    right.position.x = 0.38;
    group.add(pinion, ring, caseMesh, spiders, left, right);
    tag(group, "differential", "Differential & Final Drive");
    this.track(group);
    this.registerExplode(group, new THREE.Vector3(0, -0.05, 2.15));
    this.registerExplode(left, new THREE.Vector3(-0.85, 0, 0));
    this.registerExplode(right, new THREE.Vector3(0.85, 0, 0));
    return { group, ring, spiders, left, right };
  }

  private buildCasing(): THREE.Group {
    const g = new THREE.Group();
    const alu = metal(0xb7c4ce, { metalness: 0.55, roughness: 0.38 });
    const bell = makeMesh(new THREE.CylinderGeometry(0.42, 0.34, 0.42, 28, 1, true), alu.clone());
    bell.rotation.x = Math.PI / 2;
    bell.position.z = -1.35;
    const body = makeMesh(new THREE.BoxGeometry(0.62, 0.72, 1.55), alu.clone());
    body.position.set(0, -0.12, 0.15);
    const tail = makeMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 16, 1, true), alu.clone());
    tail.rotation.x = Math.PI / 2;
    tail.position.z = 1.05;
    const ribs: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const rib = makeMesh(new THREE.BoxGeometry(0.64, 0.04, 0.03), alu.clone());
      rib.position.set(0, 0.22, -0.4 + i * 0.28);
      ribs.push(rib);
    }
    const drain = makeMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), metal(0x33383e));
    drain.position.set(0, -0.48, 0.2);
    const glass = makeMesh(
      new THREE.CircleGeometry(0.045, 20),
      new THREE.MeshStandardMaterial({
        color: 0x1b5e4a,
        metalness: 0.1,
        roughness: 0.12,
        transparent: true,
        opacity: 0.75,
        emissive: new THREE.Color(0x0b3d30),
        emissiveIntensity: 0.2,
      }),
    );
    glass.position.set(0.315, -0.1, 0.35);
    glass.rotation.y = Math.PI / 2;
    g.add(bell, body, tail, drain, glass, ...ribs);

    const caseMeshes = [bell, body, tail, ...ribs];
    for (const mesh of caseMeshes) {
      this.casingMeshes.push(mesh);
      this.casingMaterials.set(mesh, (mesh.material as THREE.Material).clone());
    }
    tag(g, "casing", "Transmission Casing");
    tag(drain, "casing", "Drain Plug");
    tag(glass, "casing", "Oil Sight Glass");
    this.track(g);
    this.registerExplode(bell, new THREE.Vector3(0, 0, -1.85));
    this.registerExplode(body, new THREE.Vector3(0.75, -0.12, 0.15));
    this.registerExplode(tail, new THREE.Vector3(0, 0, 1.55));
    return g;
  }
}
