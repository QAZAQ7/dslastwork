import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  // Supports both manual Vercel variables and the current Vercel Marketplace
  // Supabase integration variable names.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
