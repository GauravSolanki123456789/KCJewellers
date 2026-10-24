import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import type { CustomerAccountData } from '@/components/reseller/erp/ErpCustomerAccountPanel'
import { formatLedgerTransactionKind, formatPdfInr } from '@/lib/erp-ledger-labels'
import { formatMetalGm, metalBalanceHint, formatLedgerDebitCell, formatLedgerBalanceCell, formatLedgerVirtualMetalCredit, formatMetalBalanceCell, type LedgerCellFormatOpts } from '@/lib/erp-ledger-metal'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { sanitizePdfText } from '@/lib/pdf-text-utils'

function pdfLedgerDescription(raw: string): string {
  return String(raw || '')
    .replace(/\u00b9/g, '')
    .replace(/₹/g, 'Rs. ')
    .replace(/\s*[—–-]\s*₹?\s*offset only.*$/gi, '')
    .replace(/\s*offset only.*$/gi, '')
    .trim()
}

export type CustomerAccountPdfMeta = {
  shopName: string
  /** ISO yyyy-mm-dd or already formatted */
  fromDate?: string | null
  toDate?: string | null
  /** Single-day filter (ISO) */
  onDate?: string | null
  /** Lane ledger or shop “Ledger in metal”: split ₹ / metal columns in PDF. */
  laneLedger?: boolean
}

function pdfDateLabel(isoOrDisplay: string | null | undefined): string {
  if (!isoOrDisplay) return '—'
  const s = String(isoOrDisplay).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatErpDateDdMmYyyy(s)
  return s
}

function ledgerPeriodLabel(meta: CustomerAccountPdfMeta): string {
  if (meta.onDate) {
    const d = pdfDateLabel(meta.onDate)
    return `from ${d} to ${d}`
  }
  const from = pdfDateLabel(meta.fromDate)
  const to = pdfDateLabel(meta.toDate)
  if (from !== '—' && to !== '—') return `from ${from} to ${to}`
  if (from !== '—') return `from ${from}`
  if (to !== '—') return `to ${to}`
  return ''
}

const BORDER = '#1a1814'

const styles = StyleSheet.create({
  page: { padding: 28, paddingBottom: 36, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1814' },
  shopName: { fontSize: 14, fontWeight: 'bold', marginBottom: 6, textAlign: 'center', color: '#1a1814' },
  title: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, textAlign: 'center', color: '#1a1814' },
  sub: { fontSize: 9, color: '#444', marginBottom: 12, textAlign: 'center' },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 90, fontWeight: 'bold', color: '#1a1814' },
  tableOuter: {
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f7f4ef',
  },
  tableRow: { flexDirection: 'row' },
  th: {
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 3,
    fontSize: 7,
    fontWeight: 'bold',
    color: '#1a1814',
  },
  td: {
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7,
    color: '#1a1814',
  },
  tdRight: { textAlign: 'right' },
  lastCol: { borderRightWidth: 0 },
  c1: { width: '12%' },
  c2: { width: '11%' },
  c3: { width: '12%' },
  c4: { width: '21%' },
  cW: { width: '10%' },
  c5: { width: '11%' },
  c6: { width: '11%' },
  c7: { width: '12%' },
  c8: { width: '10%' },
})

