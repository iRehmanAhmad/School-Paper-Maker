import { z } from "zod";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url({ message: "Invalid Supabase URL" }).optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, "Supabase anon key is required").optional(),
  VITE_BASE_PATH: z.string().default("/"),
});

type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    const parsed = envSchema.parse({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      VITE_BASE_PATH: import.meta.env.VITE_BASE_PATH,
    });
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn("Environment validation warnings:", error.issues);
    }
    return {
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: undefined,
      VITE_BASE_PATH: "/",
    };
  }
}

export const env = validateEnv();

export const isSupabaseConfigured = Boolean(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
);
