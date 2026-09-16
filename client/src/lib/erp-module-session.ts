/** Persist ERP module UI state across tab switches (sessionStorage). */

export type ErpModuleSessionId =
  | 'design-master'
  | 'products'
  | 'customers'
  | 'estimations'
  | 'sales-bills'
  | 'floors'
  | 'shadow'
  | 'hardware'
  | 'print-formats'
  | 'orders'
  | 'rol'
  | 'tag-split'
  | 'stock-report'
  | 'offline'
  | 'sales-return'
  | 'credit-bills'
  | 'debit-notes'
  | 'jainav-ledger'
  | 'jainav-bills'

export function erpModuleSessionKey(moduleId: ErpModuleSessionId | string): string {
  return `kc-erp-module-${moduleId}-v1`
}

export function loadErpModuleSession<T>(moduleId: ErpModuleSessionId | string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(erpModuleSessionKey(moduleId))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveErpModuleSession(moduleId: ErpModuleSessionId | string, data: unknown): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(erpModuleSessionKey(moduleId), JSON.stringify(data))
  } catch {
    /* ignore quota */
  }
}

export function clearErpModuleSession(moduleId: ErpModuleSessionId | string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(erpModuleSessionKey(moduleId))
}
