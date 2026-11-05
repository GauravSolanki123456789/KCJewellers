"use client";

import { useState } from "react";
import axios from "axios";
import { CheckCircle2, Loader2 } from "lucide-react";

const inputCls =
  "w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-[var(--color-jewelry-black,#1a1814)] shadow-sm outline-none transition placeholder:text-[var(--color-jewelry-black,#1a1814)]/40 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15";

export default function StorefrontContactForm({ brandName }: { brandName: string }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await axios.post("/api/public/storefront-contact", {
        name: name.trim(),
        mobile: mobile.replace(/\D/g, "").slice(-10),
        email: email.trim() || undefined,
        message: message.trim(),
      });
      setSuccess(true);
      setName("");
      setMobile("");
      setEmail("");
      setMessage("");
    } catch (err: unknown) {
      let msg: string | null = null;
      if (err && typeof err === "object" && "response" in err) {
        const data = (err as { response?: { data?: { error?: string } } }).response?.data;
        msg = data?.error || null;
      }
      setError(msg || "Could not send your message. Please try again or call us.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div
        className="mt-10 rounded-2xl border border-emerald-600/20 bg-emerald-50/50 px-4 py-6 text-center sm:px-6"
        role="status"
      >
        <CheckCircle2 className="mx-auto size-10 text-emerald-700" strokeWidth={1.5} aria-hidden />
        <p className="mt-3 text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Message sent
        </p>
        <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          {brandName} will get back to you soon. For urgent orders, call or WhatsApp us above.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-[var(--kc-accent,#9a1c2e)] underline-offset-2 hover:underline"
          onClick={() => setSuccess(false)}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-wide text-[var(--color-jewelry-black,#1a1814)] uppercase">
          Send a message
        </h2>
        <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
          Fill in the form and {brandName} will reply by phone or email.
        </p>
      </div>

      <div>
        <label htmlFor="sf-contact-name" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/55">
          Your name
        </label>
        <input
          id="sf-contact-name"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="sf-contact-mobile" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/55">
          Mobile number
        </label>
        <input
          id="sf-contact-mobile"
          className={inputCls}
          type="tel"
          inputMode="numeric"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          required
          maxLength={14}
          placeholder="10-digit mobile"
          autoComplete="tel"
        />
      </div>

      <div>
        <label htmlFor="sf-contact-email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/55">
          Email <span className="font-normal normal-case tracking-normal text-[var(--color-jewelry-black,#1a1814)]/45">(optional)</span>
        </label>
        <input
          id="sf-contact-email"
          className={inputCls}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={120}
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="sf-contact-message" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/55">
          Message
        </label>
        <textarea
          id="sf-contact-message"
          className={`${inputCls} min-h-[120px] resize-y py-3`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={4}
          maxLength={4000}
          placeholder="What would you like to know? Product, order, visit…"
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--kc-accent,#9a1c2e)] px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          "Submit message"
        )}
      </button>
    </form>
  );
}
