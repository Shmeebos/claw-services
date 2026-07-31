import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseAdminResult =
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: "storage_not_configured" };

export function createSupabaseAdminClient(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseAdminResult {
  if (typeof window !== "undefined") {
    throw new Error("supabase_admin_client_is_server_only");
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { ok: false, error: "storage_not_configured" };
  }

  return {
    ok: true,
    client: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}
