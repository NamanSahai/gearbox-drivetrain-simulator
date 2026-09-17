/**
 * High-contrast standard QR Code generator using 'qrcode'.
 * Renders dark (#000000) modules on pure white (#ffffff) background
 * with standard quiet margins for instant detection by iOS Camera & Google Lens.
 */
import QRCode from "qrcode";

export function drawQr(canvas: HTMLCanvasElement, text: string): void {
  const size = canvas.width || 240;
  QRCode.toCanvas(
    canvas,
    text,
    {
      width: size,
      margin: 3,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    },
    (err) => {
      if (err) {
        console.error("QR render error:", err);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = "#000000";
          ctx.font = "12px ui-monospace, monospace";
          ctx.fillText("QR code generation failed", 12, size / 2);
        }
      }
    }
  );
}

