"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { KioskTokenDto } from "@/modules/attendance/attendance.types";

const REFRESH_SECONDS = 40;

export function KioskClient({ initialToken }: { initialToken: KioskTokenDto }) {
  const [tokenData, setTokenData] = useState<KioskTokenDto>(initialToken);
  const [secondsRemaining, setSecondsRemaining] = useState(REFRESH_SECONDS);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

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

  // Fetch new token
  const fetchNewToken = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/attendance/kiosk/token", {
        method: "POST",
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
  }, []);

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

  const progressPercent = (secondsRemaining / REFRESH_SECONDS) * 100;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Top back bar */}
      <div className="mb-6 flex w-full max-w-xl items-center justify-between">
        <Link href="/attendance">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Quay lại Quản lý</span>
          </Button>
        </Link>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium shadow-sm">
          <Clock className="h-4 w-4 text-emerald-600" />
          <span>{currentTime || "—:—:—"}</span>
          <span className="text-xs text-muted-foreground">(GMT+7)</span>
        </div>
      </div>

      {/* Main Kiosk Card */}
      <Card className="w-full max-w-xl overflow-hidden border-2 border-emerald-600/20 shadow-xl">
        <div className="bg-emerald-600 p-6 text-center text-white">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
            <QrCode className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Kiosk Chấm công D&apos;lat Cafe</h1>
          <p className="mt-1 text-sm text-emerald-100">
            Mở máy ảnh điện thoại hoặc chức năng chấm công trong ứng dụng để quét mã QR
          </p>
        </div>

        <CardContent className="flex flex-col items-center p-8">
          {/* QR Code Container */}
          <div className="relative flex aspect-square w-64 items-center justify-center rounded-2xl border-4 border-emerald-500/30 bg-white p-3 shadow-inner sm:w-72">
            {tokenData.qrDataUrl ? (
              <Image
                src={tokenData.qrDataUrl}
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

          {/* Progress countdown bar */}
          <div className="mt-6 w-full max-w-xs space-y-2">
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

          {/* Action buttons */}
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchNewToken}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              <span>Làm mới mã ngay</span>
            </Button>
          </div>

          {/* Security Notice */}
          <div className="mt-8 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-foreground">Bảo mật Chống gian lận</p>
              <p className="mt-0.5 leading-relaxed">
                Mã QR sử dụng token ngẫu nhiên bảo mật cao được băm một chiều SHA-256 trên
                Server, tự động thu hồi sau 40s và chống quét lại (anti-replay). Mọi thao tác
                đều ghi nhận thời gian máy chủ thực tế.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
