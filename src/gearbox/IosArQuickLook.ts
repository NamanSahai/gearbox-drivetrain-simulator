import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Launches Apple AR Quick Look on iOS devices (iPhone, iPad).
 * Exports the 3D model to USDZ in memory with horizontal plane anchoring (tables & floors),
 * and triggers native ARKit Quick Look via <a rel="ar">.
 */
export async function launchIosArQuickLook(root: THREE.Object3D): Promise<void> {
  const exporter = new USDZExporter();

  const buffer = await exporter.parseAsync(root, {
    quickLookCompatible: true,
    ar: {
      anchoring: { type: "plane" },
      planeAnchoring: { alignment: "horizontal" },
    },
  });

  const blob = new Blob([buffer as unknown as BlobPart], { type: "model/vnd.usdz+zip" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.setAttribute("rel", "ar");
  anchor.setAttribute("href", url);
  anchor.setAttribute("download", "gearbox.usdz");
  anchor.style.display = "none";

  // iOS Safari requires an <img> child inside <a rel="ar">
  const img = document.createElement("img");
  img.alt = "AR Quick Look Model";
  anchor.appendChild(img);

  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 20000);
}

/**
 * Direct manual export for USDZ download.
 */
export async function exportUsdz(root: THREE.Object3D): Promise<void> {
  const exporter = new USDZExporter();
  const buffer = await exporter.parseAsync(root, {
    quickLookCompatible: true,
    ar: {
      anchoring: { type: "plane" },
      planeAnchoring: { alignment: "horizontal" },
    },
  });

  const blob = new Blob([buffer as unknown as BlobPart], { type: "model/vnd.usdz+zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manual-gearbox.usdz";
  a.click();
  URL.revokeObjectURL(url);
}
