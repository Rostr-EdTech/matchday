import { NextResponse } from "next/server";

// Plain liveness check for an external uptime pinger to hit periodically so
// a free-tier host never spins the web service down. No auth, no DB call —
// this only needs to prove the Node process is awake, not that the database
// is reachable.
export async function GET() {
  return NextResponse.json({ ok: true });
}
