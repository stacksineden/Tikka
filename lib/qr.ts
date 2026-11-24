import "server-only";

import QRCode from "qrcode";
import { ON_INK } from "./color";

/**
 * An SVG QR code, in Tikka ink on white unless colours are given (business cards use the
 * business's own colour, darkened by deepen() so scanners still read it).
 */
export function qrSvg(text: string, colors: { dark: string; light: string } = { dark: ON_INK, light: "#FFFFFF" }): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: colors });
}

export const SITE = "https://usetikka.com";
