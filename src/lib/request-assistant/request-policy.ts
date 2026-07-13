export const MAX_ASSISTANT_BODY_BYTES = 32 * 1024;

export type RequestPolicyFailure = {
  status: 403 | 415;
  error: "cross_site_request" | "unsupported_media_type";
  message: string;
};

function configuredOrigins() {
  const raw = [
    process.env.NEXT_PUBLIC_SITE_URL,
    ...(process.env.REQUEST_ASSISTANT_ALLOWED_ORIGINS?.split(",") ?? []),
  ];
  const origins = new Set<string>();

  for (const value of raw) {
    if (!value?.trim()) continue;
    try {
      origins.add(new URL(value.trim()).origin);
    } catch {
      // Invalid deployment configuration is ignored; the request URL origin remains allowed.
    }
  }
  return origins;
}

export function validateRequestPolicy(request: Request): RequestPolicyFailure | null {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    return {
      status: 415,
      error: "unsupported_media_type",
      message: "This endpoint accepts application/json only.",
    };
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return {
      status: 403,
      error: "cross_site_request",
      message: "Cross-site requests are not allowed.",
    };
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    if (fetchSite === "same-site") {
      return {
        status: 403,
        error: "cross_site_request",
        message: "Same-site requests must provide an approved Origin header.",
      };
    }
    return null;
  }

  let requestOrigin: string;
  let suppliedOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
    suppliedOrigin = new URL(origin).origin;
  } catch {
    return {
      status: 403,
      error: "cross_site_request",
      message: "Request origin could not be verified.",
    };
  }

  const allowed = configuredOrigins();
  allowed.add(requestOrigin);
  if (!allowed.has(suppliedOrigin)) {
    return {
      status: 403,
      error: "cross_site_request",
      message: "Request origin is not approved.",
    };
  }

  return null;
}

export async function readRequestBodyWithLimit(
  request: Request,
  maxBytes = MAX_ASSISTANT_BODY_BYTES,
): Promise<{ ok: true; text: string } | { ok: false; error: "payload_too_large" }> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: "payload_too_large" };
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, error: "payload_too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(bytes) };
}
