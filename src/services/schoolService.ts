import { hasSupabase, supabase } from "@/services/supabase";
import type { School, UserProfile } from "@/types/domain";
import { DB, ensureSeed, readLocal } from "./baseService";

export async function loginWithEmail(email: string): Promise<UserProfile> {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) {
            throw error;
        }
        if (!data.user) {
            throw new Error("Magic link sent. Complete login and refresh.");
        }
    }
    ensureSeed();
    const user = readLocal<UserProfile>(DB.users).find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? readLocal<UserProfile>(DB.users)[0];
    if (!user) {
        throw new Error("No user found");
    }
    return user;
}

export async function getSchools() {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("schools").select("*").order("name");
        if (error) {
            throw error;
        }
        return (data ?? []) as School[];
    }
    ensureSeed();
    return readLocal<School>(DB.schools);
}
