import { Suspense } from "react";
import QuickScheduleRegistrationClient from "@/components/public/quick-schedule-registration-client";

interface PageProps {
  searchParams: Promise<{
    week?: string;
  }>;
}

export const metadata = {
  title: "Đăng ký ca làm việc | D'lat Cafe",
  description: "Trang đăng ký nguyện vọng ca làm việc hàng tuần cho nhân viên D'lat Cafe qua mã QR",
};

export default async function RegisterSchedulePage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const initialWeek = resolvedParams.week || "";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
              <p className="text-sm font-medium text-slate-500">Đang tải biểu mẫu đăng ký ca...</p>
            </div>
          </div>
        }
      >
        <QuickScheduleRegistrationClient initialWeek={initialWeek} />
      </Suspense>
    </main>
  );
}

