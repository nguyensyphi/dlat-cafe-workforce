"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Globe,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { KioskTokenDto } from "@/modules/attendance/attendance.types";

const REFRESH_SECONDS = 40;

export function KioskClient({ initialToken }: { initialToken: KioskTokenDto }) {
  const [tokenData, setTokenData] = useState<KioskTokenDto>(initialToken);
  const [secondsRemaining, setSecondsRemaining] = useState(REFRESH_SECONDS);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [qrMode, setQrMode] = useState<"URL" | "RAW">("URL");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [localQrUrl, setLocalQrUrl] = useState<string>(initialToken.qrDataUrl);

  // Digital clock update
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    }
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute best host for LAN mobile access
  const activeHost = useMemo(() => {
    if (typeof window === "undefined") return "http://192.168.2.182:3005";
    const origin = window.location.origin;
    // If user is accessing from localhost, prefer the server detected LAN IP so phones on Wi-Fi can reach it
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      const port = window.location.port || "3005";
      const ip = tokenData.lanIp || "192.168.2.182";
      return `http://${ip}:${port}`;
    }
    return origin;
  }, [tokenData.lanIp]);

  const activeAttendanceUrl = useMemo(() => {
    return `${activeHost}/employee/attendance?token=${tokenData.token}`;
  }, [activeHost, tokenData.token]);

  // Generate dynamic QR code according to selected mode
  useEffect(() => {
    const payload = qrMode === "URL" ? activeAttendanceUrl : tokenData.token;
    QRCode.toDataURL(payload, {
      margin: 2,
      scale: 8,
      errorCorrectionLevel: "M",
    })
      .then((url) => setLocalQrUrl(url))
      .catch((err) => {
        console.error("Failed to generate QR data url:", err);
      });
  }, [qrMode, activeAttendanceUrl, tokenData.token]);

  // Fetch new token
  const fetchNewToken = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/attendance/kiosk/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: activeHost }),
      });
      if (res.ok) {
        const json = await res.json();
        setTokenData(json.data);
        setSecondsRemaining(REFRESH_SECONDS);
      }
    } catch (err) {
      console.error("Failed to fetch kiosk token:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeHost]);

  // Countdown timer for token expiration
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchNewToken();
          return REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchNewToken]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeAttendanceUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(tokenData.token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const progressPercent = (secondsRemaining / REFRESH_SECONDS) * 100;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-3 sm:p-6 lg:p-8 min-w-0">
      {/* Top back bar */}
      <div className="mb-4 sm:mb-6 flex flex-wrap w-full max-w-xl items-center justify-between gap-2">
        <Link href="/attendance">
          <Button variant="ghost" size="sm" className="gap-2 min-h-[44px]">
            <ArrowLeft className="h-4 w-4" />
            <span>Quay lại Quản lý</span>
          </Button>
        </Link>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm">
          <Clock className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{currentTime || "—:—:—"}</span>
          <span className="text-xs text-muted-foreground">(GMT+7)</span>
        </div>
      </div>

      {/* Main Kiosk Card */}
      <Card className="w-full max-w-xl overflow-hidden border-2 border-emerald-600/20 shadow-xl">
        <div className="bg-emerald-600 p-4 sm:p-6 text-center text-white">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
            <QrCode className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Kiosk Chấm công D&apos;lat Cafe</h1>
          <p className="mt-1 text-xs sm:text-sm text-emerald-100">
            Quét mã QR bằng Camera điện thoại, Zalo hoặc tính năng Chấm công trong ứng dụng
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs bg-emerald-700/60 py-1.5 px-3 rounded-2xl w-fit max-w-full mx-auto border border-emerald-500/30">
            <Wifi className="h-3.5 w-3.5 text-emerald-200 shrink-0" />
            <span>Mạng nội bộ Wi-Fi:</span>
            <code className="font-mono font-bold text-white bg-emerald-800/80 px-1.5 py-0.5 rounded break-all">
              {activeHost}
            </code>
          </div>
        </div>

        <CardContent className="flex flex-col items-center p-4 sm:p-8">
          {/* QR Mode Selector */}
          <div className="mb-5 flex flex-col sm:flex-row w-full sm:w-auto rounded-lg border border-border bg-muted/60 p-1 text-xs gap-1">
            <button
              type="button"
              onClick={() => setQrMode("URL")}
              className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                qrMode === "URL"
                  ? "bg-white text-emerald-700 shadow-sm dark:bg-card"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
              <span>Camera Điện thoại / Zalo (Khuyên dùng)</span>
            </button>
            <button
              type="button"
              onClick={() => setQrMode("RAW")}
              className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                qrMode === "RAW"
                  ? "bg-white text-emerald-700 shadow-sm dark:bg-card"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <QrCode className="h-3.5 w-3.5 shrink-0" />
              <span>Mã token thuần (Kiosk 2D)</span>
            </button>
          </div>

          {/* QR Code Container */}
          <div className="relative flex aspect-square w-56 max-w-full items-center justify-center rounded-2xl border-4 border-emerald-500/30 bg-white p-3 shadow-inner sm:w-72">
            {localQrUrl ? (
              <Image
                src={localQrUrl}
                alt="QR Chấm công"
                width={280}
                height={280}
                unoptimized
                className="h-full w-full object-contain"
                priority
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin" />
                <span className="text-xs">Đang tải mã...</span>
              </div>
            )}
          </div>

          {/* Mode Explanatory Pill */}
          <div className="mt-3 text-center max-w-full">
            {qrMode === "URL" ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[11px] py-0.5 whitespace-normal text-center">
                ⚡ Quét mở ngay trang Chấm công trên điện thoại
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[11px] py-0.5 whitespace-normal text-center">
                ⚙️ Trả về mã chuỗi thuần 43 ký tự
              </Badge>
            )}
          </div>

          {/* Progress countdown bar */}
          <div className="mt-5 w-full max-w-xs space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Mã tự động làm mới sau:</span>
              <span className="font-semibold text-emerald-600">{secondsRemaining}s</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-600 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Quick copy tools */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 text-xs min-h-[44px]"
            >
              {copiedLink ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span>{copiedLink ? "Đã chép link!" : "Sao chép link chấm công"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToken}
              className="gap-1.5 text-xs min-h-[44px]"
            >
              {copiedToken ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span>{copiedToken ? "Đã chép mã!" : "Sao chép token"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchNewToken}
              disabled={isLoading}
              className="gap-1.5 text-xs min-h-[44px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Làm mới</span>
            </Button>
          </div>

          {/* Security Notice */}
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground text-left w-full">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-foreground">Bảo mật Chống gian lận v2.0</p>
              <p className="mt-0.5 leading-relaxed">
                Mã QR sử dụng token ngẫu nhiên bảo mật cao (CSPRNG 32 bytes) được băm một chiều SHA-256 trên
                Server, tự động thu hồi sau 40s và chống quét lại (anti-replay). Mọi thao tác
                đều ghi nhận thời gian máy chủ thực tế (UTC).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
