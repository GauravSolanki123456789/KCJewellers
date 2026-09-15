'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import {
  completeWhatsAppEmbeddedSignup,
  fetchWhatsAppEmbeddedSignupConfig,
  type WhatsAppEmbeddedSignupConfig,
} from '@/lib/erp-whatsapp-cloud'

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void
      login: (
        cb: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>,
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

type EmbeddedSignupMessage = {
  type?: string
  event?: string
  data?: {
    phone_number_id?: string
    waba_id?: string
    current_step?: string
  }
}

function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.FB) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version: 'v21.0' })
      resolve()
    }
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onerror = () => reject(new Error('Could not load Meta SDK'))
    document.body.appendChild(script)
  })
}

export function WhatsAppEmbeddedSignupButton({
  onConnected,
}: {
  onConnected?: () => void | Promise<void>
}) {
  const [config, setConfig] = useState<WhatsAppEmbeddedSignupConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<EmbeddedSignupMessage | null>(null)

  useEffect(() => {
    void fetchWhatsAppEmbeddedSignupConfig().then(setConfig)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string' && typeof event.data !== 'object') return
      let payload: EmbeddedSignupMessage | null = null
      try {
        payload =
          typeof event.data === 'string'
            ? (JSON.parse(event.data) as EmbeddedSignupMessage)
            : (event.data as EmbeddedSignupMessage)
      } catch {
        return
      }
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return
      sessionRef.current = payload
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const connect = useCallback(async () => {
    if (!config?.available || !config.appId || !config.configId) {
      setError('Connect is not available — use shop credentials below.')
      return
    }
    setBusy(true)
    setError(null)
    sessionRef.current = null
    try {
      await loadFacebookSdk(config.appId)
      await new Promise<void>((resolve, reject) => {
        window.FB?.login(
          (response) => {
            void (async () => {
              try {
                const code = response.authResponse?.code
                const session = sessionRef.current
                const phoneNumberId = session?.data?.phone_number_id
                const wabaId = session?.data?.waba_id
                if (!code) throw new Error('Meta signup was cancelled')
                if (!phoneNumberId) {
                  throw new Error('Phone number ID missing — finish all Meta steps and try again')
                }
                await completeWhatsAppEmbeddedSignup({
                  code,
                  phoneNumberId,
                  wabaId,
                  event: session?.event,
                })
                await onConnected?.()
                resolve()
              } catch (e) {
                reject(e)
              }
            })()
          },
          {
            config_id: config.configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: config.featureType || 'whatsapp_business_app_onboarding',
              sessionInfoVersion: '3',
            },
          },
        )
      })
    } catch (e) {
      setError((e as Error).message || 'WhatsApp connect failed')
    } finally {
      setBusy(false)
    }
  }, [config, onConnected])

  if (!config?.available) return null

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void connect()}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
        Connect my shop WhatsApp
      </button>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  )
}
