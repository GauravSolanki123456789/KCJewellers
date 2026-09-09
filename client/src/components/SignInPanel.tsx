"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { CATALOG_PATH, PROFILE_PATH } from "@/lib/routes";
import { buildGoogleOAuthStartUrl } from "@/lib/google-oauth";
import { useResellerBranding } from "@/context/ResellerBrandingContext";
import { Mail, Smartphone } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type SignInPanelProps = {
  returnTo?: string | null;
  onAuthenticated?: () => void;
  /** Page layout uses larger type and a dashboard-oriented subtitle. */
  variant?: "modal" | "page";
};

export default function SignInPanel({
  returnTo,
  onAuthenticated,
  variant = "modal",
}: SignInPanelProps) {
  const pathname = usePathname();
  const { customDomainHost } = useResellerBranding();
  const [step, setStep] = useState<"choose" | "mobile" | "otp">("choose");
  const [mobile_number, setMobileNumber] = useState("");
  const [otp_code, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const defaultReturn =
    customDomainHost ? PROFILE_PATH : pathname || CATALOG_PATH;
  const target = returnTo || defaultReturn;
  const safeReturnTo = target.startsWith("/") ? target : CATALOG_PATH;

  const handleSendOtp = async () => {
    const mobile = mobile_number.replace(/\D/g, "").slice(-10);
    if (mobile.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/auth/send-otp`,
        { mobile_number: mobile },
        { withCredentials: true },
      );
      setStep("otp");
      setOtpCode("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to send OTP";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const mobile = mobile_number.replace(/\D/g, "").slice(-10);
    const otp = otp_code.trim();
    if (mobile.length !== 10 || otp.length < 4) {
      setError("Enter the 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/auth/verify-otp`,
        { mobile_number: mobile, otp_code: otp },
        { withCredentials: true },
      );
      onAuthenticated?.();
      window.location.href = safeReturnTo.startsWith("/")
        ? safeReturnTo
        : CATALOG_PATH;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Invalid OTP";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = buildGoogleOAuthStartUrl(safeReturnTo);
  };

  const subtitle =
    variant === 'page'
      ? null
      : customDomainHost
        ? null
        : 'Sign in to access cart, checkout, and Book Rate'

  return (
    <div className="space-y-4">
      {subtitle ? (
        <p className="text-sm leading-relaxed text-slate-400">{subtitle}</p>
      ) : null}

      {step === "choose" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-3 font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            <Mail className="size-5" />
            Sign in with Google
          </button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-slate-900 px-2 text-slate-500">or</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep("mobile")}
            className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-400"
          >
            <Smartphone className="size-5" />
            Sign in with Mobile OTP
          </button>
        </div>
      )}

      {step === "mobile" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Mobile Number
            </label>
            <input
              type="tel"
              placeholder="10-digit mobile number"
              value={mobile_number}
              onChange={(e) =>
                setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 placeholder-slate-500 outline-none focus:border-transparent focus:ring-2 focus:ring-amber-500"
              maxLength={10}
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-sm break-words text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("choose");
                setError("");
              }}
              className="min-h-[44px] flex-1 border-slate-600 text-slate-300"
            >
              Back
            </Button>
            <Button
              onClick={handleSendOtp}
              disabled={loading || mobile_number.replace(/\D/g, "").length !== 10}
              className="min-h-[44px] flex-1 bg-amber-500 font-semibold text-white hover:bg-amber-400"
            >
              {loading ? "Sending…" : "Get OTP"}
            </Button>
          </div>
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            OTP sent to +91 {mobile_number.replace(/\D/g, "").slice(-10)}
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Enter 6-digit OTP
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={otp_code}
              onChange={(e) =>
                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-center font-mono text-xl tracking-[0.5em] text-slate-100 placeholder-slate-500 outline-none focus:border-transparent focus:ring-2 focus:ring-amber-500"
              maxLength={6}
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-sm break-words text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("mobile");
                setError("");
                setOtpCode("");
              }}
              className="min-h-[44px] flex-1 border-slate-600 text-slate-300"
            >
              Change Number
            </Button>
            <Button
              onClick={handleVerifyOtp}
              disabled={loading || otp_code.length < 4}
              className="min-h-[44px] flex-1 bg-amber-500 font-semibold text-white hover:bg-amber-400"
            >
              {loading ? "Verifying…" : "Verify & Login"}
            </Button>
          </div>
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading}
            className="min-h-[44px] w-full text-sm text-amber-400 hover:text-amber-300"
          >
            Resend OTP
          </button>
        </div>
      )}
    </div>
  );
}
