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

const a = three.replace('{{barcode}}', 'AAA').replace('{{product_name}}', 'One')
const b = three.replace('{{barcode}}', 'BBB').replace('{{product_name}}', 'Two')
const c = three.replace('{{barcode}}', 'CCC').replace('{{product_name}}', 'Three')
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

const singleJobs = erpPrint.batchRenderedPrnLabels([{ tspl: jewelry, template: jewelry }])
assert.strictEqual(singleJobs.length, 1)
assert.ok(singleJobs[0].tspl.includes('SIZE 92.5 mm, 15 mm'))

console.log('test-tspl-multicolumn: ok')
