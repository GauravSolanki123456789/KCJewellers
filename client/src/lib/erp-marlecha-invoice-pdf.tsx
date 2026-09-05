import { useMemo } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import { groupMarlechaInvoiceLines } from '@/lib/erp-invoice-defaults'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { amountInWordsInr } from '@/lib/erp-amount-in-words'
import {
  isInterstateSupply,
  panFromGstin,
  paymentMethodInvoiceLabel,
} from '@/lib/erp-invoice-template'
import type {
  ErpBankSettings,
  ErpGstSettings,
  ErpTaxInvoiceCompliance,
  ErpTaxInvoicePdfDocumentProps,
} from '@/lib/erp-tax-invoice-pdf-document'

export type { ErpTaxInvoicePdfDocumentProps }

const styles = StyleSheet.create({
  page: { padding: 22, fontFamily: 'Helvetica', fontSize: 8, color: '#111' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  title: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', flex: 1 },
  copyTag: { fontSize: 7, fontWeight: 'bold', width: 120, textAlign: 'right' },
  shopName: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginTop: 4, marginBottom: 2 },
  centerLine: { fontSize: 7.5, textAlign: 'center', lineHeight: 1.35 },
  panGstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 6,
    fontSize: 8,
    fontWeight: 'bold',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#222',
    paddingVertical: 3,
  },
  splitRow: { flexDirection: 'row', borderWidth: 1, borderColor: '#222', minHeight: 72 },
  splitLeft: { width: '55%', borderRightWidth: 1, borderRightColor: '#222', padding: 6 },
  splitRight: { width: '45%', padding: 6 },
  sectionLabel: { fontSize: 7.5, fontWeight: 'bold', marginBottom: 3 },
  table: { borderWidth: 1, borderColor: '#222', marginTop: 4 },
  tableHead: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#222' },
  headCell: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  bodyCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontSize: 7,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#ccc',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  footerSplit: { flexDirection: 'row', marginTop: 6, gap: 8 },
  footerLeft: { flex: 1, fontSize: 7.5, lineHeight: 1.4 },
  totalsBox: { width: 160, borderWidth: 1, borderColor: '#222', padding: 4 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2, fontSize: 7.5 },
  netLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: '#222',
    fontWeight: 'bold',
    fontSize: 8.5,
  },
  terms: { marginTop: 8, fontSize: 6.5, lineHeight: 1.35 },
  bankBlock: { marginTop: 6, fontSize: 7, textAlign: 'center', lineHeight: 1.4 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, fontSize: 7.5 },
  signBox: { width: '42%', textAlign: 'center' },
  signLine: { borderTopWidth: 1, borderTopColor: '#333', marginTop: 24, paddingTop: 3 },
  complianceRow: {
    marginTop: 6,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#888',
    padding: 5,
    gap: 6,
  },
  qr: { width: 64, height: 64, objectFit: 'contain' },
  eRef: { marginTop: 4, fontSize: 7 },
})

const COL = {
  sl: '5%',
  desc: '28%',
  hsn: '10%',
  gross: '12%',
  net: '12%',
  rate: '15%',
  amt: '18%',
} as const

function formatBillDate(bill: ErpBill): string {
  return formatErpDateDdMmYyyy(bill.bill_date || bill.created_at)
}

function gmToKg(gm: number): number {
  return Math.round(gm * 1000) / 1000000
}

function lineRatePerKg(line: ErpBillLine): number {
  const wtKg = gmToKg(Number(line.weightGm) || 0)
  const amt = Number(line.lineTotalInr) || 0
  if (wtKg <= 0) return 0
  return amt / wtKg
}

