/**
 * TSC 3-across tiling — coordinates come from the PRN, JS only shifts X by COLUMN_PITCH.
 * node scripts/test-tspl-multicolumn.js
 */
const assert = require('assert')
const erpPrint = require('./erp-print-templates')

const jewelry = erpPrint.DEFAULT_LABEL_PRN
assert.ok(!/^COLUMNS\b/m.test(jewelry), 'existing jewelry PRN must not gain COLUMNS')
const jewelryLayout = erpPrint.parseTsplMultiColumnLayout(jewelry)
assert.strictEqual(jewelryLayout.columns, 1)

const three = erpPrint.DEFAULT_LABEL_PRN_3ACROSS
const layout = erpPrint.parseTsplMultiColumnLayout(three)
assert.strictEqual(layout.columns, 3)
assert.ok(layout.columnPitchDots > 0)

function fillThreeTpl(tpl, barcode, name) {
  return tpl
    .replace(/\{\{barcode_short\}\}/g, barcode)
    .replace(/\{\{barcode\}\}/g, barcode)
    .replace(/\{\{product_name\}\}/g, name)
    .replace(/\{\{qr_code\}\}/g, barcode)
}
const a = fillThreeTpl(three, 'AAA', 'One')
const b = fillThreeTpl(three, 'BBB', 'Two')
const c = fillThreeTpl(three, 'CCC', 'Three')
const row = erpPrint.composeTsplMultiColumnRow([a, b, c], layout)
assert.ok(!/^COLUMNS\b/m.test(row), 'COLUMNS directive must be stripped before send')
assert.ok(!/COLUMN_PITCH/i.test(row))
assert.ok(row.includes('AAA'))
assert.ok(row.includes('BBB'))
assert.ok(row.includes('CCC'))
assert.ok((row.match(/^PRINT /m) || []).length === 1)

const jobs = erpPrint.batchRenderedPrnLabels([
  { tspl: a, template: three },
  { tspl: b, template: three },
  { tspl: c, template: three },
  { tspl: a, template: three },
])
assert.strictEqual(jobs.length, 2)
assert.strictEqual(jobs[0].items.length, 3)
assert.strictEqual(jobs[1].items.length, 1)

const forced = erpPrint.batchThreeAcrossLabelRows(
  [
    { tspl: a },
    { tspl: b },
    { tspl: c },
  ],
  three,
)
assert.strictEqual(forced.length, 1)
assert.strictEqual(forced[0].items.length, 3)
assert.ok((forced[0].tspl.match(/^PRINT /m) || []).length === 1)

const singleJobs = erpPrint.batchRenderedPrnLabels([{ tspl: jewelry, template: jewelry }])
assert.strictEqual(singleJobs.length, 1)
assert.ok(singleJobs[0].tspl.includes('SIZE 92.5 mm, 15 mm'))

const layoutOnly = erpPrint.resolveItemMultiColumnLayout({
  prnLayout: 'tsc-3across',
  template: '',
  tspl: a,
})
assert.strictEqual(layoutOnly.columns, 3)

const userTpl = `
COLUMNS 3
COLUMN_PITCH 34.7 mm
SIZE 104 mm, 22 mm
GAP 3 mm, 0 mm
CLS
TEXT 10,15,"ROMAN.TTF",0,1,8,"{{product_name}}"
TEXT 135,15,"ROMAN.TTF",0,1,8,"{{barcode}}"
PRINT 1,1
`.trim()
const u1 = userTpl.replace('{{product_name}}', 'A').replace('{{barcode}}', 'IDOLS-1')
const u2 = userTpl.replace('{{product_name}}', 'B').replace('{{barcode}}', 'IDOLS-2')
const u3 = userTpl.replace('{{product_name}}', 'C').replace('{{barcode}}', 'IDOLS-3')
const userRow = erpPrint.composeTsplMultiColumnRow([u1, u2, u3], erpPrint.parseTsplMultiColumnLayout(userTpl))
assert.ok(userRow.includes('IDOLS-1'))
assert.ok(userRow.includes('IDOLS-2'))
assert.ok(userRow.includes('IDOLS-3'))
assert.ok(!userRow.includes('{{'))

console.log('test-tspl-multicolumn: ok')
