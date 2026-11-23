import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Render a QR code locally as a PNG data URL.
 * Ticket codes and payment links never leave the browser (previously they were
 * sent to api.qrserver.com to draw the image).
 */
export function qrDataUrl(text: string, size = 256): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

/** React hook variant: returns null until the image is ready (or when text is empty). */
export function useQrDataUrl(
  text: string | null | undefined,
  size = 256,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!text) {
      setUrl(null);
      return;
    }
    qrDataUrl(text, size)
      .then((value) => {
        if (!cancelled) setUrl(value);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  return url;
}
