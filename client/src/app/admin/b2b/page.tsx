"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "@/lib/axios";
import { useAuth } from "@/hooks/useAuth";
import { SUPER_ADMIN_EMAIL, isCatalogAdminUser } from "@/lib/is-catalog-admin";
import Link from "next/link";
import { CATALOG_PATH } from "@/lib/routes";
import { Loader2 } from "lucide-react";

type UserRow = {
  id: number;
  email?: string | null;
  name?: string | null;
  mobile_number?: string | null;
  role?: string;
  mc_discount_percent?: number;
  metal_markup_percent?: number;
  ledger_rupee_balance?: number;
  ledger_fine_metal_grams?: number;
};

type WhitelistRow = {
  id: number;
  email_norm?: string | null;
  mobile_last10?: string | null;
  default_mc_discount_percent?: number;
  default_metal_markup_percent?: number;
  notes?: string | null;
};

export default function AdminB2BPage() {
  const auth = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const email = ((auth.user as { email?: string })?.email || "").toLowerCase().trim();
  const isSuper = email === SUPER_ADMIN_EMAIL.toLowerCase();
  const allowed = auth.isAuthenticated && isCatalogAdminUser(auth.user) && isSuper;

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setErr(null);
    try {
      const [u, w] = await Promise.all([
        axios.get<UserRow[]>("/api/admin/users"),
        axios.get<WhitelistRow[]>("/api/admin/b2b/whitelist"),
      ]);
      setUsers(Array.isArray(u.data) ? u.data : []);
      setWhitelist(Array.isArray(w.data) ? w.data : []);
    } catch (e: unknown) {
      setErr(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  const [editId, setEditId] = useState("");
  const [editRole, setEditRole] = useState<"B2C_CUSTOMER" | "B2B_WHOLESALE">("B2B_WHOLESALE");
  const [editMc, setEditMc] = useState("10");
  const [editMm, setEditMm] = useState("0");

  const saveUser = async () => {
    setMsg(null);
    setErr(null);
    try {
      const id = parseInt(editId, 10);
      if (Number.isNaN(id)) {
        setErr("Enter a valid user ID");
        return;
      }
      await axios.put(`/api/admin/b2b/users/${id}`, {
        role: editRole,
        mc_discount_percent: Number(editMc),
        metal_markup_percent: Number(editMm),
      });
      setMsg("User updated.");
      load();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setErr(ax?.response?.data?.error || "Update failed");
    }
  };

  const [wlEmail, setWlEmail] = useState("");
  const [wlMobile, setWlMobile] = useState("");
  const [wlMc, setWlMc] = useState("10");
  const [wlMm, setWlMm] = useState("0");

  const addWhitelist = async () => {
    setMsg(null);
    setErr(null);
    try {
      await axios.post("/api/admin/b2b/whitelist", {
        email: wlEmail || undefined,
        mobile_number: wlMobile || undefined,
        default_mc_discount_percent: Number(wlMc),
        default_metal_markup_percent: Number(wlMm),
      });
      setMsg("Whitelist entry added.");
      setWlEmail("");
      setWlMobile("");
      load();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setErr(ax?.response?.data?.error || "Whitelist failed");
    }
  };

  const [ledUser, setLedUser] = useState("");
  const [ledType, setLedType] = useState<"PURCHASE" | "CASH_PAYMENT" | "METAL_DEPOSIT">("PURCHASE");
  const [ledRupee, setLedRupee] = useState("0");
  const [ledFine, setLedFine] = useState("0");

  const postLedger = async () => {
    setMsg(null);
    setErr(null);
    try {
      const user_id = parseInt(ledUser, 10);
      if (Number.isNaN(user_id)) {
        setErr("Ledger: invalid user id");
        return;
      }
      await axios.post("/api/admin/b2b/ledger-entry", {
        user_id,
        entry_type: ledType,
        rupee_delta: Number(ledRupee),
        fine_metal_delta_grams: Number(ledFine),
      });
      setMsg("Ledger entry posted.");
      load();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setErr(ax?.response?.data?.error || "Ledger failed");
    }
  };

  if (!auth.hasChecked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-slate-400">This page is restricted to the store super admin.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-amber-400">
          Catalogue
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-24">
      <h1 className="text-2xl font-bold text-slate-100">B2B wholesale admin</h1>
      <p className="mt-1 text-sm text-slate-500">
        Assign wholesale roles, default tiers, whitelist emails/mobiles, and ledger lines.
      </p>

      {msg && <p className="mt-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-400">{err}</p>}

      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold text-slate-200">Set user role & discount tier</h2>
        <p className="text-xs text-slate-500">Use user id from the table below (from Google / OTP sign-ups).</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">User ID</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={editId}
              onChange={(e) => setEditId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Role</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as typeof editRole)}
            >
              <option value="B2C_CUSTOMER">B2C_CUSTOMER</option>
              <option value="B2B_WHOLESALE">B2B_WHOLESALE</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">MC discount %</span>
            <input
              type="number"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={editMc}
              onChange={(e) => setEditMc(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Metal markup %</span>
            <input
              type="number"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={editMm}
              onChange={(e) => setEditMm(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => saveUser()}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Save
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold text-slate-200">Whitelist (auto B2B on login)</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Email</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={wlEmail}
              onChange={(e) => setWlEmail(e.target.value)}
              placeholder="buyer@firm.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Mobile (10 digit)</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={wlMobile}
              onChange={(e) => setWlMobile(e.target.value)}
              placeholder="9876543210"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Default MC %</span>
            <input
              type="number"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={wlMc}
              onChange={(e) => setWlMc(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Default metal %</span>
            <input
              type="number"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={wlMm}
              onChange={(e) => setWlMm(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => addWhitelist()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Add whitelist
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold text-slate-200">Ledger entry (Khata)</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">User ID</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={ledUser}
              onChange={(e) => setLedUser(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Type</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={ledType}
              onChange={(e) => setLedType(e.target.value as typeof ledType)}
            >
              <option value="PURCHASE">Purchase</option>
              <option value="CASH_PAYMENT">Cash payment</option>
              <option value="METAL_DEPOSIT">Metal deposit</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Rupee Δ</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={ledRupee}
              onChange={(e) => setLedRupee(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Fine metal Δ (g)</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={ledFine}
              onChange={(e) => setLedFine(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => postLedger()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Post entry
          </button>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">Users</h2>
          <button
            type="button"
            onClick={() => load()}
            className="text-sm text-amber-400 hover:underline"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-500">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Email / mobile</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2 text-right">MC %</th>
                <th className="px-3 py-2 text-right">Metal %</th>
                <th className="px-3 py-2 text-right">Ledger ₹</th>
                <th className="px-3 py-2 text-right">Fine g</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/80">
                  <td className="px-3 py-2 font-mono text-slate-300">{u.id}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {u.email || (u.mobile_number ? `+91 ${u.mobile_number}` : "—")}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{u.role}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.mc_discount_percent ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.metal_markup_percent ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.ledger_rupee_balance != null
                      ? Number(u.ledger_rupee_balance).toLocaleString("en-IN")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.ledger_fine_metal_grams != null
                      ? Number(u.ledger_fine_metal_grams).toFixed(4)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-200">B2B whitelist</h2>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[480px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-500">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2 text-right">MC %</th>
                <th className="px-3 py-2 text-right">Metal %</th>
              </tr>
            </thead>
            <tbody>
              {whitelist.map((w) => (
                <tr key={w.id} className="border-b border-slate-800/80">
                  <td className="px-3 py-2 font-mono">{w.id}</td>
                  <td className="px-3 py-2 text-slate-400">{w.email_norm || "—"}</td>
                  <td className="px-3 py-2 text-slate-400">{w.mobile_last10 || "—"}</td>
                  <td className="px-3 py-2 text-right">{w.default_mc_discount_percent ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{w.default_metal_markup_percent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
