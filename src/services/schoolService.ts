import { canUseSupabase, supabase } from "@/services/supabase";
import type { School, UserProfile } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal, requireSupabaseAuth } from "./baseService";

function isDuplicateError(error: unknown) {
    const text = `${(error as any)?.message || ""}`.toLowerCase();
    return text.includes("duplicate") || text.includes("unique");
}

export async function loginWithEmail(_email: string): Promise<UserProfile> {
    throw new Error("Password is required. Use loginWithPassword(email, password).");
}

function normalizePassword(value: string) {
    return value.trim();
}

async function sha256Hex(value: string) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
}

async function passwordHash(_email: string, password: string) {
    return sha256Hex(password);
}

async function migratePlainPasswordIfNeeded(user: UserProfile, plainPassword: string) {
    const rows = readLocal<UserProfile>(DB.users);
    const index = rows.findIndex((row) => row.id === user.id);
    if (index < 0) {
        return user;
    }
    const hashed = await passwordHash(user.email, plainPassword);
    const nextRow: UserProfile = {
        ...rows[index],
        password_hash: hashed,
    };
    delete (nextRow as any).password;
    rows[index] = nextRow;
    writeLocal(DB.users, rows);
    return nextRow;
}

export async function loginWithPassword(email: string, password: string): Promise<UserProfile> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = normalizePassword(password);
    if (!normalizedPassword) {
        throw new Error("Password is required");
    }
    ensureSeed();
    const localUsers = readLocal<UserProfile>(DB.users);
    const localMatch = localUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

    // Local first for demo/offline mode.
    if (!requireSupabaseAuth && localMatch) {
        if (localMatch.password_hash) {
            const incomingHash = await passwordHash(normalizedEmail, normalizedPassword);
            if (localMatch.password_hash !== incomingHash) {
                throw new Error("Invalid email or password");
            }
            return localMatch;
        }
        if (!localMatch.password) {
            throw new Error("Password not set for this account. Ask admin to reset it.");
        }
        if (localMatch.password !== normalizedPassword) {
            throw new Error("Invalid email or password");
        }
        return migratePlainPasswordIfNeeded(localMatch, normalizedPassword);
    }

    if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: normalizedPassword,
        });
        if (error) {
            throw error;
        }
        const authUser = data.user;
        if (!authUser) {
            throw new Error("Login failed");
        }

        const { data: profileRow, error: profileError } = await supabase
            .from("users")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }
        if (profileRow) {
            return profileRow as UserProfile;
        }

        const fallback = localUsers[0];
        if (!fallback) {
            throw new Error("No profile found for this user");
        }
        return fallback;
    }

    throw new Error("Invalid email or password");
}

export async function requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        throw new Error("Email is required");
    }
    if (supabase) {
        const redirectTo = typeof window !== "undefined" ? `${window.location.origin}` : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
        if (error) {
            throw error;
        }
        return;
    }
    throw new Error("Password reset email requires Supabase auth. Ask admin to reset manually.");
}

export async function getSchools() {
    ensureSeed();
    const localSchools = readLocal<School>(DB.schools);
    if (canUseSupabase()) {
        try {
            const { data, error } = await supabase.from("schools").select("*").order("name");
            if (error) {
                throw error;
            }
            const cloud = (data ?? []) as School[];
            if (!localSchools.length) {
                return cloud;
            }
            const merged = new Map<string, School>();
            cloud.forEach((row) => merged.set(row.id, row));
            localSchools.forEach((row) => {
                if (!merged.has(row.id)) {
                    merged.set(row.id, row);
                }
            });
            return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
        } catch {
            return localSchools;
        }
    }
    return localSchools;
}

