import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', backgroundColor: '#020617', color: '#e2e8f0' },
  h1: { fontSize: 18, color: '#fbbf24', marginBottom: 4 },
  sub: { fontSize: 9, color: '#94a3b8', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 9, color: '#64748b' },
  val: { fontSize: 12, fontWeight: 'bold', color: '#f1f5f9' },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6,
    marginTop: 12,
  },
  th: { fontSize: 8, color: '#94a3b8', flex: 1 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#1e293b', paddingVertical: 6 },
  td: { fontSize: 8, color: '#cbd5e1', flex: 1 },
  foot: { marginTop: 20, fontSize: 7, color: '#475569', textAlign: 'center' },
})

export type LedgerTxnRow = {
  id: number
  txn_category: string
  amount_rupees: string | number
  fine_metal_grams: string | number
  metal_type?: string | null
  description?: string | null
  reference?: string | null
  created_at: string
}

function labelForCategory(cat: string): string {
  const c = String(cat || '').toUpperCase()
  if (c === 'PURCHASE') return 'Purchase'
  if (c === 'CASH_PAYMENT') return 'Cash Payment'
  if (c === 'METAL_DEPOSIT') return 'Metal Deposit'
  return cat
}

export function LedgerPdfDocument({
  name,
  email,
  mobile,
  rupeeBalance,
  fineMetalGrams,
  transactions,
  generatedAt,
}: {
  name: string
  email: string
  mobile: string
  rupeeBalance: number
  fineMetalGrams: number
  transactions: LedgerTxnRow[]
  generatedAt: string
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>KC Jewellers — Account ledger (Khata)</Text>
        <Text style={styles.sub}>
          {name} · {email || mobile || '—'} · Generated {generatedAt}
        </Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Rupee balance (₹)</Text>
            <Text style={styles.val}>₹{rupeeBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          </View>
          <View>
            <Text style={styles.label}>Fine metal balance (g)</Text>
            <Text style={styles.val}>
              {fineMetalGrams.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g
            </Text>
          </View>
        </View>
        <View style={styles.tableHead}>
          <Text style={styles.th}>Date</Text>
          <Text style={styles.th}>Type</Text>
          <Text style={styles.th}>₹</Text>
          <Text style={styles.th}>Metal (g)</Text>
          <Text style={[styles.th, { flex: 1.4 }]}>Note</Text>
        </View>
        {transactions.slice(0, 80).map((t) => (
          <View key={t.id} style={styles.tr} wrap={false}>
            <Text style={styles.td}>{new Date(t.created_at).toLocaleString('en-IN')}</Text>
            <Text style={styles.td}>{labelForCategory(t.txn_category)}</Text>
            <Text style={styles.td}>{Number(t.amount_rupees).toFixed(2)}</Text>
            <Text style={styles.td}>{Number(t.fine_metal_grams).toFixed(3)}</Text>
            <Text style={[styles.td, { flex: 1.4 }]}>
              {(t.description || '').slice(0, 80)}
            </Text>
          </View>
        ))}
        <Text style={styles.foot}>KC Jewellers — for your records. Outstanding balances are estimates from posted entries.</Text>
      </Page>
    </Document>
  )
}
