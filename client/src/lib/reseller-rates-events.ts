/** Fired after reseller staff saves rates — catalog, cart, and Live Rates refetch. */
export const KC_RATES_UPDATED_EVENT = 'kc-rates-updated'

export function dispatchRatesUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(KC_RATES_UPDATED_EVENT))
}
