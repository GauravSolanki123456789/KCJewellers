import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

const DRAFT_KEY = 'kc-erp-order-draft-v1'

export type ErpOrderDraft = {
  customerName: string
  notes: string
  lines: ErpBillLine[]
  freeTextLine: string
  tab: 'orders' | 'karigars'
}

const EMPTY_DRAFT: ErpOrderDraft = {
  customerName: '',
  notes: '',
  lines: [],
  freeTextLine: '',
  tab: 'orders',
}

export function loadErpOrderDraft(): ErpOrderDraft {
  if (typeof window === 'undefined') return { ...EMPTY_DRAFT }
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return { ...EMPTY_DRAFT }
    const parsed = JSON.parse(raw) as Partial<ErpOrderDraft>
    return {
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      freeTextLine: typeof parsed.freeTextLine === 'string' ? parsed.freeTextLine : '',
      tab: parsed.tab === 'karigars' ? 'karigars' : 'orders',
    }
  } catch {
    return { ...EMPTY_DRAFT }
  }
}

export function saveErpOrderDraft(draft: ErpOrderDraft): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* quota / private mode */
  }
}

export function clearErpOrderDraft(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