function MarlechaPage({
  bill,
  brandName,
  totals,
  gst,
  bank,
  customerName,
  customerAddress,
  customerMobile,
  customerPan,
  customerGst,
  compliance,
  lines,
  session,
}: ErpTaxInvoicePdfDocumentProps & { lines: ErpBillLine[]; session: Record<string, unknown> }) {
  const shopDisplay = gst.legalName?.trim() || brandName
  const sellerPan = panFromGstin(gst.gstin)
  const placeOfSupply =
    String(session.placeOfSupply || gst.placeOfSupply || '').trim() || 'Tamil Nadu'
  const interstate = isInterstateSupply({
    sellerGstin: gst.gstin,
    placeOfSupply,
    buyerGstin: customerGst,
  })
  const taxable = totals.subtotal
  const gstAmt = totals.gst
  const igst = interstate ? gstAmt : 0
  const cgst = interstate ? 0 : gstAmt / 2
  const sgst = interstate ? 0 : gstAmt / 2
  const rawTotal = taxable + gstAmt
  const roundedTotal = Math.round(rawTotal)
  const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100
  const payLabel = paymentMethodInvoiceLabel(String(session.paymentMethod || ''))

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topRow}>
        <View style={{ width: 120 }} />
        <Text style={styles.title}>TAX INVOICE CUM DELIVERY CHALLAN</Text>
        <Text style={styles.copyTag}>TRIPLICATE FOR SUPPLIER</Text>
      </View>

      {compliance?.irn ? (
        <View style={styles.complianceRow}>
          <View style={{ flex: 1, fontSize: 6.5 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>e-Invoice</Text>
            <Text>IRN: {sanitizePdfText(compliance.irn)}</Text>
            {compliance.ack_no ? <Text>Ack No.: {sanitizePdfText(compliance.ack_no)}</Text> : null}
            {compliance.ack_date ? <Text>Ack Date: {sanitizePdfText(compliance.ack_date)}</Text> : null}
          </View>
          {compliance.qrImageSrc ? <Image style={styles.qr} src={compliance.qrImageSrc} /> : null}
        </View>
      ) : null}

      <Text style={styles.shopName}>{sanitizePdfText(shopDisplay)}</Text>
      {gst.address ? <Text style={styles.centerLine}>{sanitizePdfText(gst.address)}</Text> : null}
      {gst.phone ? (
        <Text style={styles.centerLine}>
          Ph : {sanitizePdfText(gst.phone)}
          {(gst as ErpGstSettings).email
            ? ` , E-mail Id : ${sanitizePdfText((gst as ErpGstSettings).email!)}`
            : ''}
        </Text>
      ) : null}

      <View style={styles.panGstRow}>
        <Text>PAN : {sanitizePdfText(sellerPan || '—')}</Text>
        <Text>GSTIN : {sanitizePdfText(gst.gstin || '—')}</Text>
      </View>

      <View style={styles.splitRow}>
        <View style={styles.splitLeft}>
          <Text style={styles.sectionLabel}>Billing Address</Text>
          <Text style={{ fontSize: 7, marginBottom: 2 }}>To</Text>
          <Text style={{ fontSize: 7.5, fontWeight: 'bold' }}>
            {sanitizePdfText(customerName || bill.customer_name || 'Walk-in')}
          </Text>
          {customerAddress ? (
            <Text style={{ fontSize: 7, marginTop: 2, lineHeight: 1.35 }}>{sanitizePdfText(customerAddress)}</Text>
          ) : null}
          {customerMobile ? <Text style={{ fontSize: 7, marginTop: 2 }}>Mob: {sanitizePdfText(customerMobile)}</Text> : null}
          {customerPan ? <Text style={{ fontSize: 7 }}>PAN: {sanitizePdfText(customerPan)}</Text> : null}
          {customerGst ? <Text style={{ fontSize: 7 }}>GSTIN: {sanitizePdfText(customerGst)}</Text> : null}
        </View>
        <View style={styles.splitRight}>
          <Text style={{ fontSize: 8, marginBottom: 3 }}>
            <Text style={{ fontWeight: 'bold' }}>Bill No : </Text>
            {sanitizePdfText(bill.bill_number)}
          </Text>
          <Text style={{ fontSize: 8, marginBottom: 3 }}>
            <Text style={{ fontWeight: 'bold' }}>Date : </Text>
            {formatBillDate(bill)}
          </Text>
          <Text style={{ fontSize: 8 }}>
            <Text style={{ fontWeight: 'bold' }}>Place of Supply : </Text>
            {sanitizePdfText(placeOfSupply)}
          </Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          {[
            { w: COL.sl, t: 'SlNo' },
            { w: COL.desc, t: 'Description of Goods' },
            { w: COL.hsn, t: 'HSN Code' },
            { w: COL.gross, t: 'Gross Wt.\nin-Kgs' },
            { w: COL.net, t: 'Net Wt.\nin-Kgs' },
            { w: COL.rate, t: 'Rate' },
            { w: COL.amt, t: 'Amount\n( in Rs.)' },
          ].map((c) => (
            <Text key={c.t} style={[styles.headCell, { width: c.w, borderRightWidth: c.t.includes('Rs') ? 0 : 1 }]}>
              {c.t}
            </Text>
          ))}
        </View>
        {lines.map((line, i) => {
          const grossKg = gmToKg(Number(line.gross_weight) || Number(line.weightGm) || 0)
          const netKg = gmToKg(Number(line.weightGm) || 0)
          const rate = lineRatePerKg(line)
          const amt = Number(line.lineTotalInr) || 0
          return (
            <View key={`row-${i}`} style={{ flexDirection: 'row' }}>
              <Text style={[styles.bodyCell, { width: COL.sl }]}>{i + 1}.</Text>
              <Text style={[styles.bodyCell, { width: COL.desc, textAlign: 'left' }]}>
                {sanitizePdfText(line.invoice_item_name || line.name || 'JEWELLERY')}
              </Text>
              <Text style={[styles.bodyCell, { width: COL.hsn }]}>{sanitizePdfText(line.hsn_code || '711311')}</Text>
              <Text style={[styles.bodyCell, { width: COL.gross, textAlign: 'right' }]}>
                {grossKg.toFixed(3)}
              </Text>
              <Text style={[styles.bodyCell, { width: COL.net, textAlign: 'right' }]}>{netKg.toFixed(3)}</Text>
              <Text style={[styles.bodyCell, { width: COL.rate, textAlign: 'right' }]}>
                {rate > 0 ? rate.toFixed(2) : '—'}
              </Text>
              <Text style={[styles.bodyCell, { width: COL.amt, textAlign: 'right', borderRightWidth: 0 }]}>
                {amt.toFixed(2)}
              </Text>
            </View>
          )
        })}
      </View>

      <View style={styles.footerSplit}>
        <View style={styles.footerLeft}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>{amountInWordsInr(roundedTotal)}</Text>
          <Text style={{ marginBottom: 8 }}>{payLabel}</Text>
          <View style={styles.signLine}>
            <Text>Party Signature</Text>
          </View>
        </View>
        <View style={styles.totalsBox}>
          <View style={styles.totalLine}>
            <Text>Total</Text>
            <Text>{taxable.toFixed(2)}</Text>
          </View>
          {interstate ? (
            <View style={styles.totalLine}>
              <Text>IGST 3.00%</Text>
              <Text>{igst.toFixed(2)}</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalLine}>
                <Text>CGST 1.50%</Text>
                <Text>{cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text>SGST 1.50%</Text>
                <Text>{sgst.toFixed(2)}</Text>
              </View>
            </>
          )}
          <View style={styles.totalLine}>
            <Text>Round Off</Text>
            <Text>{roundOff.toFixed(2)}</Text>
          </View>
          <View style={styles.netLine}>
            <Text>Net Amount</Text>
            <Text>{roundedTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.terms}>
        <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>Terms &amp; Conditions</Text>
        {[
          'Goods once sold will not be taken back.',
          'Any change or alteration in shape/weight/polish will be at your cost and risk.',
          'Please note that the weight is calculated at the time of billing.',
          'All subject to Chennai Jurisdiction.',
        ].map((t, i) => (
          <Text key={t}>
            {i + 1}. {t}
          </Text>
        ))}
      </View>

      {(bank.bankName || bank.accountNo) ? (
        <View style={styles.bankBlock}>
          <Text style={{ fontWeight: 'bold' }}>Bank Details</Text>
          {bank.bankName ? <Text>Bank Name : {sanitizePdfText(bank.bankName)}</Text> : null}
          {bank.branch ? <Text>Branch : {sanitizePdfText(bank.branch)}</Text> : null}
          {bank.ifsc ? <Text>IFSC Code : {sanitizePdfText(bank.ifsc)}</Text> : null}
          {bank.accountNo ? <Text>A/C No : {sanitizePdfText(bank.accountNo)}</Text> : null}
        </View>
      ) : null}

      <View style={styles.signRow}>
        <View style={styles.signBox} />
        <View style={styles.signBox}>
          <Text style={{ fontWeight: 'bold' }}>for {sanitizePdfText(shopDisplay)}</Text>
          <View style={styles.signLine}>
            <Text>Authorised Signatory</Text>
          </View>
        </View>
      </View>

      {compliance?.irn ? (
        <Text style={styles.eRef}>Electronic Ref No : {sanitizePdfText(compliance.irn)}</Text>
      ) : null}
    </Page>
  )
}

export function ErpMarlechaTaxInvoicePdfDocument(props: ErpTaxInvoicePdfDocumentProps) {
  const lines = useMemo(() => groupMarlechaInvoiceLines(props.bill.lines ?? []), [props.bill.lines])
  const session = (props.bill.session && typeof props.bill.session === 'object'
    ? props.bill.session
    : {}) as Record<string, unknown>

  return (
    <Document>
      <MarlechaPage {...props} lines={lines} session={session} />
    </Document>
  )
}