export async function getUsers(schoolId?: string) {
    ensureSeed();
    const localUsers = readLocal<UserProfile>(DB.users);
    if (canUseSupabase()) {
        try {
            let query = supabase.from("users").select("*").order("created_at", { ascending: false });
            if (schoolId) {
                query = query.eq("school_id", schoolId);
            }
            const { data, error } = await query;
            if (error) {
                throw error;
            }
            const cloud = (data ?? []) as UserProfile[];
            const merged = new Map<string, UserProfile>();
            cloud.forEach((row) => merged.set(row.id, row));
            localUsers.forEach((row) => {
                if (!schoolId || row.school_id === schoolId) {
                    if (!merged.has(row.id)) {
                        merged.set(row.id, row);
                    }
                }
            });
            return Array.from(merged.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
        } catch {
            // fall through
        }
    }
    return localUsers
        .filter((row) => (!schoolId ? true : row.school_id === schoolId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addSchool(name: string) {
    const nextName = name.trim();
    if (!nextName) {
        throw new Error("School name is required");
    }
    ensureSeed();
    const existing = readLocal<School>(DB.schools).some((row) => row.name.toLowerCase() === nextName.toLowerCase());
    if (existing) {
        throw new Error("School already exists");
    }
    if (canUseSupabase()) {
        try {
            const { data, error } = await supabase.from("schools").insert({ name: nextName }).select("*").single();
            if (error) {
                throw error;
            }
            const created = data as School;
            writeLocal(DB.schools, [created, ...readLocal<School>(DB.schools)]);
            return created;
        } catch (error) {
            if (!isDuplicateError(error)) {
                // Continue with local fallback for demo mode / restricted projects.
            }
        }
    }
    const created: School = {
        id: crypto.randomUUID(),
        name: nextName,
        created_at: new Date().toISOString(),
        logo_url: null,
    };
    writeLocal(DB.schools, [created, ...readLocal<School>(DB.schools)]);
    return created;
}

export async function addUserProfile(input: Omit<UserProfile, "id" | "created_at">) {
    if (requireSupabaseAuth) {
        throw new Error("Local user management is disabled in production. Create users via Supabase admin.");
    }
    const email = input.email.trim().toLowerCase();
    const fullName = input.full_name.trim();
    const password = normalizePassword(input.password || "");
    if (!email || !fullName) {
        throw new Error("Full name and email are required");
    }
    if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
    }
    ensureSeed();
    const localUsers = readLocal<UserProfile>(DB.users);
    if (localUsers.some((row) => row.email.toLowerCase() === email)) {
        throw new Error("Email already exists");
    }
    const hashedPassword = await passwordHash(email, password);
    // We intentionally keep this local-first because creating auth.users in Supabase
    // requires service role admin APIs (not available from client-side).
    const created: UserProfile = {
        id: crypto.randomUUID(),
        email,
        full_name: fullName,
        role: input.role,
        school_id: input.school_id,
        password_hash: hashedPassword,
        is_premium: input.is_premium,
        created_at: new Date().toISOString(),
    };
    writeLocal(DB.users, [created, ...localUsers]);
    return created;
}

export async function updateUserSchool(userId: string, schoolId: string | null) {
    if (!userId) {
        throw new Error("User is required");
    }
    if (requireSupabaseAuth && !supabase) {
        throw new Error("Supabase is not configured.");
    }

    if (supabase) {
        const { data, error } = await supabase
            .from("users")
            .update({ school_id: schoolId })
            .eq("id", userId)
            .select("*")
            .single();
        if (error) {
            throw error;
        }
        return data as UserProfile;
    }

    ensureSeed();
    const rows = readLocal<UserProfile>(DB.users);
    const index = rows.findIndex((row) => row.id === userId);
    if (index < 0) {
        throw new Error("User not found");
    }
    rows[index] = { ...rows[index], school_id: schoolId };
    writeLocal(DB.users, rows);
    return rows[index];
}

export async function resetLocalUserPassword(userId: string, nextPassword: string) {
    if (requireSupabaseAuth) {
        throw new Error("Local password reset is disabled in production.");
    }
    const password = normalizePassword(nextPassword);
    if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
    }
    ensureSeed();
    const rows = readLocal<UserProfile>(DB.users);
    const index = rows.findIndex((row) => row.id === userId);
    if (index < 0) {
        throw new Error("User not found");
    }
    rows[index] = {
        ...rows[index],
        password_hash: await passwordHash(rows[index].email, password),
    };
    delete (rows[index] as any).password;
    writeLocal(DB.users, rows);
    return rows[index];
}

export async function changeMyPassword(input: {
    userId: string;
    currentPassword: string;
    nextPassword: string;
}) {
    if (requireSupabaseAuth) {
        if (!supabase) {
            throw new Error("Supabase is not configured.");
        }
        const { error } = await supabase.auth.updateUser({ password: input.nextPassword });
        if (error) {
            throw error;
        }
        return {
            id: input.userId,
            email: "",
            full_name: "",
            role: "teacher",
            school_id: "",
            created_at: new Date().toISOString(),
        } as UserProfile;
    }
    const currentPassword = normalizePassword(input.currentPassword);
    const nextPassword = normalizePassword(input.nextPassword);
    if (nextPassword.length < 6) {
        throw new Error("New password must be at least 6 characters");
    }
    ensureSeed();
    const rows = readLocal<UserProfile>(DB.users);
    const index = rows.findIndex((row) => row.id === input.userId);
    if (index < 0) {
        throw new Error("User not found");
    }
    const user = rows[index];
    const currentHash = user.password_hash || (user.password ? await passwordHash(user.email, user.password) : "");
    const incomingCurrentHash = await passwordHash(user.email, currentPassword);
    if (!currentHash || incomingCurrentHash !== currentHash) {
        throw new Error("Current password is incorrect");
    }
    rows[index] = {
        ...user,
        password_hash: await passwordHash(user.email, nextPassword),
    };
    delete (rows[index] as any).password;
    writeLocal(DB.users, rows);

    if (canUseSupabase()) {
        try {
            const { data } = await supabase.auth.getUser();
            if (data.user && data.user.id === user.id) {
                const { error } = await supabase.auth.updateUser({ password: nextPassword });
                if (error) {
                    // Keep local password updated even if cloud user update is unavailable.
                    console.warn("Supabase password update failed:", error.message);
                }
            }
        } catch {
            // Local change already completed.
        }
    }

    return rows[index];
}

