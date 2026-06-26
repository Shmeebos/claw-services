import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildOperatorBrief, requestSchema } from "@/lib/request-schema";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", noStoreHeaders["Cache-Control"]);

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

type StoredRequest = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  business_url: string | null;
  service: string;
  request: string;
  budget: string | null;
  timeline: string | null;
  brief: string;
  status: "new" | "scoping" | "in_progress" | "review" | "completed";
  source: "website";
  metadata: Record<string, unknown>;
};

async function saveLocal(record: StoredRequest) {
  const dataDir = path.join(process.cwd(), ".data");
  const filePath = path.join(dataDir, "claw-requests.json");
  await fs.mkdir(dataDir, { recursive: true });

  let existing: StoredRequest[] = [];
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    existing = [];
  }

  existing.unshift(record);
  await fs.writeFile(filePath, JSON.stringify(existing.slice(0, 250), null, 2));
  return { mode: "local-json" as const, id: record.id };
}

async function saveSupabase(record: StoredRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return saveLocal(record);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("claw_requests")
    .insert({
      name: record.name,
      email: record.email,
      business_url: record.business_url,
      service: record.service,
      request: record.request,
      budget: record.budget,
      timeline: record.timeline,
      brief: record.brief,
      status: record.status,
      source: record.source,
      metadata: record.metadata,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Supabase request insert failed", {
      message: error.message,
      code: error.code,
    });
    return saveLocal(record);
  }

  return { mode: "supabase" as const, id: String(data.id) };
}

async function notifyTeam(record: StoredRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CLAW_REQUEST_TO_EMAIL;
  const from = process.env.CLAW_REQUEST_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    return { sent: false, reason: "resend-not-configured" as const };
  }

  const resend = new Resend(apiKey);
  const subject = `New Claw request: ${record.service} — ${record.name}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h1 style="margin:0 0 12px;font-size:24px;">New Claw Services request</h1>
      <p><strong>Name/business:</strong> ${escapeHtml(record.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(record.email)}</p>
      <p><strong>Service:</strong> ${escapeHtml(record.service)}</p>
      <p><strong>Business URL:</strong> ${escapeHtml(record.business_url || "Not provided")}</p>
      <p><strong>Budget:</strong> ${escapeHtml(record.budget || "Not provided")}</p>
      <p><strong>Timeline:</strong> ${escapeHtml(record.timeline || "Not provided")}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
      <h2 style="font-size:18px;">Operator brief</h2>
      <p>${escapeHtml(record.brief)}</p>
      <h2 style="font-size:18px;">Raw request</h2>
      <p>${escapeHtml(record.request)}</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      replyTo: record.email,
    });

    if (result.error) {
      console.error("Resend notification failed", result.error);
      return { sent: false, reason: "resend-error" as const };
    }

    return { sent: true, id: result.data?.id ?? null };
  } catch (error) {
    console.error("Resend notification exception", error);
    return { sent: false, reason: "resend-exception" as const };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson(
      { ok: false, error: "validation_error", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  if (parsed.data.honeypot) {
    return noStoreJson({ ok: true, ignored: true });
  }

  const brief = buildOperatorBrief(parsed.data);
  const record: StoredRequest = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    name: parsed.data.name,
    email: parsed.data.email,
    business_url: parsed.data.businessUrl || null,
    service: parsed.data.service,
    request: parsed.data.request,
    budget: parsed.data.budget || null,
    timeline: parsed.data.timeline || null,
    brief,
    status: "new",
    source: "website",
    metadata: {
      userAgent: request.headers.get("user-agent") ?? null,
      referer: request.headers.get("referer") ?? null,
    },
  };

  const storage = await saveSupabase(record);
  const email = await notifyTeam({ ...record, id: storage.id });

  return noStoreJson({
    ok: true,
    requestId: storage.id,
    storage,
    email,
    brief,
  });
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.CLAW_REQUEST_TO_EMAIL &&
      process.env.CLAW_REQUEST_FROM_EMAIL,
  );

  return noStoreJson({
    ok: true,
    storage: url && serviceRoleKey ? "supabase" : "local-json-fallback",
    resendConfigured,
    requiredEnv: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "RESEND_API_KEY",
      "CLAW_REQUEST_TO_EMAIL",
      "CLAW_REQUEST_FROM_EMAIL",
    ],
  });
}
