import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithEmail } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";

export function LoginPage() {
  const [email, setEmail] = useState("teacher@demo.school");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setProfile = useAppStore((s) => s.setProfile);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const profile = await loginWithEmail(email);
      setProfile(profile);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-card p-6 shadow-soft">
        <h1 className="font-display text-3xl font-bold text-brand">Paper Generator</h1>
        <p className="mt-1 text-sm text-slate-600">Login with admin or teacher email</p>
        <label className="mt-5 block text-xs font-semibold text-slate-600">
          Email Address
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@school.com"
            required
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button className="mt-4 w-full rounded-lg bg-brand px-3 py-2 font-semibold text-white" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="mt-2 text-xs text-slate-500">Demo: admin@demo.school or teacher@demo.school</p>
      </form>
    </div>
  );
}
