let cronIntervalStarted = false;

export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ENABLE_IN_PROCESS_CRON === "true" &&
    process.env.NODE_ENV !== "test" &&
    !cronIntervalStarted
  ) {
    cronIntervalStarted = true;
    const interval = setInterval(async () => {
      try {
        const [{ shiftReminderService }, { attendanceMonitorService }] =
          await Promise.all([
            import("./modules/notifications/shift-reminder.service"),
            import("./modules/attendance/attendance-monitor.service"),
          ]);
        await shiftReminderService.dispatchDueReminders().catch(() => {});
        await attendanceMonitorService
          .runAttendanceAnomalyMonitor()
          .catch(() => {});
      } catch {
        // Prevent background interval errors from crashing the server process
      }
    }, 60_000);

    if (typeof interval.unref === "function") {
      interval.unref();
    }
  }
}
