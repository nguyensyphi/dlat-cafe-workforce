export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogger {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
}

const SENSITIVE_KEY_PATTERN =
  /(token|secret|pass(word)?|api[_-]?key|authorization|cookie)/i;

export function redactString(input: string): string {
  return input
    .replace(/\/bot[^/\s]+/g, "/bot***REDACTED***")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, "$1***REDACTED***");
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    try {
      return value.map((item) => sanitizeValue(item, seen));
    } finally {
      seen.delete(value);
    }
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    try {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY_PATTERN.test(k)) {
          out[k] = v ? "***REDACTED***" : v;
        } else {
          out[k] = sanitizeValue(v, seen);
        }
      }
      return out;
    } finally {
      seen.delete(value);
    }
  }
  return String(value);
}

export function redactMeta(
  meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }
  return sanitizeValue(meta) as Record<string, unknown>;
}

function emit(
  level: LogLevel,
  event: string,
  meta?: Record<string, unknown>,
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(meta ? redactMeta(meta) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger: StructuredLogger = {
  info(event, meta) {
    emit("info", event, meta);
  },
  warn(event, meta) {
    emit("warn", event, meta);
  },
  error(event, meta) {
    emit("error", event, meta);
  },
};
