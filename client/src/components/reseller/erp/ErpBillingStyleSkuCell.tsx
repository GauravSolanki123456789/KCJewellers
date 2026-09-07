'use client'

import type { DesignBillingStyle } from '@/lib/erp-billing-shortcuts'
import { uniqueSkusFromCatalog } from '@/lib/erp-billing-shortcuts'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'

type Props = {
  value: string
  placeholder: string
  options: string[]
  autoFocus?: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
  inputRef?: (el: HTMLInputElement | null) => void
}

export function ErpBillingStyleSkuCell(props: Props) {
  return <ErpBillingSuggestField {...props} />
}

export function styleOptionsForCatalog(catalog: DesignBillingStyle[], query: string): string[] {
  const q = query.trim().toUpperCase()
  const seen = new Set<string>()
  const codes: string[] = []
  for (const s of catalog) {
    const code = s.style_code.trim()
    const k = code.toUpperCase()
    if (!k || seen.has(k)) continue
    if (q && !k.includes(q)) continue
    seen.add(k)
    codes.push(code)
  }
  return codes
}

export function filterSkusForStyle(
  catalog: DesignBillingStyle[],
  styleCode: string,
  query: string,
): string[] {
  const unique = uniqueSkusFromCatalog(catalog)
  const style = styleCode.trim().toUpperCase()
  const scoped = style ? unique.filter((x) => x.style_code.toUpperCase() === style) : unique
  const source = scoped.length ? scoped : unique
  const q = query.trim().toUpperCase()
  const skus = source.map((s) => s.sku)
  if (!q) return skus
  return skus.filter((sku) => sku.toUpperCase().includes(q))
}
