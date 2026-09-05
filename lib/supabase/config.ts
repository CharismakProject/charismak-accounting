export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

/**
 * Accounting must never silently fall back to another Supabase project.
 * The repo has gone through more than one backend generation, so an explicit
 * deployment environment is safer than a hard-coded publishable fallback.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Charismak Accounting Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for this environment.",
    );
  }

  return { url, publishableKey };
}
