import * as THREE from "three";
import type { SpatialUIManager } from "./SpatialUIManager";

export interface GestureState {
  leftPinching: boolean;
  rightPinching: boolean;
  leftPinchPos: THREE.Vector3;
  rightPinchPos: THREE.Vector3;
  leftIndexTip: THREE.Vector3;
  rightIndexTip: THREE.Vector3;
  twoHandedGestureActive: boolean;
}

export interface SpatialGestureCallbacks {
  onPinchSelect: (point: THREE.Vector3, ray?: THREE.Ray) => void;
  onTwoHandedScale: (scaleDelta: number) => void;
  onTwoHandedRotate: (angleDelta: number) => void;
  onTwoHandedTranslate: (delta: THREE.Vector3) => void;
  onComponentPoke?: (componentId: string) => void;
}

const PINCH_THRESHOLD_METERS = 0.028; // 2.8 cm between thumb tip and index tip
const PINCH_RELEASE_METERS = 0.040; // 4.0 cm release margin to prevent jitter

/**
 * Spatial Gesture Controller for Apple Vision Pro (visionOS Safari).
 * Tracks 25 hand joints via WebXR Hand Input API and supports:
 * - Direct Index Finger Poke (pushing 3D buttons or tapping parts in space)
 * - Single-hand Pinch (Look & Pinch or Direct Pinch selection)
 * - Two-handed Spatial Gestures (Pinch with both hands to scale, rotate, and reposition in 3D space)
 * - Joint visualization with glowing spatial glass nodes
 */
export class SpatialGestureController {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly spatialUI: SpatialUIManager;
  private readonly callbacks: SpatialGestureCallbacks;

  // Hand spaces from Three.js WebXRManager
  private leftHand: any = null;
  private rightHand: any = null;
  private leftController: THREE.XRTargetRaySpace | null = null;
  private rightController: THREE.XRTargetRaySpace | null = null;

  // Joint visualizer meshes
  private handVisualsGroup = new THREE.Group();
  private leftJointMeshes = new Map<string, THREE.Mesh>();
  private rightJointMeshes = new Map<string, THREE.Mesh>();

  // Gesture state tracking
  private isLeftPinching = false;
  private isRightPinching = false;
  private previousTwoHandSpan = 0;
  private previousTwoHandAngle = 0;
  private previousTwoHandMidpoint = new THREE.Vector3();
  private twoHandedActive = false;

  private leftPinchPos = new THREE.Vector3();
  private rightPinchPos = new THREE.Vector3();
  private leftIndexTipPos = new THREE.Vector3();
  private rightIndexTipPos = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    spatialUI: SpatialUIManager,
    callbacks: SpatialGestureCallbacks,
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.spatialUI = spatialUI;
    this.callbacks = callbacks;

