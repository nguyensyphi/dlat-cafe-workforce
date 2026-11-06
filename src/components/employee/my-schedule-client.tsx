"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Coffee, Users } from "lucide-react";
import { formatDateVN } from "@/lib/date";
import { addDaysToDateString } from "@/lib/shift-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyWeekScheduleDto } from "@/modules/schedules/schedule.types";
import { SCHEDULE_STATUS_LABELS } from "@/modules/schedules/schedule.service";

export function MyScheduleClient({
  initialSchedule,
  weekStart,
}: {
  initialSchedule: MyWeekScheduleDto;
  weekStart: string;
}) {
  const router = useRouter();
  const [currentWeek, setCurrentWeek] = useState(weekStart);

  function changeWeek(delta: number) {
    const next = addDaysToDateString(currentWeek, delta * 7);
    setCurrentWeek(next);
    router.push(`/employee/schedule?week=${next}`);
  }

  const hours = Math.round((initialSchedule.totalMinutes / 60) * 10) / 10;

  return (
    <div className="space-y-5">
      {/* Week Selector */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Lịch làm việc của tôi
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Xem lịch ca chính thức và danh sách đồng nghiệp cùng ca
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-border bg-white p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => changeWeek(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs font-medium text-slate-700">
            {formatDateVN(currentWeek)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => changeWeek(1)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week Status Banner */}
      {initialSchedule.scheduleStatus ? (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <Badge variant="default">
              {SCHEDULE_STATUS_LABELS[initialSchedule.scheduleStatus]}
            </Badge>
            <span>Lịch chính thức đã được ban hành</span>
          </div>
          <span className="font-semibold">
            Tổng {hours} giờ công ({initialSchedule.shifts.length} ca)
          </span>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
          Lịch làm việc tuần này đang trong giai đoạn sắp xếp và chưa được công bố
          chính thức. Vui lòng quay lại sau!
        </div>
      )}

      {/* Shifts List */}
      <div className="space-y-3">
        {initialSchedule.shifts.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Coffee className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              Bạn không có ca làm việc nào trong tuần này
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Hãy kiểm tra lại tuần trước/sau hoặc liên hệ quản lý nếu có thắc mắc
            </p>
          </Card>
        ) : (
          initialSchedule.shifts.map((shift) => (
            <Card key={shift.assignmentId} className="overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-border py-2.5 px-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    {formatDateVN(shift.workDate)}
                  </span>
                  <Badge variant="outline">{shift.positionName}</Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-slate-900">
                      {shift.shiftName}
                    </CardTitle>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                      <Clock className="h-3.5 w-3.5 text-emerald-600" />
                      <span>
                        {shift.startTime} – {shift.endTime} (nghỉ {shift.breakMinutes}p)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-700">
                      {Math.round((shift.netMinutes / 60) * 10) / 10}h
                    </span>
                  </div>
                </div>

                {/* Coworkers */}
                {shift.coworkers.length > 0 && (
                  <div className="pt-2 border-t border-border/60">
                    <p className="text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>Cùng ca làm việc:</span>
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {shift.coworkers.map((name, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[11px]"
                        >
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
