import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anon ? createClient(url, anon) : null;

export const hasSupabase = Boolean(supabase);

let currentSession: Session | null = null;

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    currentSession = data?.session ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session ?? null;
  });
}

export function isSupabaseAuthenticated() {
  return Boolean(currentSession?.access_token);
}

export function canUseSupabase() {
  return Boolean(supabase) && isSupabaseAuthenticated();
}

