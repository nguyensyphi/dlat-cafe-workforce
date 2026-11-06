import type { z } from "zod";
import { AppValidationError } from "@/lib/permissions";

/** Parses input with a Zod schema and converts failures into AppValidationError. */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  fallbackMessage = "Dữ liệu đầu vào không hợp lệ",
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppValidationError(parsed.error.issues[0]?.message ?? fallbackMessage);
  }
  return parsed.data as z.output<S>;
}

