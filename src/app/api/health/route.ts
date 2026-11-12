import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Production Health Check Endpoint
 * Used by Docker healthcheck, Kubernetes liveness/readiness probes, and uptime monitors.
 */
export async function GET() {
  const startTime = Date.now();
  let dbStatus = "HEALTHY";
  let dbLatencyMs = 0;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (error) {
    dbStatus = "UNHEALTHY";
    return NextResponse.json(
      {
        status: "DOWN",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Database unreachable",
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          status: dbStatus,
        },
      },
      { status: 503 },
    );
  }

  const memory = process.memoryUsage();

  return NextResponse.json(
    {
      status: "UP",
      service: "dlat-cafe-workforce",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      responseTimeMs: Date.now() - startTime,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      system: {
        memoryRssMb: Math.round(memory.rss / (1024 * 1024)),
        memoryHeapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        nodeVersion: process.version,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

