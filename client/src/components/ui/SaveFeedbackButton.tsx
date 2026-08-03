'use client'

import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  saving?: boolean
  saved?: boolean
  savingLabel?: string
  savedLabel?: string
  children: ReactNode
}

/** Primary save button — shows Saving… / Saved / default label. */
export default function SaveFeedbackButton({
  saving = false,
  saved = false,
  savingLabel = 'Saving…',
  savedLabel = 'Saved',
  children,
  disabled,
  className,
  type = 'button',
  ...rest
}: Props) {
  const label = saving ? savingLabel : saved ? savedLabel : children
  return (
    <button
      type={type}
      disabled={disabled || saving}
      className={cn(className, saved && !saving ? 'ring-2 ring-emerald-500/30' : undefined)}
      {...rest}
    >
      {saving ? <Loader2 className="inline size-4 animate-spin" aria-hidden /> : null}
      {label}
    </button>
  )
}
