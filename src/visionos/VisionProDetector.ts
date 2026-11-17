/**
 * Vision Pro and Spatial WebXR detection utilities for Apple Vision Pro (visionOS Safari)
 * and spatial computing devices.
 */

export function isVisionOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // 1. Explicit visionOS / Vision user agents
  if (/Vision/i.test(ua) || /visionOS/i.test(ua)) return true;

  // 2. Apple Vision Pro Safari reports as Macintosh with touch points > 0
  // (Unlike macOS desktops which have 0 touch points, Vision Pro reports touch points > 0)
  if (platform === "MacIntel" && maxTouchPoints > 0 && /Safari/.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    return true;
  }

  return false;
}

/**
 * Checks if WebXR immersive-vr or immersive-ar is available on this browser.
 * visionOS Safari primarily supports 'immersive-vr' (which renders with natural mixed-reality passthrough).
 */
export async function isSpatialSupported(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("xr" in navigator) || !navigator.xr) {
    return false;
  }
  try {
    const vrSupported = await navigator.xr.isSessionSupported("immersive-vr");
    if (vrSupported) return true;
    const arSupported = await navigator.xr.isSessionSupported("immersive-ar");
    return arSupported;
  } catch {
    return false;
  }
}

/**
 * Returns the preferred WebXR session mode for spatial computing.
 * On visionOS Safari, 'immersive-vr' is the standard mode for mixed reality with hand tracking.
 */
export async function getPreferredSpatialMode(): Promise<"immersive-vr" | "immersive-ar" | null> {
  if (typeof navigator === "undefined" || !("xr" in navigator) || !navigator.xr) {
    return null;
  }
  try {
    if (await navigator.xr.isSessionSupported("immersive-vr")) {
      return "immersive-vr";
    }
    if (await navigator.xr.isSessionSupported("immersive-ar")) {
      return "immersive-ar";
    }
  } catch {
    return null;
  }
  return null;
}
