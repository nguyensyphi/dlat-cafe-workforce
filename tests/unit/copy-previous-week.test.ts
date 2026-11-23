import { describe, expect, it } from "vitest";
import { addDaysToDateString } from "@/lib/shift-time";

describe("Copy Previous Week Logic & Constraints", () => {
  it("calculates exactly 7 days prior for previous week Monday", () => {
    const targetMonday = "2026-11-16";
    const prevMonday = addDaysToDateString(targetMonday, -7);
    expect(prevMonday).toBe("2026-11-09");
  });

  it("advances previous week dates by exactly 7 days to match target week", () => {
    const prevWorkDates = [
      "2026-11-09", // T2
      "2026-11-10", // T3
      "2026-11-11", // T4
      "2026-11-12", // T5
      "2026-11-13", // T6
      "2026-11-14", // T7
      "2026-11-15", // CN
    ];

    const targetWorkDates = prevWorkDates.map((d) => addDaysToDateString(d, 7));
    expect(targetWorkDates).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });
});

