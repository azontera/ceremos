import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDashboard } from "@/lib/queries";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getDashboard(s));
}
