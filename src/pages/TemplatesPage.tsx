import { useEffect, useState } from "react";
import { getTemplates, saveTemplate } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { GeneratorSettings, PaperTemplate } from "@/types/domain";

export function TemplatesPage() {
  const profile = useAppStore((s) => s.profile);
  const generated = useAppStore((s) => s.generatedPaper);
  const toast = useAppStore((s) => s.pushToast);
  const [rows, setRows] = useState<PaperTemplate[]>([]);
  const [name, setName] = useState("Monthly Template");

  async function load() {
    if (!profile?.id) {
      return;
    }
    setRows(await getTemplates(profile.id));
  }

  useEffect(() => {
    load();
  }, [profile?.id]);

  async function saveCurrent() {
    if (!profile?.id || !profile.school_id || !generated) {
      toast("error", "Generate a paper first");
      return;
    }
    await saveTemplate({
      teacher_id: profile.id,
      school_id: profile.school_id,
      name,
      settings_json: generated.paper.settings_json as unknown as GeneratorSettings,
    });
    toast("success", "Template saved");
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Templates</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <label className="min-w-64 flex-1 text-xs font-semibold text-slate-600">
            Template Name
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          </label>
          <button className="rounded-lg bg-brand px-4 py-2 text-white" onClick={saveCurrent}>Save Current Generator Settings</button>
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{row.name}</p>
            <p className="text-slate-600">Created {new Date(row.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