    this.handVisualsGroup.name = "SpatialHandVisuals";
    this.scene.add(this.handVisualsGroup);
    this.setupControllersAndHands();
  }

  get state(): GestureState {
    return {
      leftPinching: this.isLeftPinching,
      rightPinching: this.isRightPinching,
      leftPinchPos: this.leftPinchPos.clone(),
      rightPinchPos: this.rightPinchPos.clone(),
      leftIndexTip: this.leftIndexTipPos.clone(),
      rightIndexTip: this.rightIndexTipPos.clone(),
      twoHandedGestureActive: this.twoHandedActive,
    };
  }

  private setupControllersAndHands(): void {
    if (!this.renderer.xr) return;

    // 1. Transient Pointer Controllers for visionOS Look & Pinch
    this.leftController = this.renderer.xr.getController(0);
    this.rightController = this.renderer.xr.getController(1);

    if (this.leftController) {
      this.leftController.addEventListener("selectstart", (ev) => this.handleControllerSelect(ev, 0));
      this.scene.add(this.leftController);
    }
    if (this.rightController) {
      this.rightController.addEventListener("selectstart", (ev) => this.handleControllerSelect(ev, 1));
      this.scene.add(this.rightController);
    }

    // 2. Direct WebXR Hand Tracking (25 joints per hand)
    this.leftHand = this.renderer.xr.getHand(0);
    this.rightHand = this.renderer.xr.getHand(1);

    if (this.leftHand) {
      this.scene.add(this.leftHand);
      this.buildHandVisuals(this.leftJointMeshes, 0x38bdf8);
    }
    if (this.rightHand) {
      this.scene.add(this.rightHand);
      this.buildHandVisuals(this.rightJointMeshes, 0x00e5ff);
    }
  }

  private buildHandVisuals(
    meshMap: Map<string, THREE.Mesh>,
    beaconColor: number,
  ): void {
    const jointNames: XRHandJoint[] = [
      "wrist",
      "thumb-metacarpal",
      "thumb-phalanx-proximal",
      "thumb-phalanx-distal",
      "thumb-tip",
      "index-finger-metacarpal",
      "index-finger-phalanx-proximal",
      "index-finger-phalanx-intermediate",
      "index-finger-phalanx-distal",
      "index-finger-tip",
      "middle-finger-metacarpal",
      "middle-finger-phalanx-proximal",
      "middle-finger-phalanx-intermediate",
      "middle-finger-phalanx-distal",
      "middle-finger-tip",
      "ring-finger-metacarpal",
      "ring-finger-phalanx-proximal",
      "ring-finger-phalanx-intermediate",
      "ring-finger-phalanx-distal",
      "ring-finger-tip",
      "pinky-finger-metacarpal",
      "pinky-finger-phalanx-proximal",
      "pinky-finger-phalanx-intermediate",
      "pinky-finger-phalanx-distal",
      "pinky-finger-tip",
    ];

    const normalMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
    });

    const tipMat = new THREE.MeshBasicMaterial({
      color: beaconColor,
      transparent: true,
      opacity: 0.9,
    });

    for (const name of jointNames) {
      const isTip = name === "index-finger-tip" || name === "thumb-tip";
      const radius = isTip ? 0.009 : name === "wrist" ? 0.014 : 0.006;
      const geo = new THREE.SphereGeometry(radius, 8, 8);
      const mesh = new THREE.Mesh(geo, isTip ? tipMat.clone() : normalMat);
      mesh.visible = false;
      this.handVisualsGroup.add(mesh);
      meshMap.set(name, mesh);
    }
  }

  private handleControllerSelect(_ev: any, _index: number): void {
    // Controller select fired from gaze-pinch on Vision Pro
    const controller = _index === 0 ? this.leftController : this.rightController;
    if (!controller) return;

    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    const origin = new THREE.Vector3();
    controller.getWorldPosition(origin);

    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    const ray = new THREE.Ray(origin, direction);

    this.callbacks.onPinchSelect(origin, ray);
  }

  /**
   * Called every frame in the WebXR animation loop.
   * Processes joint updates, direct poking, and two-handed spatial gestures.
   */
  update(_frame: XRFrame | null): void {
    const leftActive = this.updateHandJoints(this.leftHand, this.leftJointMeshes, true);
    const rightActive = this.updateHandJoints(this.rightHand, this.rightJointMeshes, false);

    // 1. Direct Index Finger Poke Check
    if (leftActive && this.leftIndexTipPos.lengthSq() > 0) {
      this.spatialUI.checkFingerPoke(this.leftIndexTipPos);
    }
    if (rightActive && this.rightIndexTipPos.lengthSq() > 0) {
      this.spatialUI.checkFingerPoke(this.rightIndexTipPos);
    }

    // 2. Two-Handed Spatial Gestures (Scale, Rotate, Reposition)
    if (this.isLeftPinching && this.isRightPinching) {
      const currentSpan = this.leftPinchPos.distanceTo(this.rightPinchPos);
      const currentMidpoint = new THREE.Vector3()
        .addVectors(this.leftPinchPos, this.rightPinchPos)
        .multiplyScalar(0.5);
      const currentAngle = Math.atan2(
        this.rightPinchPos.z - this.leftPinchPos.z,
        this.rightPinchPos.x - this.leftPinchPos.x,
      );

      if (!this.twoHandedActive) {
        // Gesture initiated
        this.twoHandedActive = true;
        this.previousTwoHandSpan = currentSpan;
        this.previousTwoHandAngle = currentAngle;
        this.previousTwoHandMidpoint.copy(currentMidpoint);
      } else {
        // Delta scale: ratio of current distance vs previous distance
        if (this.previousTwoHandSpan > 0.05) {
          const scaleDelta = currentSpan / this.previousTwoHandSpan;
          if (Math.abs(scaleDelta - 1.0) > 0.005) {
            this.callbacks.onTwoHandedScale(scaleDelta);
          }
        }

        // Delta rotation: difference in angle around vertical Y axis
        const angleDelta = currentAngle - this.previousTwoHandAngle;
        if (Math.abs(angleDelta) > 0.005) {
          this.callbacks.onTwoHandedRotate(angleDelta);
        }

        // Delta translation: movement of hand midpoint
        const moveDelta = new THREE.Vector3().subVectors(currentMidpoint, this.previousTwoHandMidpoint);
        if (moveDelta.length() > 0.002) {
          this.callbacks.onTwoHandedTranslate(moveDelta);
        }

        this.previousTwoHandSpan = currentSpan;
        this.previousTwoHandAngle = currentAngle;
        this.previousTwoHandMidpoint.copy(currentMidpoint);
      }
    } else {
      if (this.twoHandedActive) {
        this.twoHandedActive = false;
      }
    }
  }

  private updateHandJoints(
    hand: any,
    meshMap: Map<string, THREE.Mesh>,
    isLeft: boolean,
  ): boolean {
    if (!hand || !hand.joints) {
      meshMap.forEach((m) => (m.visible = false));
      if (isLeft) this.isLeftPinching = false;
      else this.isRightPinching = false;
      return false;
    }

    let hasVisibleJoints = false;
    let thumbPos: THREE.Vector3 | null = null;
    let indexPos: THREE.Vector3 | null = null;

    meshMap.forEach((mesh, name) => {
      const joint = hand.joints[name];
      if (joint && joint.visible !== false) {
        hasVisibleJoints = true;
        mesh.visible = true;
        mesh.position.copy(joint.position);
        mesh.quaternion.copy(joint.quaternion);

        if (name === "thumb-tip") {
          thumbPos = new THREE.Vector3().copy(joint.position);
        } else if (name === "index-finger-tip") {
          indexPos = new THREE.Vector3().copy(joint.position);
        }
      } else {
        mesh.visible = false;
      }
    });

    if (indexPos) {
      if (isLeft) this.leftIndexTipPos.copy(indexPos);
      else this.rightIndexTipPos.copy(indexPos);
    }

    // Direct Pinch Detection
    if (thumbPos && indexPos) {
      const pinchDist = (thumbPos as THREE.Vector3).distanceTo(indexPos as THREE.Vector3);
      const currentlyPinching = isLeft ? this.isLeftPinching : this.isRightPinching;

      if (!currentlyPinching && pinchDist < PINCH_THRESHOLD_METERS) {
        if (isLeft) {
          this.isLeftPinching = true;
          this.leftPinchPos.addVectors(thumbPos, indexPos).multiplyScalar(0.5);
          this.callbacks.onPinchSelect(this.leftPinchPos);
        } else {
          this.isRightPinching = true;
          this.rightPinchPos.addVectors(thumbPos, indexPos).multiplyScalar(0.5);
          this.callbacks.onPinchSelect(this.rightPinchPos);
        }
      } else if (currentlyPinching && pinchDist > PINCH_RELEASE_METERS) {
        if (isLeft) this.isLeftPinching = false;
        else this.isRightPinching = false;
      } else if (currentlyPinching) {
        // Update live pinch midpoint while pinched
        if (isLeft) this.leftPinchPos.addVectors(thumbPos, indexPos).multiplyScalar(0.5);
        else this.rightPinchPos.addVectors(thumbPos, indexPos).multiplyScalar(0.5);
      }
    } else {
      if (isLeft) this.isLeftPinching = false;
      else this.isRightPinching = false;
    }

    return hasVisibleJoints;
  }

  dispose(): void {
    this.scene.remove(this.handVisualsGroup);
    this.leftJointMeshes.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.rightJointMeshes.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.leftJointMeshes.clear();
    this.rightJointMeshes.clear();
  }
}
