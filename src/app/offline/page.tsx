"use client";

import { WifiOff, RefreshCw, LogIn } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12 pt-safe pb-safe">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <WifiOff className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Bạn đang ngoại tuyến (Offline)
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Thiết bị hiện không có kết nối mạng. Các tài nguyên giao diện tĩnh đã được lưu bộ nhớ đệm, nhưng tính năng{" "}
            <strong>Chấm công QR</strong> và <strong>Gửi đơn / Bàn giao ca</strong> yêu cầu kết nối mạng trực tiếp với máy chủ.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span>Thử kết nối lại</span>
          </button>

          <a
            href="/login"
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogIn className="h-4 w-4 shrink-0" />
            <span>Về trang đăng nhập</span>
          </a>
        </div>
      </div>
    </main>
  );
}
