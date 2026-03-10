import React, { useState, useRef } from "react";
import { getAISettings, saveAISettings, type AIProvider } from "@/services/aiSettings";
import { getAppSettings, saveAppSettings } from "@/services/appSettings";
import { hasSupabase } from "@/services/supabase";
import { useAppStore } from "@/store/useAppStore";

export function SettingsPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const [ai, setAi] = useState(getAISettings());
  const [appSettings, setAppSettings] = useState(getAppSettings());

  const applyThemePreview = (theme: "light" | "dark" | "system") => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  };

  const updateTheme = (theme: "light" | "dark" | "system") => {
    setAppSettings((prev) => {
      const next = { ...prev, theme };
      saveAppSettings(next);
      applyThemePreview(theme);
      window.dispatchEvent(new CustomEvent("app-settings-updated"));
      return next;
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, key: 'schoolLogo' | 'secondaryLogo') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAppSettings(prev => ({ ...prev, [key]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  function saveAll() {
    saveAISettings(ai);
    saveAppSettings(appSettings);
    window.dispatchEvent(new CustomEvent("app-settings-updated"));
    toast("success", "Settings saved successfully");
  }

  const modelPresets: Record<AIProvider, string> = {
    groq: "llama-3.3-70b-versatile",
    gemini: "gemini-1.5-flash",
    openrouter: "meta-llama/llama-3.3-70b-instruct:free",
    together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    deepseek: "deepseek-chat",
    anthropic: "claude-3-5-sonnet-20240620",
    openai: "gpt-4o-mini",
    supabase: "ai-generate-questions"
  };

  const providerLinks: Partial<Record<AIProvider, string>> = {
    groq: "https://console.groq.com/keys",
    gemini: "https://aistudio.google.com/app/apikey",
    openrouter: "https://openrouter.ai/keys",
    together: "https://api.together.xyz/settings/api-keys",
    deepseek: "https://platform.deepseek.com/api_keys",
    anthropic: "https://console.anthropic.com/",
    openai: "https://platform.openai.com/api-keys",
  };

  const applyPreset = (prov: AIProvider) => {
    setAi(prev => ({ ...prev, provider: prov, model: modelPresets[prov] }));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl font-bold text-slate-900">System Settings</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${hasSupabase ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {hasSupabase ? "Cloud Sync Active" : "Local Demo Mode"}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-6 shadow-sm">
          <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
            <span className="p-1.5 bg-brand/10 text-brand rounded-lg">🏫</span>
            School Identity
          </h3>
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              School Name
              <input className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-bg dark:bg-slate-900/50 px-4 py-2.5 outline-none focus:border-brand text-ink" value={appSettings.schoolName} onChange={(e) => setAppSettings({ ...appSettings, schoolName: e.target.value })} placeholder="ABC International" />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              School Address
              <input className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-bg dark:bg-slate-900/50 px-4 py-2.5 outline-none focus:border-brand text-ink" value={appSettings.schoolAddress} onChange={(e) => setAppSettings({ ...appSettings, schoolAddress: e.target.value })} placeholder="123 Education Street..." />
            </label>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Primary Logo</label>
                {appSettings.schoolLogo ? (
                  <div className="relative w-full aspect-video bg-bg dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center group overflow-hidden">
                    <img src={appSettings.schoolLogo} className="w-full h-full object-contain p-2" />
                    <button onClick={() => setAppSettings(p => ({ ...p, schoolLogo: "" }))} className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm text-xs border border-white">✕</button>
                    <span className="absolute bottom-2 left-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 shadow-sm">Uploaded</span>
                  </div>
                ) : (
                  <label className="w-full aspect-video border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors">
                    <span className="text-2xl mb-1 text-slate-400">📤</span>
                    <span className="text-[11px] font-bold text-slate-500">Upload Logo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'schoolLogo')} />
                  </label>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Secondary Logo</label>
                {appSettings.secondaryLogo ? (
                  <div className="relative w-full aspect-video bg-bg dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center group overflow-hidden">
                    <img src={appSettings.secondaryLogo} className="w-full h-full object-contain p-2" />
                    <button onClick={() => setAppSettings(p => ({ ...p, secondaryLogo: "" }))} className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm text-xs border border-white">✕</button>
                    <span className="absolute bottom-2 left-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 shadow-sm">Uploaded</span>
                  </div>
                ) : (
                  <label className="w-full aspect-video border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors">
                    <span className="text-2xl mb-1 text-slate-400">📤</span>
                    <span className="text-[11px] font-bold text-slate-500">Upload Logo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'secondaryLogo')} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-6 shadow-sm">
          <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
            <span className="p-1.5 bg-brand/10 text-brand rounded-lg">👤</span>
            Active Account
          </h3>
          <div className="space-y-1">
            <p className="font-semibold text-ink">{profile?.full_name}</p>
            <p className="text-sm text-slate-500">{profile?.email}</p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                {profile?.role} Access
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card shadow-sm overflow-hidden mb-8">
        <div className="border-b border-slate-100 dark:border-slate-800 bg-bg dark:bg-slate-900/20 p-6 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-ink">Appearance & Paper Defaults</h3>
            <p className="mt-1 text-sm text-slate-500">Configure how the app looks and its default generation settings.</p>
          </div>
          <button className="px-5 py-2 rounded-xl bg-brand text-white font-bold shadow-lg shadow-brand/20 hover:bg-brand/90 transition-all text-sm active:scale-95" onClick={saveAll}>
            Save Changes
          </button>
        </div>

        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Interface Appearance</p>
              <div className="flex bg-bg dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-1 rounded-xl w-full max-w-sm">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateTheme(t)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg transition-all ${appSettings.theme === t
                        ? 'bg-card text-brand shadow-sm ring-1 ring-slate-900/5'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    <span className="text-lg">
                      {t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '🖥️'}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Paper Profile Defaults</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Default Layout
              <select className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 outline-none focus:border-brand bg-bg dark:bg-slate-900/50 text-ink" value={appSettings.layout} onChange={e => setAppSettings({ ...appSettings, layout: e.target.value })}>
                <option value="Layout - 1">Layout - 1</option>
                <option value="Layout - 2">Layout - 2</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Default Paper Font Size
              <input type="number" className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 outline-none focus:border-brand bg-bg dark:bg-slate-900/50 text-ink" value={appSettings.paperFontSize} onChange={e => setAppSettings({ ...appSettings, paperFontSize: Number(e.target.value) })} />
            </label>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Line Height
              <input type="number" step="0.5" className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 outline-none focus:border-brand bg-bg dark:bg-slate-900/50 text-ink" value={appSettings.lineHeight} onChange={e => setAppSettings({ ...appSettings, lineHeight: Number(e.target.value) })} />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Watermark Type
              <select className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 outline-none focus:border-brand bg-bg dark:bg-slate-900/50 text-ink" value={appSettings.watermarkType} onChange={e => setAppSettings({ ...appSettings, watermarkType: e.target.value })}>
                <option value="Image">Image</option>
                <option value="Text">Text</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Watermark Opacity
              <input type="number" step="0.1" max="1" min="0" className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 outline-none focus:border-brand bg-bg dark:bg-slate-900/50 text-ink" value={appSettings.watermarkOpacity} onChange={e => setAppSettings({ ...appSettings, watermarkOpacity: Number(e.target.value) })} />
            </label>
          </div>

          <div className="mt-6 flex gap-2 items-center">
            <input type="checkbox" id="showAddress" checked={appSettings.showAddress} onChange={e => setAppSettings({ ...appSettings, showAddress: e.target.checked })} className="w-4 h-4 text-brand rounded focus:ring-brand border-slate-300 dark:border-slate-700" />
            <label htmlFor="showAddress" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">Show Address in Paper Layout</label>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card shadow-sm overflow-hidden pb-6">
        <div className="border-b border-slate-100 dark:border-slate-800 bg-bg dark:bg-slate-900/20 p-6">
          <h3 className="text-xl font-bold text-ink flex items-center gap-2">
            <span className="p-1.5 bg-brand text-white rounded-lg shadow-sm">🤖</span>
            AI Provider Infrastructure
          </h3>
          <p className="mt-2 text-sm text-slate-500">Configure your favorite AI brain. Free-tier friendly options like <strong>Groq</strong> and <strong>Gemini</strong> are highly recommended.</p>
        </div>

        <div className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                Active AI Brain
                <select className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 focus:border-brand outline-none bg-bg dark:bg-slate-900/50 text-ink" value={ai.provider} onChange={(e) => applyPreset(e.target.value as AIProvider)}>
                  <optgroup label="Recommended Free Tiers" className="bg-bg dark:bg-slate-800">
                    <option value="groq">Groq (Ultra-Fast & Free)</option>
                    <option value="gemini">Google Gemini (Generous Free Tier)</option>
                    <option value="openrouter">OpenRouter (Multiple Free Models)</option>
                  </optgroup>
                  <optgroup label="Premium / Other" className="bg-bg dark:bg-slate-800">
                    <option value="openai">OpenAI (GPT-4o / Mini)</option>
                    <option value="anthropic">Anthropic (Claude 3.5)</option>
                    <option value="deepseek">DeepSeek (Best Value)</option>
                    <option value="together">Together AI</option>
                  </optgroup>
                  <optgroup label="Legacy" className="bg-bg dark:bg-slate-800">
                    <option value="supabase">Centralized Fallback</option>
                  </optgroup>
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                AI Model ID
                <div className="relative">
                  <input className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 focus:border-brand outline-none bg-bg dark:bg-slate-900/50 text-ink" value={ai.model} onChange={(e) => setAi((p) => ({ ...p, model: e.target.value }))} placeholder="e.g. llama-3.3-70b-versatile" />
                  <button onClick={() => applyPreset(ai.provider)} className="absolute right-2 top-[50%] -translate-y-[15%] p-1.5 text-brand text-[10px] font-bold uppercase tracking-tight">Auto-Fill</button>
                </div>
              </label>

              {providerLinks[ai.provider] && (
                <div className="p-3 bg-brand/5 dark:bg-brand/10 border border-brand/10 dark:border-brand/20 rounded-xl">
                  <p className="text-xs text-brand">
                    Need an API key? <a href={providerLinks[ai.provider]} target="_blank" rel="noopener noreferrer" className="font-bold underline">Get your free {ai.provider} key</a>.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                {ai.provider.charAt(0).toUpperCase() + ai.provider.slice(1)} API Key
                <input type="password" className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 focus:border-brand outline-none bg-bg dark:bg-slate-900/50 text-ink" value={ai[`${ai.provider}ApiKey` as keyof typeof ai] || ""} onChange={(e) => setAi(p => ({ ...p, [`${ai.provider}ApiKey`]: e.target.value }))} placeholder="Paste your key here..." />
              </label>

              <div className="p-4 rounded-xl bg-bg dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Suggestions</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.keys(modelPresets).slice(0, 4).map(k => (
                    <button key={k} onClick={() => applyPreset(k as AIProvider)} className={`px-2 py-1 rounded border transition-colors ${ai.provider === k ? 'bg-brand text-white border-brand' : 'bg-card text-ink border-slate-200 dark:border-slate-700 hover:border-brand'}`}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-6">
            <p className="text-xs text-slate-500 italic">Configuration is encrypted locally in your engine.</p>
            <button className="px-8 py-3 rounded-xl bg-brand text-white font-bold shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all" onClick={saveAll}>
              Save All Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
