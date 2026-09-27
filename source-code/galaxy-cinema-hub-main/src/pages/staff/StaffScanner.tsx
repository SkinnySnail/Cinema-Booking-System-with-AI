import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, AlertTriangle, QrCode, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TicketChecker from "@/components/staff/TicketChecker";
import { useAuth } from "@/contexts/AppContext";
import StaffAccessDenied from "@/components/staff/StaffAccessDenied";
import jsQR from "jsqr";

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorInstance;
};

const StaffScanner: React.FC = () => {
  const { user } = useAuth();

  const hasScannerPermission = useMemo(() => {
    if (!user) return true;
    if (user.role === "admin" || user.base_role === "admin") return true;

    if (user.permissions && Array.isArray(user.permissions)) {
      return (
        user.permissions.includes("tickets.scan") ||
        user.permissions.includes("tickets.approve_entry")
      );
    }
    return false;
  }, [user]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const checkingFrameRef = useRef(false);
  const lastScannedAtRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>("");

  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [scannedCode, setScannedCode] = useState("");
  const [autoCheckSignal, setAutoCheckSignal] = useState(0);
  const [scannedHistory, setScannedHistory] = useState<string[]>([]);

  const hasBarcodeDetector = useMemo(() => {
    const win = window as WindowWithBarcodeDetector;
    return typeof win.BarcodeDetector === "function";
  }, []);

  const stopScannerLoop = useCallback(() => {
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopScannerLoop();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStarted(false);
  }, [stopScannerLoop]);

  const onQrDetected = useCallback((code: string) => {
    const now = Date.now();

    if (now - lastScannedAtRef.current < 1200 && code === lastScannedCodeRef.current) {
      return;
    }

    lastScannedAtRef.current = now;
    lastScannedCodeRef.current = code;

    setScannedCode(code);
    setAutoCheckSignal((prev) => prev + 1);
    setScannedHistory((prev) => {
      const next = [code, ...prev.filter((item) => item !== code)];
      return next.slice(0, 5);
    });
  }, []);

  const startScannerLoop = useCallback(() => {
    stopScannerLoop();

    scanIntervalRef.current = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;
      if (checkingFrameRef.current) return;

      checkingFrameRef.current = true;
      try {
        if (detectorRef.current) {
          const results = await detectorRef.current.detect(video);
          if (results.length > 0) {
            const raw = results[0].rawValue?.trim();
            if (raw) {
              onQrDetected(raw);
            }
          }
        } else {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          const targetWidth = 640;
          const ratio = video.videoHeight > 0 ? video.videoHeight / video.videoWidth : 0.75;
          const targetHeight = Math.max(360, Math.floor(targetWidth * ratio));

          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

          const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
          const qr = jsQR(imageData.data, targetWidth, targetHeight, {
            inversionAttempts: "attemptBoth",
          });

          if (qr?.data?.trim()) {
            onQrDetected(qr.data.trim());
          }
        }
      } catch {
        // Ignore per-frame detect errors and keep scanning.
      } finally {
        checkingFrameRef.current = false;
      }
    }, 350);
  }, [onQrDetected, stopScannerLoop]);

  const startCamera = useCallback(async () => {
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      setCameraStarted(true);

      if (hasBarcodeDetector) {
        const win = window as WindowWithBarcodeDetector;
        detectorRef.current = new win.BarcodeDetector!({ formats: ["qr_code"] });
        startScannerLoop();
        return;
      }

      detectorRef.current = null;
      startScannerLoop();

      setCameraError(
        "Đang dùng chế độ quét tương thích đa trình duyệt (jsQR). Nếu camera khó bắt mã, hãy tăng sáng hoặc dùng nút quét từ ảnh.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể truy cập camera. Hãy cấp quyền camera và thử lại.";
      setCameraError(message);
      stopCamera();
    }
  }, [hasBarcodeDetector, startScannerLoop, stopCamera]);

  const decodeQrFromFile = useCallback(async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const targetWidth = 1200;
      const ratio = bitmap.height / bitmap.width;
      const targetHeight = Math.max(700, Math.floor(targetWidth * ratio));

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const qr = jsQR(imageData.data, targetWidth, targetHeight, {
        inversionAttempts: "attemptBoth",
      });

      if (qr?.data?.trim()) {
        onQrDetected(qr.data.trim());
        return;
      }

      setCameraError("Không đọc được QR từ ảnh. Hãy dùng ảnh nét hơn hoặc chụp sát QR.");
    } catch (error) {
      console.error("decodeQrFromFile error:", error);
      setCameraError("Không thể xử lý ảnh QR đã tải lên.");
    }
  }, [onQrDetected]);

  useEffect(() => {
    if (!hasScannerPermission) return;
    void startCamera();

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera, hasScannerPermission]);

  if (!hasScannerPermission) {
    return (
      <StaffAccessDenied
        title="Bạn không có quyền Quét Vé"
        requiredPermission="tickets.scan"
        returnPath="/staff/pos"
        returnLabel="Chuyển sang Bán Vé"
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-2 sm:px-0">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Quét Vé Bằng Camera
          </CardTitle>
          {cameraStarted ? (
            <Button variant="outline" onClick={stopCamera}>
              <CameraOff className="w-4 h-4 mr-2" />
              Tắt camera
            </Button>
          ) : (
            <Button onClick={() => void startCamera()}>
              <Camera className="w-4 h-4 mr-2" />
              Mở camera
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void decodeQrFromFile(file);
              }
              e.currentTarget.value = "";
            }}
          />
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Quét từ ảnh QR
            </Button>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-border bg-slate-950 aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${cameraStarted ? "opacity-100" : "opacity-0"}`}
              muted
              autoPlay
            />

            {!cameraStarted && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Camera className="w-12 h-12 mb-2 opacity-70" />
                <p>Camera chưa hoạt động</p>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[72%] h-[72%] rounded-xl border-2 border-primary/80" />
            </div>
          </div>

          {cameraError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {scannedCode && (
            <div className="rounded-md border border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-300 px-3 py-2 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>Mã vừa quét: {scannedCode}</span>
            </div>
          )}

          {scannedHistory.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold mb-2">Lịch sử quét gần đây</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                {scannedHistory.map((code) => (
                  <p key={code} className="font-mono">
                    {code}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TicketChecker
        scannedCode={scannedCode}
        autoCheckSignal={autoCheckSignal}
      />
    </div>
  );
};

export default StaffScanner;
