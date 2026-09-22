/**
 * Bundle shared ERP billing utilities into exhibition-kit/billing-core.js (IIFE).
 */
import * as esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.join(__dirname, '..')
const entry = path.join(clientRoot, 'src/lib/exhibition/exhibition-billing-bundle.ts')
const outfile = path.join(clientRoot, 'public/exhibition-kit/billing-core.js')

const banner = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Run: npm run build:exhibition-billing (or npm run build in client/)
 * Source: src/lib/exhibition/exhibition-billing-bundle.ts
 */\n`

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: 'KcExhibitionBillingModule',
  outfile,
  banner: { js: banner },
  platform: 'browser',
  target: ['es2020'],
  tsconfig: path.join(clientRoot, 'tsconfig.json'),
  alias: {
    '@': path.join(clientRoot, 'src'),
  },
  footer: {
    js: 'if(typeof window!=="undefined"&&window.KcExhibitionBillingModule){window.KcExhibitionBilling=window.KcExhibitionBillingModule.KcExhibitionBilling||window.KcExhibitionBillingModule;}',
  },
  logLevel: 'info',
})

const stat = fs.statSync(outfile)
if (!stat.size) {
  throw new Error('billing-core.js build produced empty file')
}

console.log(`Wrote ${outfile} (${Math.round(stat.size / 1024)} KB)`)
