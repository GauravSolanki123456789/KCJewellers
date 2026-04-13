import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', backgroundColor: '#020617', color: '#e2e8f0' },
  brand: { fontSize: 16, color: '#fbbf24', fontWeight: 'bold' },
  title: { fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 14 },
  meta: { fontSize: 8, color: '#64748b', marginBottom: 14 },
  row2: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  totalLabel: { fontSize: 9, color: '#94a3b8' },
  totalVal: { fontSize: 14, color: '#34d399', fontWeight: 'bold' },
  th: { fontSize: 7, color: '#64748b', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#1e293b', paddingVertical: 5 },
  td: { fontSize: 8, color: '#cbd5e1', paddingRight: 4 },
  subItem: { fontSize: 6.5, color: '#64748b', marginTop: 2 },
  col1: { width: '22%' },
  col2: { width: '30%', flexDirection: 'column', paddingRight: 4, justifyContent: 'center' },
  col3: { width: '12%', textAlign: 'right' },
  col4: { width: '14%', textAlign: 'right' },
  col5: { width: '22%', textAlign: 'right' },
  bankBox: { marginTop: 18, padding: 10, borderWidth: 1, borderColor: '#334155', borderRadius: 6, backgroundColor: '#0f172a' },
  bankH: { fontSize: 9, color: '#fbbf24', marginBottom: 6 },
  bankL: { fontSize: 8, color: '#94a3b8', marginBottom: 3 },
  foot: { marginTop: 14, fontSize: 7, color: '#475569', lineHeight: 1.4 },
})

export type ProformaLine = {
  barcode: string
  item_name: string
  sku?: string | null
  style_code?: string | null
  qty: number
  line_total: number
  net_wt_g: number | null
}

export type B2bBankDetailsPdf = {
  account_name: string
  bank_name: string
  account_number: string
  ifsc: string
  upi_id?: string
  notes?: string
}

export function B2bProformaPdfDocument({
  orderId,
  createdAt,
  checkoutLabel,
  lines,
  grandTotal,
  bank,
}: {
  orderId: number
  createdAt: string
  checkoutLabel: string
  lines: ProformaLine[]
  grandTotal: number
  bank: B2bBankDetailsPdf
}) {
  const hasBank = Boolean(
    bank.bank_name || bank.account_number || bank.ifsc || bank.account_name,
  )
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>KC Jewellers</Text>
        <Text style={styles.title}>Proforma invoice · B2B wholesale PO #{orderId}</Text>
        <Text style={styles.meta}>
          {createdAt} · {checkoutLabel} · Status: pending approval
        </Text>
        <View style={styles.row2}>
          <View>
            <Text style={styles.totalLabel}>Total (incl. GST, est.)</Text>
            <Text style={styles.totalVal}>₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
          </View>
        </View>
        <View style={{ ...styles.tr, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 4 }}>
          <Text style={[styles.th, styles.col1]}>Barcode / ID</Text>
          <View style={styles.col2}>
            <Text style={styles.th}>Item</Text>
          </View>
          <Text style={[styles.th, styles.col3]}>Wt (g)</Text>
          <Text style={[styles.th, styles.col4]}>Qty</Text>
          <Text style={[styles.th, styles.col5]}>Line</Text>
        </View>
        {lines.map((line, i) => (
          <View key={`${line.barcode}-${i}`} style={styles.tr} wrap={false}>
            <Text style={[styles.td, styles.col1]} hyphenationCallback={() => []}>
              {String(line.barcode || '—')}
            </Text>
            <View style={styles.col2}>
              <Text style={[styles.td, { paddingRight: 0 }]} hyphenationCallback={() => []}>
                {String(line.item_name || '—')}
              </Text>
              {(line.style_code || line.sku) ? (
                <Text style={styles.subItem} hyphenationCallback={() => []}>
                  {[line.style_code, line.sku ? `SKU ${line.sku}` : ''].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.td, styles.col3]}>
              {line.net_wt_g != null ? Number(line.net_wt_g).toFixed(2) : '—'}
            </Text>
            <Text style={[styles.td, styles.col4]}>{line.qty}</Text>
            <Text style={[styles.td, styles.col5]}>₹{Math.round(line.line_total).toLocaleString('en-IN')}</Text>
          </View>
        ))}
        {hasBank && (
          <View style={styles.bankBox}>
            <Text style={styles.bankH}>NEFT / RTGS</Text>
            {bank.account_name ? (
              <Text style={styles.bankL}>Name: {bank.account_name}</Text>
            ) : null}
            {bank.bank_name ? <Text style={styles.bankL}>Bank: {bank.bank_name}</Text> : null}
            {bank.account_number ? (
              <Text style={styles.bankL}>A/C: {bank.account_number}</Text>
            ) : null}
            {bank.ifsc ? <Text style={styles.bankL}>IFSC: {bank.ifsc}</Text> : null}
            {bank.upi_id ? <Text style={styles.bankL}>UPI: {bank.upi_id}</Text> : null}
            {bank.notes ? (
              <Text style={[styles.bankL, { marginTop: 4 }]}>{bank.notes}</Text>
            ) : null}
          </View>
        )}
        <Text style={styles.foot}>
          Dispatch after payment is verified or ledger is updated by KC Jewellers, as applicable. This proforma is not a tax
          invoice.
        </Text>
      </Page>
    </Document>
  )
}
