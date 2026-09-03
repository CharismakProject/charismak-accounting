import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { parseBoqWorkbookSheets } from "../_shared/boq-workbook-parser.ts";
import { decorateBoqWithReview } from "../_shared/boq-review.ts";

const H = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const out = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...H, "content-type":"application/json" } });
const supported = new Set(["xlsx", "xls", "csv"]);
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_SHEETS = 24;
const MAX_ROWS_PER_SHEET = 8000;
const MAX_COLUMNS = 40;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return out({ error: "POST required" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return out({ error: "Sign in again." }, 401);

  const body = await req.json().catch(() => ({}));
  const bucket = String(body?.bucket ?? "universal-intake");
  const storagePath = String(body?.storagePath ?? "");
  const fileName = String(body?.fileName ?? storagePath.split("/").pop() ?? "BOQ.xlsx");
  if (!storagePath) return out({ error: "storagePath is required" }, 400);

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!supported.has(ext)) return out({ error: "BOQ preview accepts XLSX, XLS or CSV files." }, 400);

  try {
    const { data: blob, error } = await sb.storage.from(bucket).download(storagePath);
    if (error || !blob) throw new Error(error?.message || "Could not read the uploaded BOQ.");
    if (blob.size > MAX_BYTES) return out({ error: "BOQ workbook is over the 12 MB preview limit." }, 413);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: "array", raw: false, cellDates: false, dense: false });
    const sheets = workbook.SheetNames.slice(0, MAX_SHEETS).map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
      }) as unknown[][];
      return {
        name: sheetName,
        rows: rows.slice(0, MAX_ROWS_PER_SHEET).map((row) => row.slice(0, MAX_COLUMNS)),
      };
    });

    const parsed = parseBoqWorkbookSheets(sheets, fileName);
    const reviewed = decorateBoqWithReview(parsed.boq);
    const result = { ...parsed, boq: reviewed.boq, reviewSummary: reviewed.reviewSummary };
    if (!parsed.itemCount) {
      const supportOnly = parsed.supportSheets.length > 0 && parsed.recognizedSheets.length === 0;
      return out({
        ok: false,
        error: supportOnly
          ? `No primary BOQ sheet was found. ${parsed.supportSheets.length} support/summary sheet${parsed.supportSheets.length === 1 ? " was" : "s were"} identified and deliberately excluded to prevent double counting. Upload the detailed BOQ/bill workbook.`
          : "No BOQ item rows were confidently detected. Check the workbook headings or review the sheet structure.",
        ...result,
      });
    }

    return out({ ok: true, ...result });
  } catch (error) {
    return out({ error: error instanceof Error ? error.message : "Could not parse this BOQ workbook." }, 500);
  }
});
