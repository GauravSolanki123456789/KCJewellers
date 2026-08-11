'use client'

import { useRef, useState } from 'react'
import axios from '@/lib/axios'
import { Camera, Loader2, Mic, Square, Trash2, Upload } from 'lucide-react'
import { erpBtnGhost, erpErr } from '@/components/reseller/erp/erp-ui'

type Props = {
  billId: number
  lineKey?: string | null
  imageUrls: string[]
  voiceNoteUrl?: string | null
  onUpdated: () => Promise<void>
  compact?: boolean
}

export function ErpOrderMediaControls({
  billId,
  lineKey,
  imageUrls,
  voiceNoteUrl,
  onUpdated,
  compact,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const voiceFileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const uploadFile = async (file: File, kind: 'image' | 'voice') => {
    setBusy(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      fd.append('scope', lineKey ? 'line' : 'order')
      if (lineKey) fd.append('line_key', lineKey)
      await axios.post(`/api/reseller/erp/order-jobs/bill/${billId}/media`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await onUpdated()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const removeMedia = async (url: string, kind: 'image' | 'voice') => {
    if (!window.confirm('Remove this attachment?')) return
    setBusy(true)
    setErr('')
    try {
      await axios.delete(`/api/reseller/erp/order-jobs/bill/${billId}/media`, {
        data: { url, kind, scope: lineKey ? 'line' : 'order', line_key: lineKey || undefined },
      })
      await onUpdated()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const startRecording = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type })
        await uploadFile(file, 'voice')
        setRecording(false)
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      setErr('Microphone access denied or not available.')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  return (
    <div className={`space-y-2 ${compact ? '' : 'rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3'}`}>
      {!compact ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          Photos & voice
        </p>
      ) : null}

      {imageUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="size-16 rounded-lg border border-[var(--color-slate-700,#e8e4df)] object-cover sm:size-20"
              />
              <button
                type="button"
                className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-1 text-white shadow"
                onClick={() => void removeMedia(url, 'image')}
                disabled={busy}
                aria-label="Remove photo"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {voiceNoteUrl ? (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--color-slate-900,#faf8f4)] px-2 py-1.5">
          <audio controls src={voiceNoteUrl} className="h-8 max-w-full flex-1" />
          <button
            type="button"
            className="p-1 text-rose-600"
            onClick={() => void removeMedia(voiceNoteUrl, 'voice')}
            disabled={busy}
            aria-label="Remove voice note"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void uploadFile(f, 'image')
            e.target.value = ''
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void uploadFile(f, 'image')
            e.target.value = ''
          }}
        />
        <input
          ref={voiceFileRef}
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void uploadFile(f, 'voice')
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className={`${erpBtnGhost} min-h-[40px] px-3 text-xs`}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          Photo
        </button>
        <button
          type="button"
          className={`${erpBtnGhost} min-h-[40px] px-3 text-xs`}
          disabled={busy}
          onClick={() => galleryRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Gallery
        </button>
        {!voiceNoteUrl ? (
          recording ? (
            <button
              type="button"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-800"
              onClick={() => stopRecording()}
            >
              <Square className="size-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`${erpBtnGhost} min-h-[40px] px-3 text-xs`}
                disabled={busy}
                onClick={() => void startRecording()}
              >
                <Mic className="size-3.5" />
                Record
              </button>
              <button
                type="button"
                className={`${erpBtnGhost} min-h-[40px] px-3 text-xs`}
                disabled={busy}
                onClick={() => voiceFileRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Upload audio
              </button>
            </>
          )
        ) : null}
      </div>
      {err ? <p className="text-xs text-rose-700">{err}</p> : null}
    </div>
  )
}
