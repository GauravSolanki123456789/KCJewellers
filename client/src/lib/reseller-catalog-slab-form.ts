import type { ResellerSlabSettings, ResellerSlabTierSettings } from '@/lib/catalog-slab-pricing'

export type SlabTierForm = {
  mc_discount_pct: string
  mc_gm_discount_pct: string
  gift_discount_pct: string
  silver_rate_offset_per_g: string
  gold_rate_offset_per_g: string
  wastage_discount_pct: string
  margin_pct: string
}

export type ResellerSlabFormState = {
  slab_r: SlabTierForm
  slab_w: SlabTierForm
  slab_f: SlabTierForm
  gold_slab_r: SlabTierForm
  gold_slab_w: SlabTierForm
  gold_slab_f: SlabTierForm
}

export const emptySlabTierForm = (): SlabTierForm => ({
  mc_discount_pct: '0',
  mc_gm_discount_pct: '0',
  gift_discount_pct: '0',
  silver_rate_offset_per_g: '0',
  gold_rate_offset_per_g: '0',
  wastage_discount_pct: '0',
  margin_pct: '0',
})

export const emptyResellerSlabForm = (): ResellerSlabFormState => ({
  slab_r: emptySlabTierForm(),
  slab_w: emptySlabTierForm(),
  slab_f: emptySlabTierForm(),
  gold_slab_r: emptySlabTierForm(),
  gold_slab_w: emptySlabTierForm(),
  gold_slab_f: emptySlabTierForm(),
})

export function slabTierFormFromSettings(t?: ResellerSlabTierSettings): SlabTierForm {
  return {
    mc_discount_pct: String(t?.mc_discount_pct ?? 0),
    mc_gm_discount_pct: String(t?.mc_gm_discount_pct ?? 0),
    gift_discount_pct: String(t?.gift_discount_pct ?? 0),
    silver_rate_offset_per_g: String(t?.silver_rate_offset_per_g ?? 0),
    gold_rate_offset_per_g: String(t?.gold_rate_offset_per_g ?? 0),
    wastage_discount_pct: String(t?.wastage_discount_pct ?? 0),
    margin_pct: String(t?.margin_pct ?? 0),
  }
}

export function resellerSlabFormFromSettings(settings?: ResellerSlabSettings | null): ResellerSlabFormState {
  const parsed = settings || {}
  return {
    slab_r: slabTierFormFromSettings(parsed.slab_r),
    slab_w: slabTierFormFromSettings(parsed.slab_w),
    slab_f: slabTierFormFromSettings(parsed.slab_f),
    gold_slab_r: slabTierFormFromSettings(parsed.gold_slab_r),
    gold_slab_w: slabTierFormFromSettings(parsed.gold_slab_w),
    gold_slab_f: slabTierFormFromSettings(parsed.gold_slab_f),
  }
}

function tierFromForm(t: SlabTierForm): ResellerSlabTierSettings {
  return {
    mc_discount_pct: Math.max(0, Math.min(100, Number(t.mc_discount_pct) || 0)),
    mc_gm_discount_pct: Math.max(0, Math.min(100, Number(t.mc_gm_discount_pct) || 0)),
    gift_discount_pct: Math.max(0, Math.min(100, Number(t.gift_discount_pct) || 0)),
    silver_rate_offset_per_g: Math.max(0, Number(t.silver_rate_offset_per_g) || 0),
    gold_rate_offset_per_g: Math.max(0, Number(t.gold_rate_offset_per_g) || 0),
    wastage_discount_pct: Math.max(0, Math.min(100, Number(t.wastage_discount_pct) || 0)),
    margin_pct: Math.max(0, Math.min(1000, Number(t.margin_pct) || 0)),
  }
}

export function resellerSlabSettingsFromForm(form: ResellerSlabFormState): ResellerSlabSettings {
  return {
    slab_r: tierFromForm(form.slab_r),
    slab_w: tierFromForm(form.slab_w),
    slab_f: tierFromForm(form.slab_f),
    gold_slab_r: tierFromForm(form.gold_slab_r),
    gold_slab_w: tierFromForm(form.gold_slab_w),
    gold_slab_f: tierFromForm(form.gold_slab_f),
  }
}

/** Slab R margin % applied on the reseller custom-domain storefront catalog. */
export function storefrontMarginFromSlabSettings(settings?: ResellerSlabSettings | null): number {
  const m = Number(settings?.slab_r?.margin_pct)
  if (!Number.isFinite(m) || m <= 0) return 0
  return Math.min(1000, m)
}