function LedgerStatementDocument({
  account,
  meta,
}: {
  account: CustomerAccountData
  meta: CustomerAccountPdfMeta
}) {
  const shop = sanitizePdfText(meta.shopName || 'Shop')
  const customer = sanitizePdfText(account.customer.name || 'Customer')
  const period = ledgerPeriodLabel(meta)
  const headline = period
    ? `Ledger of ${customer} ${period}`
    : `Ledger of ${customer}`
  const laneFmt: LedgerCellFormatOpts = {
    pdfSafe: true,
    laneLedger: !!meta.laneLedger,
    splitMetalColumn: !!meta.laneLedger,
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.shopName}>{shop.toUpperCase()}</Text>
        <Text style={styles.title}>{headline}</Text>
        {account.customer.mobile ? (
          <Text style={styles.sub}>Mobile: {account.customer.mobile}</Text>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>Balance due</Text>
          <Text>{formatPdfInr(account.summary.balance_due_inr)}</Text>
        </View>
        {account.summary.metal_balance_gm != null && Math.abs(account.summary.metal_balance_gm) >= 0.0005 ? (
          <View style={styles.row}>
            <Text style={styles.label}>Metal</Text>
            <Text>
              {formatMetalGm(account.summary.metal_balance_gm)} ({metalBalanceHint(account.summary.metal_balance_gm)})
            </Text>
          </View>
        ) : null}
        {account.summary.has_gold_metal ? (
          <View style={styles.row}>
            <Text style={styles.label}>Gold metal</Text>
            <Text>
              {formatMetalGm(account.summary.gold_metal_balance_gm)} (
              {metalBalanceHint(account.summary.gold_metal_balance_gm || 0)})
            </Text>
          </View>
        ) : null}
        <View style={styles.tableOuter}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.th, styles.c1]}>Date</Text>
            <Text style={[styles.th, styles.c2]}>Type</Text>
            <Text style={[styles.th, styles.c3]}>Ref</Text>
            <Text style={[styles.th, styles.c4]}>Description</Text>
            <Text style={[styles.th, styles.cW, styles.tdRight]}>Weight</Text>
            <Text style={[styles.th, styles.c5, styles.tdRight]}>Debit</Text>
            <Text style={[styles.th, styles.c6, styles.tdRight]}>Credit</Text>
            <Text
              style={[styles.th, styles.c7, styles.tdRight, ...(meta.laneLedger ? [] : [styles.lastCol])]}
            >
              Balance
            </Text>
            {meta.laneLedger ? (
              <Text style={[styles.th, styles.c8, styles.tdRight, styles.lastCol]}>Metal bal.</Text>
            ) : null}
          </View>
          {account.transactions.map((t, i) => (
            <View key={`${t.ref}-${i}`} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, styles.c1]}>{pdfDateLabel(t.date)}</Text>
              <Text style={[styles.td, styles.c2]}>{formatLedgerTransactionKind(t.kind)}</Text>
              <Text style={[styles.td, styles.c3]}>{t.ref || '—'}</Text>
              <Text style={[styles.td, styles.c4]}>{pdfLedgerDescription(t.description)}</Text>
              <Text style={[styles.td, styles.cW, styles.tdRight]}>
                {t.weight_gm && t.weight_gm > 0 ? `${t.weight_gm.toFixed(3)} g` : '—'}
              </Text>
              <Text style={[styles.td, styles.c5, styles.tdRight]}>{formatLedgerDebitCell(t, laneFmt)}</Text>
              <Text style={[styles.td, styles.c6, styles.tdRight]}>
                {formatLedgerVirtualMetalCredit(
                  {
                    virtual_metal_inr: t.virtual_metal_inr,
                    virtual_metal_show_inr_credit: t.virtual_metal_show_inr_credit,
                    credit: t.credit,
                    weight_gm: t.weight_gm,
                    credit_metal_gm: t.credit_metal_gm,
                  },
                  laneFmt,
                )}
              </Text>
              <Text style={[styles.td, styles.c7, styles.tdRight, ...(meta.laneLedger ? [] : [styles.lastCol])]}>
                {formatLedgerBalanceCell(t.balance_inr, t.balance_metal_gm, laneFmt)}
              </Text>
              {meta.laneLedger ? (
                <Text style={[styles.td, styles.c8, styles.tdRight, styles.lastCol]}>
                  {formatMetalBalanceCell(t.balance_metal_gm)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

export async function downloadCustomerAccountPdf(
  account: CustomerAccountData,
  meta: CustomerAccountPdfMeta,
) {
  const blob = await pdf(<LedgerStatementDocument account={account} meta={meta} />).toBlob()
  const fname = `ledger-${account.customer.name.replace(/\W+/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`
  await presentPdfBlob(blob, fname, {
    title: meta.shopName ? `${meta.shopName} — customer ledger` : 'Customer ledger',
    text: fname,
    customerMobile: account.customer.mobile ?? null,
  })
}

export type DaybookExportData = {
  date: string
  lane_view?: boolean
  /** Shop “Ledger in metal” (official day book). */
  metal_view?: boolean
  summary: {
    received_inr?: number
    paid_out_inr?: number
    net_inr?: number
    total_debit_inr?: number
    total_credit_inr?: number
    closing_balance_inr?: number
    total_debit_metal_gm?: number
    total_credit_metal_gm?: number
    closing_balance_metal_gm?: number
    transaction_count: number
  }
  transactions: {
    entry_date: string
    kind: string
    customer_name: string
    payment_mode: string
    reference: string
    amount_inr?: number
    debit_inr?: number
    credit_inr?: number
    balance_inr?: number
    debit_metal_gm?: number
    credit_metal_gm?: number
    balance_metal_gm?: number
    weight_gm?: number
    description?: string
    source?: string
    metal_ledger_mode?: boolean
    shadow_bill_id?: number | null
  }[]
}

function DaybookTableRows({ data }: { data: DaybookExportData }) {
  const metalSplit = !!(data.lane_view || data.metal_view)
  const dayFmt: LedgerCellFormatOpts = {
    pdfSafe: true,
    laneLedger: metalSplit,
    splitMetalColumn: metalSplit,
  }
  return (
    <View style={styles.tableOuter}>
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, styles.c1]}>Date</Text>
        <Text style={[styles.th, styles.c2]}>Type</Text>
        <Text style={[styles.th, styles.c3]}>Party</Text>
        <Text style={[styles.th, styles.c4]}>Reference</Text>
        <Text style={[styles.th, styles.c5, styles.tdRight]}>Debit</Text>
        <Text style={[styles.th, styles.c6, styles.tdRight]}>Credit</Text>
        <Text style={[styles.th, styles.c7, styles.tdRight, ...(metalSplit ? [] : [styles.lastCol])]}>
          Balance
        </Text>
        {metalSplit ? (
          <Text style={[styles.th, styles.c8, styles.tdRight, styles.lastCol]}>Metal bal.</Text>
        ) : null}
      </View>
      {data.transactions.map((t, i) => (
        <View key={`${t.reference}-${i}`} style={styles.tableRow} wrap={false}>
          <Text style={[styles.td, styles.c1]}>{t.entry_date}</Text>
          <Text style={[styles.td, styles.c2]}>{formatLedgerTransactionKind(t.kind)}</Text>
          <Text style={[styles.td, styles.c3]}>{t.customer_name}</Text>
          <Text style={[styles.td, styles.c4]}>{t.reference || '—'}</Text>
          <Text style={[styles.td, styles.c5, styles.tdRight]}>
            {formatLedgerDebitCell(
              {
                debit_inr: t.debit_inr,
                debit_metal_gm: t.debit_metal_gm,
                weight_gm: t.weight_gm,
                source: t.source,
                rupee_only_debit: (t as { rupee_only_debit?: boolean }).rupee_only_debit,
                metal_ledger_mode: t.metal_ledger_mode,
                shadow_bill_id: t.shadow_bill_id,
                kind: t.kind,
              },
              dayFmt,
            )}
          </Text>
          <Text style={[styles.td, styles.c6, styles.tdRight]}>
            {formatLedgerVirtualMetalCredit(
              {
                credit: t.credit_inr,
                credit_metal_gm: t.credit_metal_gm,
                weight_gm: t.weight_gm,
              },
              dayFmt,
            )}
          </Text>
          <Text style={[styles.td, styles.c7, styles.tdRight, ...(metalSplit ? [] : [styles.lastCol])]}>
            {formatLedgerBalanceCell(t.balance_inr, t.balance_metal_gm, dayFmt)}
          </Text>
          {metalSplit ? (
            <Text style={[styles.td, styles.c8, styles.tdRight, styles.lastCol]}>
              {formatMetalBalanceCell(t.balance_metal_gm)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function DaybookDocument({ data }: { data: DaybookExportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Day book</Text>
        <Text style={styles.sub}>
          {data.date}
          {data.lane_view ? ' (lane ledger)' : data.metal_view ? ' (metal ledger)' : ''}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Total debit</Text>
          <Text>{formatPdfInr(data.summary.total_debit_inr ?? 0)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total credit</Text>
          <Text>{formatPdfInr(data.summary.total_credit_inr ?? 0)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Closing balance</Text>
          <Text>{formatPdfInr(data.summary.closing_balance_inr ?? 0)}</Text>
        </View>
        <DaybookTableRows data={data} />
      </Page>
    </Document>
  )
}

export async function downloadDaybookPdf(data: DaybookExportData) {
  const blob = await pdf(<DaybookDocument data={data} />).toBlob()
  const fname = `daybook-${data.date}${data.lane_view ? '-lane' : ''}.pdf`
  await presentPdfBlob(blob, fname, {
    title: 'Day book',
    text: fname,
    customerMobile: null,
  })
}
