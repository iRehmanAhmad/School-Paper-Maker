import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithPassword, requestPasswordReset } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";

export function LoginPage() {
  const [email, setEmail] = useState("teacher@demo.school");
  const [password, setPassword] = useState("teacher123");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const setProfile = useAppStore((s) => s.setProfile);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const profile = await loginWithPassword(email, password);
      setProfile(profile);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword() {
    setError("");
    setNotice("");
    setResetting(true);
    try {
      await requestPasswordReset(email);
      setNotice("Password reset link sent. Check your email inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-card p-6 shadow-soft">
        <h1 className="font-display text-3xl font-bold text-brand">Paper Generator</h1>
        <p className="mt-1 text-sm text-slate-600">Login with email and password</p>
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
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
        </label>
        {notice ? <p className="mt-2 text-sm text-emerald-600">{notice}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button className="mt-4 w-full rounded-lg bg-brand px-3 py-2 font-semibold text-white" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => void onResetPassword()}
          disabled={resetting || loading}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetting ? "Sending..." : "Forgot Password (Send Reset Link)"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Demo: admin@demo.school / admin123 and teacher@demo.school / teacher123
        </p>
      </form>
    </div>
  );
}
