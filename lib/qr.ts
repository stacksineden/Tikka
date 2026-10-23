import "server-only";

import QRCode from "qrcode";
import { ON_INK } from "./color";

/** An SVG QR code in Tikka ink on white (scanners need the contrast). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: ON_INK, light: "#FFFFFF" } });
}

export const SITE = "https://usetikka.com";
