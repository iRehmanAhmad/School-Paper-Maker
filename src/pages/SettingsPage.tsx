import React, { useEffect, useState } from "react";
import { getAISettings, getSchoolAISettings, saveSchoolAISettings, saveAISettings } from "@/services/aiSettings";
import { type AIProvider, type AISettings } from "@/types/ai";
import { refreshKeyStatus } from "@/services/ai";
import { getAppSettings, saveAppSettings } from "@/services/appSettings";
import { changeMyPassword } from "@/services/repositories";
import { hasSupabase } from "@/services/supabase";
import { useAppStore } from "@/store/useAppStore";
import { testKeyConnection } from "@/services/ai";
import { AIKeyEntry } from "@/types/ai";

export function SettingsPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const aiState = useAppStore((s) => s.aiSettings);
  const setAi = useAppStore((s) => s.setAiSettings);
  const ai = aiState || getAISettings();
  const [appSettings, setAppSettings] = useState(getAppSettings());
  const [loadingCloudAI, setLoadingCloudAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const currentProviderKey = (ai[`${ai.provider}ApiKey` as keyof AISettings] as string) || "";
  const [providerKeyDraft, setProviderKeyDraft] = useState(currentProviderKey);
  const [savingAI, setSavingAI] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  // Multi-key pool state
  const [newKeyProvider, setNewKeyProvider] = useState<AIProvider>("groq");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCloudSettings() {
      if (!profile?.school_id || !hasSupabase) return;
      setLoadingCloudAI(true);
      try {
        const cloudSettings = await getSchoolAISettings(profile.school_id);
        if (!active) return;
        setAi(cloudSettings);
      } finally {
        if (active) setLoadingCloudAI(false);
      }
    }
    void loadCloudSettings();
    return () => {
      active = false;
    };
  }, [profile?.school_id]);

  // Auto-refresh AI status on enter
  useEffect(() => {
    if (ai.keyPool) {
      ai.keyPool.forEach((key) => void refreshKeyStatus(key));
    }
  }, []);

  useEffect(() => {
    setProviderKeyDraft(currentProviderKey);
  }, [ai.provider, currentProviderKey]);

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

  async function saveAll() {
    setSaving(true);
    try {
      await saveSchoolAISettings(profile?.school_id, ai, profile?.id);
      saveAppSettings(appSettings);
      window.dispatchEvent(new CustomEvent("app-settings-updated"));
      if (hasSupabase && profile?.school_id) {
        toast("success", "Settings saved locally and to cloud");
      } else {
        toast("success", "Settings saved locally");
      }
    } catch (error) {
      saveAppSettings(appSettings);
      window.dispatchEvent(new CustomEvent("app-settings-updated"));
      toast("error", error instanceof Error ? error.message : "Saved locally, cloud save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAIOnly(next: AISettings) {
    setSavingAI(true);
    try {
      await saveSchoolAISettings(profile?.school_id, next, profile?.id);
      if (hasSupabase && profile?.school_id) {
        toast("success", "AI settings saved to cloud");
      } else {
        toast("success", "AI settings saved locally");
      }
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Saved locally, cloud save failed");
    } finally {
      setSavingAI(false);
    }
  }

  async function updatePassword() {
    if (!profile?.id) {
      toast("error", "No active user");
      return;
    }
    if (!passwordCurrent || !passwordNext || !passwordConfirm) {
      toast("error", "Fill all password fields");
      return;
    }
    if (passwordNext.length < 6) {
      toast("error", "New password must be at least 6 characters");
      return;
    }
    if (passwordNext !== passwordConfirm) {
      toast("error", "New password and confirm password do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await changeMyPassword({
        userId: profile.id,
        currentPassword: passwordCurrent,
        nextPassword: passwordNext,
      });
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
      toast("success", "Password updated");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Password update failed");
    } finally {
      setChangingPassword(false);
    }
  }

  const modelPresets: Record<AIProvider, string> = {
    groq: "llama-3.3-70b-versatile",
    gemini: "gemini-1.5-flash",
    openrouter: "meta-llama/llama-3.3-70b-instruct:free",
    together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    deepseek: "deepseek-chat",
    anthropic: "claude-3-5-sonnet-20240620",
    openai: "gpt-4o-mini",
    qwen: "qwen-plus",
    siliconflow: "deepseek-ai/DeepSeek-V3",
    supabase: "ai-generate-questions"
  };
  const getKeyModel = (keyEntry: AISettings["keyPool"][number]) => {
    return keyEntry.model || (keyEntry.provider === ai.provider ? ai.model : modelPresets[keyEntry.provider]);
  };

  const selectKeyModel = (keyEntry: AISettings["keyPool"][number]) => {
    const model = getKeyModel(keyEntry) || modelPresets[keyEntry.provider];
    const trimmed = model.trim();
    if (!trimmed) return;
    saveAISettings({
      ...ai,
      provider: keyEntry.provider,
      model: trimmed,
      activeKeyId: keyEntry.id,
    });
  };

  const providerLinks: Partial<Record<AIProvider, string>> = {
    groq: "https://console.groq.com/keys",
    gemini: "https://aistudio.google.com/app/apikey",
    openrouter: "https://openrouter.ai/keys",
    together: "https://api.together.xyz/settings/api-keys",
    deepseek: "https://platform.deepseek.com/api_keys",
    anthropic: "https://console.anthropic.com/",
    openai: "https://platform.openai.com/api-keys",
    qwen: "https://dashscope.console.aliyun.com/apiKey",
    siliconflow: "https://cloud.siliconflow.cn/account/ak",
  };

  const applyPreset = (prov: AIProvider) => {
    saveAISettings({ ...ai, provider: prov, model: modelPresets[prov] });
  };

  const addKeyToPool = () => {
    if (!newKeyValue) {
      toast("error", "Please enter an API key");
      return;
    }
    const providerCount = (ai.keyPool || []).filter(k => k.provider === newKeyProvider).length;
    const stamp = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newEntry = {
      id: crypto.randomUUID(),
      provider: newKeyProvider,
      key: newKeyValue,
      label: newKeyLabel || `${newKeyProvider} Key #${providerCount + 1} • ${stamp}`,
      usageCount: 0,
      isExhausted: false,
      model: modelPresets[newKeyProvider],
    };
    const next = {
      ...ai,
      keyPool: [...(ai.keyPool || []), newEntry],
      // Also update the primary key field for the provider if it's the first one
      [`${newKeyProvider}ApiKey`]: (ai[`${newKeyProvider}ApiKey` as keyof typeof ai] as string) || newKeyValue,
      activeKeyId: ai.activeKeyId || newEntry.id,
    } as AISettings;
    saveAISettings(next);
    void saveAIOnly(next);
    setNewKeyValue("");
    setNewKeyLabel("");
    toast("success", `Added ${newKeyProvider} key to vault`);
  };

  const handleTestConnection = async (keyEntry: AIKeyEntry | { provider: AIProvider, key: string }) => {
    const id = (keyEntry as AIKeyEntry).id || "draft";
    setTestingKeyId(id);
    try {
      const res = await testKeyConnection(id === "draft" ? { id: "draft", usageCount: 0, ...keyEntry } as AIKeyEntry : keyEntry as AIKeyEntry);
      if (res.ok) {
        toast("success", `${keyEntry.provider.toUpperCase()} connection successful! API key is valid.`);
      } else {
        toast("error", `${keyEntry.provider.toUpperCase()} test failed: ${res.error}`);
      }
    } finally {
      setTestingKeyId(null);
      if (id !== "draft") {
        void refreshKeyStatus(keyEntry as AIKeyEntry);
      }
    }
  };

  const saveProviderKey = () => {
    const trimmed = providerKeyDraft.trim();
    if (!trimmed) {
      toast("error", "Please enter an API key");
      return;
    }
    const keyField = `${ai.provider}ApiKey` as keyof AISettings;
    const existing = (ai.keyPool || []).find((k) => k.provider === ai.provider && k.key === trimmed);
    const keyPool = existing
      ? (ai.keyPool || []).map((k) =>
        k.id === existing.id
          ? { ...k, isExhausted: false, quotaRemaining: undefined }
          : k
      )
      : [
        ...(ai.keyPool || []),
        {
          id: crypto.randomUUID(),
          provider: ai.provider,
          key: trimmed,
          label: "Primary Key",
          usageCount: 0,
          isExhausted: false,
          model: ai.model || modelPresets[ai.provider],
        },
      ];
    const next = {
      ...ai,
      [keyField]: trimmed,
      keyPool,
      activeKeyId: existing ? existing.id : keyPool[keyPool.length - 1]?.id,
    } as AISettings;
    saveAISettings(next);
    void saveAIOnly(next);
    toast("success", "API key saved");
  };

  const removeKeyFromPool = (id: string) => {
    const nextPool = ai.keyPool.filter((k) => k.id !== id);
    saveAISettings({
      ...ai,
      keyPool: nextPool,
      activeKeyId: ai.activeKeyId === id ? (nextPool[0]?.id || "") : ai.activeKeyId,
    });
    toast("success", "Key removed from vault");
  };

  const toggleKeyExhaustion = (id: string) => {
    saveAISettings({
      ...ai,
      keyPool: ai.keyPool.map((k) => k.id === id ? { ...k, isExhausted: !k.isExhausted } : k),
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl font-bold text-slate-900">System Settings</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${hasSupabase ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {hasSupabase ? "Cloud Sync Active" : "Local Demo Mode"}
        </span>
      </div>
      {loadingCloudAI && (
        <div className="text-xs font-semibold text-brand">Loading cloud AI settings...</div>
      )}

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
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Change Password</p>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900/50"
                placeholder="Current password"
                value={passwordCurrent}
                onChange={(e) => setPasswordCurrent(e.target.value)}
              />
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900/50"
                placeholder="New password"
                value={passwordNext}
                onChange={(e) => setPasswordNext(e.target.value)}
              />
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900/50"
                placeholder="Confirm new password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void updatePassword()}
                disabled={changingPassword}
                className="w-full rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {changingPassword ? "Updating..." : "Update Password"}
              </button>
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
          <button
            className="px-5 py-2 rounded-xl bg-brand text-white font-bold shadow-lg shadow-brand/20 hover:bg-brand/90 transition-all text-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => void saveAll()}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
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
                    <option value="qwen">Qwen (Generous Free Tier)</option>
                    <option value="openrouter">OpenRouter (Multiple Free Models)</option>
                  </optgroup>
                  <optgroup label="Premium / Other" className="bg-bg dark:bg-slate-800">
                    <option value="openai">OpenAI (GPT-4o / Mini)</option>
                    <option value="anthropic">Anthropic (Claude 3.5)</option>
                    <option value="deepseek">DeepSeek (Best Value)</option>
                    <option value="siliconflow">Silicon Flow (Affordable Aggregator)</option>
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
                <input
                  className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 focus:border-brand outline-none bg-bg dark:bg-slate-900/50 text-ink"
                  value={ai.model}
                  onChange={(e) => saveAISettings({ ...ai, model: e.target.value })}
                  onBlur={() => saveAISettings({ ...ai, model: ai.model })}
                  placeholder="e.g. llama-3.3-70b-versatile"
                />
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
                {(ai.provider || "groq").charAt(0).toUpperCase() + (ai.provider || "groq").slice(1)} API Key
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="password"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 focus:border-brand outline-none bg-bg dark:bg-slate-900/50 text-ink"
                    value={providerKeyDraft}
                    onChange={(e) => setProviderKeyDraft(e.target.value)}
                    placeholder="Paste your key here..."
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestConnection({ provider: ai.provider, key: providerKeyDraft })}
                    disabled={testingKeyId === "draft" || !providerKeyDraft}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-ink text-xs font-bold uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                  >
                    {testingKeyId === "draft" ? "Testing..." : "Test"}
                  </button>
                  <button
                    type="button"
                    onClick={saveProviderKey}
                    disabled={savingAI}
                    className="px-4 py-2.5 rounded-xl bg-brand text-white text-xs font-bold uppercase tracking-wide shadow-lg shadow-brand/20 hover:bg-brand/90 disabled:opacity-60"
                  >
                    {savingAI ? "Saving..." : "Save Key"}
                  </button>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <span className="p-1.5 bg-brand/10 text-brand rounded-lg text-xs">🔑</span>
              AI Key Vault (Advanced Fallback)
            </h4>

            {/* Add New Key Form */}
            <div className="mb-6 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Add Multiple Keys per Company</p>
              <div className="grid sm:grid-cols-4 gap-3">
                <select
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-card px-3 py-2 text-xs outline-none focus:border-brand"
                  value={newKeyProvider}
                  onChange={e => setNewKeyProvider(e.target.value as AIProvider)}
                >
                  <option value="groq">Groq</option>
                  <option value="gemini">Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="qwen">Qwen</option>
                  <option value="siliconflow">Silicon Flow</option>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
                <input
                  placeholder="Label (e.g. My Free Key)"
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-card px-3 py-2 text-xs outline-none focus:border-brand"
                  value={newKeyLabel}
                  onChange={e => setNewKeyLabel(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="API Key..."
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-card px-3 py-2 text-xs outline-none focus:border-brand"
                  value={newKeyValue}
                  onChange={e => setNewKeyValue(e.target.value)}
                />
                <button
                  onClick={addKeyToPool}
                  className="rounded-lg bg-brand text-white text-xs font-bold py-2 hover:bg-brand/90 transition-colors"
                >
                  Add to Vault
                </button>
              </div>
            </div>

            {/* Key List */}
            <div className="space-y-2">
              {ai.keyPool && ai.keyPool.length > 0 ? (
                ai.keyPool.map((keyEntry) => (
                  <div key={keyEntry.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all ${keyEntry.isExhausted ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30 opacity-75' : 'bg-bg dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink capitalize">{keyEntry.provider}</span>
                          <span className="text-[10px] text-slate-500">— {keyEntry.label}</span>
                          {keyEntry.isExhausted && <span className="text-[8px] font-black bg-red-500 text-white px-1 rounded">EXHAUSTED</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            Used {keyEntry.usageCount} times
                          </span>
                          <span className="text-[10px] text-brand/70 font-bold flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-brand"></span>
                            {keyEntry.quotaRemaining || "Quota not checked"}
                          </span>
                          {keyEntry.lastUsed && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Last used: {new Date(keyEntry.lastUsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {keyEntry.lastError && (
                            <span className="text-[10px] text-red-500 font-bold ml-1">
                              ⚠️ {keyEntry.lastError}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 mt-3 sm:mt-0">
                      <button
                        type="button"
                        onClick={() => selectKeyModel(keyEntry)}
                        className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide text-left transition-colors ${ai.activeKeyId === keyEntry.id
                          ? "bg-brand text-white border-brand"
                          : "bg-card text-ink border-slate-200 dark:border-slate-700 hover:border-brand"
                          }`}
                        title={ai.activeKeyId === keyEntry.id ? "In Use" : "Switch to this key"}
                      >
                        {ai.activeKeyId === keyEntry.id ? "✓ In Use — " : ""}{getKeyModel(keyEntry)}
                      </button>
                      <button
                        onClick={() => void handleTestConnection(keyEntry)}
                        disabled={testingKeyId === keyEntry.id}
                        className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-tight transition-all flex items-center justify-center h-8 px-3 ${testingKeyId === keyEntry.id ? "bg-slate-100 opacity-60" : "hover:border-brand hover:text-brand"}`}
                        title="Test Connection"
                      >
                        {testingKeyId === keyEntry.id ? "..." : "Test Online"}
                      </button>
                      <button
                        onClick={() => void refreshKeyStatus(keyEntry)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-brand hover:border-brand transition-all flex items-center justify-center h-8"
                        title="Refresh Status"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => toggleKeyExhaustion(keyEntry.id)}
                        className={`text-[9px] font-bold px-2 py-1 rounded border transition-colors ${keyEntry.isExhausted ? 'bg-emerald-500 text-white border-emerald-500' : 'text-slate-500 border-slate-200 dark:border-slate-800 hover:border-red-500 hover:text-red-500'}`}
                      >
                        {keyEntry.isExhausted ? "Retry Key" : "Mark Full"}
                      </button>
                      <button
                        onClick={() => removeKeyFromPool(keyEntry.id)}
                        className="text-[9px] font-bold px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-sm text-slate-400 font-medium">No keys in the vault. Add your first key above!</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-6">
            <p className="text-xs text-slate-500 italic">
              Keys save locally and sync to your school cloud profile when Supabase is connected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

