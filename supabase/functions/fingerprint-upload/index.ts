import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const out = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...H, "content-type": "application/json" } });

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return out({ error: "POST required" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!url || !anon || !serviceRole) return out({ error: "Server duplicate verification is not configured." }, 500);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return out({ error: "Sign in again." }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "fingerprint");
  const companyId = String(body?.companyId ?? "");
  const bucket = String(body?.bucket ?? "universal-intake");
  const storagePath = String(body?.storagePath ?? "");
  const fileName = String(body?.fileName ?? "");
  const clientHash = String(body?.clientHash ?? "").toLowerCase().trim();
  const expectedSize = Number(body?.expectedSize ?? 0);

  if (!companyId || !storagePath) return out({ error: "companyId and storagePath are required" }, 400);
  if (!["fingerprint", "cleanup"].includes(action)) return out({ error: "Unsupported verification action" }, 400);
  if (bucket !== "universal-intake") return out({ error: "Unsupported intake bucket" }, 400);
  if (!storagePath.startsWith(`${companyId}/intake/`)) return out({ error: "Storage path does not belong to this company's intake area" }, 403);

  const { data: membership } = await userClient.from("company_memberships")
    .select("company_id,is_owner")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return out({ error: "Company access denied." }, 403);

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: registered } = await admin.from("source_documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("storage_path", storagePath)
    .limit(1)
    .maybeSingle();
  if (registered) return out({ error: "This storage path is already registered and cannot be treated as a temporary upload." }, 409);

  const cleanupTemporary = async () => {
    const result = await admin.storage.from(bucket).remove([storagePath]);
    return !result.error;
  };

  if (action === "cleanup") {
    const cleanedUp = await cleanupTemporary();
    return out({ ok: cleanedUp, cleanedUp, error: cleanedUp ? null : "Temporary upload could not be removed." }, cleanedUp ? 200 : 500);
  }

  const { data: blob, error: downloadError } = await admin.storage.from(bucket).download(storagePath);
  if (downloadError || !blob) {
    const cleanedUp = await cleanupTemporary();
    return out({ error: downloadError?.message || "Could not verify the uploaded file.", cleanedUp }, 422);
  }
  if (expectedSize > 0 && blob.size !== expectedSize) {
    const cleanedUp = await cleanupTemporary();
    return out({ error: "Uploaded file size changed during transfer. Nothing should be imported from this copy.", expectedSize, actualSize: blob.size, cleanedUp }, 409);
  }

  const fileHash = await sha256Hex(blob);
  if (clientHash && clientHash !== fileHash) {
    const cleanedUp = await cleanupTemporary();
    return out({ error: "File integrity check failed. Nothing should be imported from this copy.", integrityMismatch: true, cleanedUp }, 409);
  }

  const { data: existing, error: existingError } = await admin.from("source_documents")
    .select("id,project_id,document_type,file_name,uploaded_at")
    .eq("company_id", companyId)
    .eq("file_hash", fileHash)
    .order("uploaded_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    const cleanedUp = await cleanupTemporary();
    return out({ error: existingError.message, cleanedUp }, 500);
  }

  let cleanedUp = false;
  if (existing) cleanedUp = await cleanupTemporary();

  return out({
    ok: true,
    duplicate: Boolean(existing),
    fileHash,
    serverVerified: true,
    cleanedUp,
    fileName,
    size: blob.size,
    existing: existing || null
  });
});
