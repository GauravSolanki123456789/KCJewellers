'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import axios from 'axios'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLoginModal } from '@/context/LoginModalContext'
import { Smartphone, Mail } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export default function LoginModal() {
  const router = useRouter()
  const pathname = usePathname()
  const { isOpen, close, returnTo } = useLoginModal()
  const [step, setStep] = useState<'choose' | 'mobile' | 'otp'>('choose')
  const [mobile_number, setMobileNumber] = useState('')
  const [otp_code, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  const reset = () => {
    setStep('choose')
    setMobileNumber('')
    setOtpCode('')
    setError('')
    setOtpSent(false)
  }

  const handleClose = () => {
    reset()
    close()
  }

  const handleSendOtp = async () => {
    const mobile = mobile_number.replace(/\D/g, '').slice(-10)
    if (mobile.length !== 10) {
      setError('Enter a valid 10-digit mobile number')
      return
    }
    setError('')
    setLoading(true)
    try {
      await axios.post(`${API_URL}/api/auth/send-otp`, { mobile_number: mobile }, { withCredentials: true })
      setOtpSent(true)
      setStep('otp')
      setOtpCode('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to send OTP'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    const mobile = mobile_number.replace(/\D/g, '').slice(-10)
    const otp = otp_code.trim()
    if (mobile.length !== 10 || otp.length < 4) {
      setError('Enter the 6-digit OTP')
      return
    }
    setError('')
    setLoading(true)
    try {
      await axios.post(
        `${API_URL}/api/auth/verify-otp`,
        { mobile_number: mobile, otp_code: otp },
        { withCredentials: true }
      )
      handleClose()
      const target = returnTo || pathname || '/'
      if (target.startsWith('/')) {
        window.location.href = target
      } else {
        window.location.href = '/'
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Invalid OTP'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    const target = returnTo || pathname || '/'
    const safeReturnTo = target.startsWith('/') ? target : '/'
    const url = `${API_URL}/auth/google?returnTo=${encodeURIComponent(safeReturnTo)}`
    window.location.href = url
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 text-slate-100 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] sm:w-auto">
        <DialogHeader>
          <DialogTitle className="text-yellow-500 text-lg">Sign In</DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            Sign in to access cart, checkout, and Book Rate
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 'choose' && (
            <>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-600 bg-slate-800/50 hover:bg-slate-800 text-slate-200 font-medium transition-colors"
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
                  onClick={() => setStep('mobile')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors"
                >
                  <Smartphone className="size-5" />
                  Sign in with Mobile OTP
                </button>
              </div>
            </>
          )}

          {step === 'mobile' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Mobile Number</label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={mobile_number}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-base"
                  maxLength={10}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-red-400 break-words" role="alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setStep('choose'); setError(''); }}
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSendOtp}
                  disabled={loading || mobile_number.replace(/\D/g, '').length !== 10}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  {loading ? 'Sending…' : 'Get OTP'}
                </Button>
              </div>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                OTP sent to +91 {mobile_number.replace(/\D/g, '').slice(-10)}
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Enter 6-digit OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={otp_code}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-center text-xl tracking-[0.5em] font-mono"
                  maxLength={6}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-red-400 break-words" role="alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setStep('mobile'); setError(''); setOtpCode(''); }}
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  Change Number
                </Button>
                <Button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp_code.length < 4}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  {loading ? 'Verifying…' : 'Verify & Login'}
                </Button>
              </div>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading}
                className="w-full text-sm text-amber-400 hover:text-amber-300"
              >
                Resend OTP
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
