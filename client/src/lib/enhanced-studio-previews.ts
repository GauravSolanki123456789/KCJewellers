/** Preview metadata for Style · background colour swatches. */
export const BACKGROUND_PREVIEW: Record<
  string,
  { label: string; gradient: string; surface?: string }
> = {
  charcoal: {
    label: 'Charcoal',
    gradient: 'linear-gradient(160deg, #3d4451 0%, #1a2030 45%, #0f141c 100%)',
  },
  black: {
    label: 'Black',
    gradient: 'linear-gradient(180deg, #2a2a2a 0%, #000000 100%)',
  },
  white: {
    label: 'White',
    gradient: 'linear-gradient(180deg, #ffffff 0%, #f4f4f4 100%)',
    surface: '#ffffff',
  },
  blue: {
    label: 'Navy',
    gradient: 'linear-gradient(160deg, #1e3a5f 0%, #152238 50%, #0a1220 100%)',
  },
  red: {
    label: 'Burgundy',
    gradient: 'linear-gradient(160deg, #6b1a2a 0%, #4a1018 50%, #2a0810 100%)',
  },
  emerald: {
    label: 'Emerald',
    gradient: 'linear-gradient(160deg, #1a4a32 0%, #123020 50%, #081810 100%)',
  },
  cream: {
    label: 'Cream',
    gradient: 'linear-gradient(180deg, #faf6ef 0%, #ebe3d6 100%)',
    surface: '#f5efe6',
  },
}

export const VISUALIZATION_PREVIEW: Record<
  string,
  { label: string; hint: string }
> = {
  studio: { label: 'Studio', hint: 'Classic pedestal / tabletop' },
  prop: { label: 'On prop', hint: 'Luxury display stand' },
  hand_female: { label: 'Female hand', hint: 'Editorial wear shot' },
  hand_male: { label: 'Male hand', hint: 'Editorial wear shot' },
  standing: { label: 'Standing', hint: 'Upright display' },
  sleeping: { label: 'Flat lay', hint: 'Sleeping / flat position' },
  mixed_bangles: { label: 'Pair layout', hint: 'One up, one flat' },
}

export function studioPreviewLabel(backgroundPreset: string, visualization: string): string {
  const bg = BACKGROUND_PREVIEW[backgroundPreset]?.label || backgroundPreset
  const viz = VISUALIZATION_PREVIEW[visualization]?.label || visualization
  return `${bg} · ${viz}`
}

export function backgroundPreviewStyle(preset: string): { background: string } {
  const p = BACKGROUND_PREVIEW[preset] || BACKGROUND_PREVIEW.charcoal
  return { background: p.gradient }
}

export const BACKGROUND_SWATCH_KEYS = Object.keys(BACKGROUND_PREVIEW)
export const VISUALIZATION_KEYS = Object.keys(VISUALIZATION_PREVIEW)
