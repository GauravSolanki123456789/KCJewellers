"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "@/lib/axios";
import AdminGuard from "@/components/AdminGuard";
import { ArrowLeft, Loader2, Palette, Save, Store } from "lucide-react";

type ThemeRow = {
  id: string;
  label: string;
  description: string;
  swatches: [string, string, string];
};

type SettingsPayload = {
  defaultKcThemeId: string;
  themes: ThemeRow[];
  kc_theme_id: string;
  kc_reseller_theme_id: string;
};

function ThemePickCard({
  row,
  selected,
  onSelect,
}: {
  row: ThemeRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-2xl border p-4 text-left transition-all min-h-[120px] sm:min-h-0 ${
        selected
          ? "border-amber-500/70 bg-amber-500/10 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10"
          : "border-slate-700/80 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/70"
      }`}
    >
      <div className="flex gap-2 mb-3">
        {row.swatches.map((c) => (
          <span
            key={c}
            className="size-8 sm:size-9 rounded-full border border-white/15 shadow-inner shrink-0"
            style={{ background: c }}
            aria-hidden
          />
        ))}
      </div>
      <div className="font-semibold text-slate-100 text-sm sm:text-base">{row.label}</div>
      <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-snug line-clamp-3 sm:line-clamp-2">
        {row.description}
      </p>
      <code className="mt-2 block text-[10px] sm:text-[11px] text-slate-600 truncate">
        kc_theme_id · {row.id}
      </code>
    </button>
  );
}

export default function AdminThemeSettingsPage() {
  return (
    <AdminGuard>
      <AdminThemeContent />
    </AdminGuard>
  );
}

function AdminThemeContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ThemeRow[]>([]);
  const [appTheme, setAppTheme] = useState("");
  const [resellerDefault, setResellerDefault] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await axios.get<SettingsPayload>("/api/admin/settings/kc-theme");
      setCatalog(Array.isArray(data.themes) ? data.themes : []);
      setAppTheme(data.kc_theme_id || "");
      setResellerDefault(data.kc_reseller_theme_id || "");
    } catch {
      setErr("Could not load theme settings.");
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      await axios.put("/api/admin/settings/kc-theme", {
        kc_theme_id: appTheme,
        kc_reseller_theme_id: resellerDefault,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      setErr("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 p-4 md:p-8 pb-28 md:pb-12">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-4 transition-colors"
        >
          <ArrowLeft className="size-4" />
          Admin
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Palette className="size-6 sm:size-7" />
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-50">
                Colour themes
              </h1>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
              Choose a palette for the main KC Jewellers app and a default for reseller storefronts
              and shared catalogue links. Each reseller can override with their own theme in{" "}
              <Link href="/admin/b2b-clients" className="text-emerald-400 hover:underline">
                B2B clients → Edit reseller
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/30 hover:opacity-95 disabled:opacity-50 sm:shrink-0"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save themes
          </button>
        </div>

        {saved && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Saved — new visitors will see the updated colours (you may need to refresh).
          </div>
        )}
        {err && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {err}
          </div>
        )}

        <section className="rounded-2xl border border-slate-800/90 bg-slate-900/25 shadow-xl shadow-black/20 p-5 sm:p-8 mb-8">
          <div className="flex items-center gap-2 text-slate-200 font-semibold mb-1">
            <Palette className="size-5 text-amber-400" />
            Main app
          </div>
          <p className="text-slate-500 text-sm mb-6 max-w-2xl">
            Applies across the main site for all customers, checkout flows, admin tools, and staff —
            except where a reseller override applies.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {catalog.map((row) => (
              <ThemePickCard
                key={row.id}
                row={row}
                selected={appTheme === row.id}
                onSelect={() => setAppTheme(row.id)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 shadow-xl shadow-black/20 p-5 sm:p-8">
          <div className="flex items-center gap-2 text-emerald-200 font-semibold mb-1">
            <Store className="size-5 text-emerald-400" />
            Reseller &amp; shared catalogue default
          </div>
          <p className="text-slate-500 text-sm mb-6 max-w-2xl">
            Used on reseller vanity domains, temporary shared catalogue links, and anywhere a reseller
            has not picked their own theme.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {catalog.map((row) => (
              <ThemePickCard
                key={`r-${row.id}`}
                row={row}
                selected={resellerDefault === row.id}
                onSelect={() => setResellerDefault(row.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
