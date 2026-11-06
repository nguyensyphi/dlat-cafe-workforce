"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Download,
  TrendingUp,
} from "lucide-react";
import { formatVnd } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportsData {
  laborCostTrends: Array<{
    name: string;
    periodStart: string;
    regularPay: number;
    overtimePay: number;
    totalPay: number;
    scheduledHours: number;
    workedHours: number;
    paidHours: number;
  }>;
  positionDistribution: Array<{
    name: string;
    totalCost: number;
    hours: number;
    headcount: number;
  }>;
  attendanceStats: Array<{
    name: string;
    value: number;
    fill: string;
  }>;
  totalRecordsAnalyzed: number;
}

const POSITION_COLORS = ["#16a34a", "#0284c7", "#d97706", "#7c3aed", "#e11d48"];

export function ReportsDashboardClient({ data }: { data: ReportsData }) {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Báo cáo & Phân tích</h1>
          <p className="text-sm text-muted-foreground">
            Trực quan hóa chi phí nhân công, hiệu suất làm việc, tỷ lệ đi trễ và cơ cấu vị trí
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/reports/export/attendance" download="bang-cham-cong.csv">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              <span>Xuất Báo cáo Chấm công (CSV)</span>
            </Button>
          </a>
        </div>
      </div>

      {/* Row 1: Labor Cost Trends (Bar Chart) */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-semibold">
              Xu hướng Chi phí Lương theo Kỳ
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              So sánh lương cơ bản và lương tăng ca (Overtime) qua các kỳ gần nhất
            </p>
          </div>
          <TrendingUp className="h-5 w-5 text-emerald-600" />
        </CardHeader>
        <CardContent className="pt-4">
          {data.laborCostTrends.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu kỳ lương nào để lập biểu đồ. Hãy tạo và tính toán kỳ lương đầu tiên.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.laborCostTrends}
                  margin={{ top: 10, right: 10, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(val) => `${(val / 1_000_000).toFixed(1)}Tr`}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(val) => formatVnd(Number(val))}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="regularPay"
                    name="Lương cơ bản"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="overtimePay"
                    name="Lương tăng ca (OT)"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 2: Pie Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Position Cost Distribution */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Cơ cấu Chi phí theo Vị trí
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Phân bổ chi phí tiền lương giữa các bộ phận trong quán
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {data.positionDistribution.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu vị trí.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.positionDistribution}
                      dataKey="totalCost"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                      }
                      labelLine={false}
                    >
                      {data.positionDistribution.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={POSITION_COLORS[index % POSITION_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatVnd(Number(val))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance Statistics */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Tỷ lệ Tuân thủ Giờ làm (30 ngày)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Thống kê {data.totalRecordsAnalyzed} lượt chấm công gần nhất
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {data.totalRecordsAnalyzed === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu chấm công trong 30 ngày qua.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.attendanceStats}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {data.attendanceStats.map((entry, index) => (
                        <Cell key={`cell-att-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
