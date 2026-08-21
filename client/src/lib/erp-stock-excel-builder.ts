/**
 * Build a stock upload Excel from form defaults + row count (client-side).
 * Barcodes are NOT included — generated on server when the file is uploaded.
 */
export type StockExcelBuilderDefaults = {
  sku?: string
  style_code?: string
  product_name?: string
  item_code?: string
  size?: string
  avg_weight?: string | number
  gross_weight?: string | number
  bag_wt?: string | number
  purity?: string | number
  wastage_pct?: string | number
  mc_rate?: string | number
  mc_rate_slab_r?: string | number
  mc_rate_slab_w?: string | number
  mc_rate_slab_f?: string | number
  metal_slab_r_pct?: string | number
  metal_slab_w_pct?: string | number
  metal_slab_f_pct?: string | number
  mc_type?: string
  pcs?: string | number
  box_charges?: string | number
  stone_charges?: string | number
  stone_wt?: string | number
  metal_type?: string
  image_url?: string
  attr_color?: string
  attr_stone?: string
  fixed_price?: string | number
  chain_wt_only?: string | number
  pendant_wt_only?: string | number
  earring_wt_only?: string | number
  bags?: string
}

export type StockExcelBuilderBlock = {
  defaults: StockExcelBuilderDefaults
  rowCount: number
}

const HEADERS = [
  'SKU',
  'StyleCode',
  'ProductName',
  'Size',
  'AvgWeight',
  'Purity',
  'Wastage(%)',
  'MCRate',
  'MetalSlabR%',
  'MCRateSlabR',
  'MetalSlabW%',
  'MCRateSlabW',
  'MetalSlabF%',
  'MCRateSlabF',
  'MCType',
  'PCS',
  'BoxCharges',
  'StoneCharges',
  'StoneWt',
  'MetalType',
  'ItemCode',
  'ImageUrl',
  'Attr:Color',
  'Attr:Stone',
  'FixedPrice',
  'Gross',
  'ChainWtOnly',
  'PendantWtOnly',
  'EarringWtOnly',
  'Bags',
  'BagWt',
] as const

function cell(v: string | number | undefined | null): string | number | '' {
  if (v == null || v === '') return ''
  return v
}

function rowFromDefaults(defaults: StockExcelBuilderDefaults): Record<string, string | number> {
  return {
    SKU: cell(defaults.sku),
    StyleCode: cell(defaults.style_code),
    ProductName: cell(defaults.product_name),
    Size: cell(defaults.size),
    AvgWeight: cell(defaults.avg_weight),
    Purity: cell(defaults.purity),
    'Wastage(%)': cell(defaults.wastage_pct),
    MCRate: cell(defaults.mc_rate),
    'MetalSlabR%': cell(defaults.metal_slab_r_pct),
    MCRateSlabR: cell(defaults.mc_rate_slab_r),
    'MetalSlabW%': cell(defaults.metal_slab_w_pct),
    MCRateSlabW: cell(defaults.mc_rate_slab_w),
    'MetalSlabF%': cell(defaults.metal_slab_f_pct),
    MCRateSlabF: cell(defaults.mc_rate_slab_f),
    MCType: cell(defaults.mc_type) || 'MC/GM',
    PCS: cell(defaults.pcs) || 1,
    BoxCharges: cell(defaults.box_charges),
    StoneCharges: cell(defaults.stone_charges),
    StoneWt: cell(defaults.stone_wt),
    MetalType: cell(defaults.metal_type) || 'SILVER',
    ItemCode: cell(defaults.item_code) || cell(defaults.product_name),
    ImageUrl: cell(defaults.image_url),
    'Attr:Color': cell(defaults.attr_color),
    'Attr:Stone': cell(defaults.attr_stone),
    FixedPrice: cell(defaults.fixed_price),
    Gross: cell(defaults.gross_weight),
    ChainWtOnly: cell(defaults.chain_wt_only),
    PendantWtOnly: cell(defaults.pendant_wt_only),
    EarringWtOnly: cell(defaults.earring_wt_only),
    Bags: cell(defaults.bags),
    BagWt: cell(defaults.bag_wt),
  }
}

export function buildStockExcelArrayBuffer(blocks: StockExcelBuilderBlock[]): ArrayBuffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const rows: Record<string, string | number>[] = []

  for (const block of blocks) {
    const n = Math.max(1, Math.min(500, Math.floor(block.rowCount) || 1))
    for (let i = 0; i < n; i++) {
      rows.push(rowFromDefaults(block.defaults))
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

export function downloadStockExcelBuilderFile(blocks: StockExcelBuilderBlock[], filename: string): void {
  const buf = buildStockExcelArrayBuffer(blocks)
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** Backward-compatible single-block helper */
export function downloadStockExcelBuilderSingle(
  defaults: StockExcelBuilderDefaults,
  rowCount: number,
  filename: string,
): void {
  downloadStockExcelBuilderFile([{ defaults, rowCount }], filename)
}
