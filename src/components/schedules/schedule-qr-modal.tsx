"use client";

import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import {
  QrCode,
  Copy,
  Check,
  Download,
  ExternalLink,
  Coffee,
  Calendar,
  Sparkles,
  Smartphone,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ScheduleQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  deadlineFormatted?: string | null;
}

export function ScheduleQrModal({
  open,
  onOpenChange,
  weekStart,
  deadlineFormatted,
}: ScheduleQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Determine base host (LAN IP or current origin)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : "";
      const protocol = window.location.protocol;

      // If localhost on PC, prefer LAN IP 192.168.2.182 so mobile phones on WiFi can open it directly!
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        setCustomHost(`http://192.168.2.182:3005`);
      } else {
        setCustomHost(`${protocol}//${hostname}${port}`);
      }
    }
  }, []);

  const registrationUrl = `${customHost || "http://192.168.2.182:3005"}/register-schedule?week=${weekStart}`;

  // Generate QR Code data URL
  useEffect(() => {
    if (!open || !registrationUrl) return;

    QRCode.toDataURL(registrationUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: "#064e3b", // Emerald 900
        light: "#ffffff",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("Error generating QR code", err));
  }, [open, registrationUrl]);

  // Copy registration URL to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Generate and download high-resolution poster for Zalo / Printing
  const handleDownloadPoster = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 1100);
    gradient.addColorStop(0, "#064e3b");
    gradient.addColorStop(0.35, "#065f46");
    gradient.addColorStop(1, "#022c22");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 1100);

    // Decorative circle
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.arc(400, 200, 300, 0, Math.PI * 2);
    ctx.fill();

    // Brand Name
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("☕ D'LAT CAFE & BISTRO", 400, 80);

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("ĐĂNG KÝ CA LÀM VIỆC", 400, 145);

    // Subtitle / Week
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "500 24px sans-serif";
    ctx.fillText(`Tuần làm việc từ: ${weekStart}`, 400, 190);

    if (deadlineFormatted) {
      ctx.fillStyle = "#fef08a"; // Amber 200
      ctx.font = "600 20px sans-serif";
      ctx.fillText(`⏳ Hạn chót nộp: ${deadlineFormatted}`, 400, 230);
    }

    // QR container box
    ctx.fillStyle = "#ffffff";
    ctx.roundRect(175, 275, 450, 450, 30);
    ctx.fill();

    // Draw QR Code
    const qrImg = new Image();
    qrImg.crossOrigin = "anonymous";
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 200, 300, 400, 400);

      // Instructions container
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.roundRect(100, 765, 600, 220, 20);
      ctx.fill();

      // Guide steps
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("📌 HƯỚNG DẪN 3 BƯỚC ĐĂNG KÝ CA:", 135, 810);

      ctx.font = "20px sans-serif";
      ctx.fillStyle = "#f1f5f9";
      ctx.fillText("1. Dùng Camera điện thoại hoặc Zalo quét mã QR trên", 135, 855);
      ctx.fillText("2. Chọn tên nhân viên & nhập 4 số cuối SĐT để xác thực", 135, 895);
      ctx.fillText("3. Chạm chọn ca Rảnh / Ưu tiên và bấm Gửi đăng ký", 135, 935);

      // Footer
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Hệ thống Xếp lịch Thông minh D'lat Cafe", 400, 1040);

      // Trigger download
      const link = document.createElement("a");
      link.download = `Poster-DangKyCa-Dlat-${weekStart}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    qrImg.src = qrDataUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden rounded-2xl border-emerald-100">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-800 to-teal-900 p-6 text-white text-center relative">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mb-3">
            <QrCode className="h-6 w-6 text-emerald-200" />
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            Mã QR Đăng Ký Lịch Tuần
          </DialogTitle>
          <DialogDescription className="text-emerald-100 text-xs mt-1">
            Gửi mã QR này vào nhóm Zalo nhân viên để các bạn chủ động đăng ký ca rảnh
          </DialogDescription>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-700/60 px-3 py-1 text-xs text-emerald-100 border border-emerald-500/30">
            <Calendar className="h-3.5 w-3.5 text-emerald-300" />
            <span>Tuần: {weekStart}</span>
          </div>
        </div>

        {/* QR Body */}
        <div className="p-6 flex flex-col items-center">
          <div className="rounded-2xl border-4 border-emerald-100 bg-white p-3 shadow-md">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Mã QR Đăng ký lịch tuần ${weekStart}`}
                className="h-60 w-60 rounded-xl object-contain"
              />
            ) : (
              <div className="flex h-60 w-60 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Smartphone className="h-4 w-4 text-emerald-600" />
            <span>Nhân viên quét mã bằng camera điện thoại hoặc Zalo</span>
          </div>

          {/* Link box */}
          <div className="mt-4 w-full space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Đường link đăng ký (Có thể gửi trực tiếp vào Zalo):
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={registrationUrl}
                className="h-9 font-mono text-xs text-slate-700 bg-slate-50 border-slate-200"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="h-9 shrink-0 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Sao chép</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 grid grid-cols-2 gap-3 w-full">
            <Button
              type="button"
              onClick={handleDownloadPoster}
              disabled={!qrDataUrl}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold gap-2 h-11"
            >
              <Download className="h-4 w-4" />
              <span>Tải Poster Zalo</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(registrationUrl, "_blank")}
              className="border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold gap-2 h-11"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Mở thử trang</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

