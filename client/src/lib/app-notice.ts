export type AppNoticeTone = 'info' | 'error' | 'success'

type AlertHandler = (message: string, tone?: AppNoticeTone) => void
type ConfirmHandler = (message: string) => Promise<boolean>
type PromptHandler = (message: string, defaultValue?: string) => Promise<string | null>

let alertHandler: AlertHandler | null = null
let confirmHandler: ConfirmHandler | null = null
let promptHandler: PromptHandler | null = null
const pendingAlerts: Array<{ message: string; tone?: AppNoticeTone }> = []
let globalsInstalled = false

export function registerAppNotice(
  alert: AlertHandler,
  confirm: ConfirmHandler,
  prompt?: PromptHandler,
) {
  alertHandler = alert
  confirmHandler = confirm
  if (prompt) promptHandler = prompt
  if (pendingAlerts.length) {
    const queued = pendingAlerts.splice(0, pendingAlerts.length)
    for (const item of queued) alert(item.message, item.tone)
  }
  return () => {
    if (alertHandler === alert) alertHandler = null
    if (confirmHandler === confirm) confirmHandler = null
    if (promptHandler === prompt) promptHandler = null
  }
}

export function appAlert(message: unknown, tone: AppNoticeTone = 'info') {
  const text = String(message ?? '').trim() || 'Something went wrong.'
  if (alertHandler) {
    alertHandler(text, tone)
    return
  }
  pendingAlerts.push({ message: text, tone })
}

export function appConfirm(message: unknown): Promise<boolean> {
  const text = String(message ?? '').trim() || 'Are you sure?'
  if (confirmHandler) return confirmHandler(text)
  if (typeof window !== 'undefined') return Promise.resolve(window.confirm(text))
  return Promise.resolve(false)
}

export function appPrompt(message: unknown, defaultValue = ''): Promise<string | null> {
  const text = String(message ?? '').trim() || 'Enter a value'
  if (promptHandler) return promptHandler(text, defaultValue)
  if (typeof window !== 'undefined') {
    const v = window.prompt(text, defaultValue)
    return Promise.resolve(v == null ? null : v)
  }
  return Promise.resolve(null)
}

export function installAppNoticeGlobals() {
  if (typeof window === 'undefined' || globalsInstalled) return
  globalsInstalled = true
  window.alert = (message?: unknown) => {
    appAlert(message)
  }
}

export function compactErpDocNumber(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function erpDocNumbersMatch(a: string, b: string): boolean {
  const ca = compactErpDocNumber(a)
  const cb = compactErpDocNumber(b)
  return Boolean(ca && cb && ca === cb)
}
