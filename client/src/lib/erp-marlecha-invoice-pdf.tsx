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
import type { ErpSalesInvoiceTemplateConfig } from '@/lib/erp-sales-invoice-template'
import { DEFAULT_MARLECHA_SALES_INVOICE_TEMPLATE } from '@/lib/erp-sales-invoice-template'
import type {
  ErpBankSettings,
  ErpGstSettings,
  ErpTaxInvoiceCompliance,
  ErpTaxInvoicePdfDocumentProps,
} from '@/lib/erp-tax-invoice-pdf-document'

export type ErpMarlechaPdfProps = ErpTaxInvoicePdfDocumentProps & {
  template?: ErpSalesInvoiceTemplateConfig | null
}

const BORDER = '#111'

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: '#111',
  },
  outerFrame: {
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 6,
    flex: 1,
  },
  copyTag: {
    position: 'absolute',
    top: 8,
    right: 18,
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'right',
    maxWidth: 130,
  },
  headerBox: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  docTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  shopName: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  centerLine: { fontSize: 7.5, textAlign: 'center', lineHeight: 1.35 },
  panGstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    fontSize: 7.5,
    fontWeight: 'bold',
  },
  splitRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    minHeight: 78,
  },
  splitLeft: {
    width: '58%',
    borderRightWidth: 1,
    borderRightColor: BORDER,
    padding: 6,
  },
  splitRight: { width: '42%', padding: 6 },
  billingHead: {
    fontSize: 7.5,
    fontWeight: 'bold',
    textDecoration: 'underline',
    marginBottom: 4,
  },
  table: { borderWidth: 1, borderTopWidth: 0, borderColor: BORDER },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: '#fafafa',
  },
  headCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  bodyCell: {
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontSize: 7,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: BORDER,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    minHeight: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    minHeight: 72,
  },
  summaryLeft: {
    width: '58%',
    borderRightWidth: 1,
    borderRightColor: BORDER,
    padding: 6,
    justifyContent: 'space-between',
  },
  totalsBox: { width: '42%', padding: 0 },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    fontSize: 7.5,
  },
  netLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontWeight: 'bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
  },
  termsBlock: { marginTop: 6, paddingHorizontal: 4, fontSize: 6.5, lineHeight: 1.4 },
  bankBlock: { marginTop: 5, fontSize: 7, textAlign: 'center', lineHeight: 1.45 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  signBlock: { width: '45%', textAlign: 'center', fontSize: 7.5 },
  signLine: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 28,
    paddingTop: 3,
    textAlign: 'center',
  },
  complianceBox: {
    marginBottom: 4,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#666',
    padding: 4,
    gap: 6,
  },
  qr: { width: 56, height: 56, objectFit: 'contain' },
})

const COL = {
  sl: '5%',
  desc: '27%',
  hsn: '10%',
  gross: '12%',
  net: '12%',
  rate: '14%',
  amt: '20%',
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

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

type PageProps = Omit<ErpMarlechaPdfProps, 'copyLabel'> & {
  lines: ErpBillLine[]
  session: Record<string, unknown>
  pageCopyLabel: string
  template: ErpSalesInvoiceTemplateConfig
}

function MarlechaChallanPage({
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
  pageCopyLabel,
  template,
}: PageProps) {
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
  const emptyRows = Math.max(0, template.minTableRows - lines.length)
  const words = capitalizeWords(amountInWordsInr(roundedTotal))
  const showEinvoice = !!compliance?.irn

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.copyTag}>{pageCopyLabel}</Text>

      <View style={styles.outerFrame}>
        <View style={styles.headerBox}>
          <Text style={styles.docTitle}>{sanitizePdfText(template.documentTitle)}</Text>
          <Text style={styles.shopName}>{sanitizePdfText(shopDisplay)}</Text>
          {gst.address ? <Text style={styles.centerLine}>{sanitizePdfText(gst.address)}</Text> : null}
          {gst.phone ? (
            <Text style={styles.centerLine}>
              Ph : {sanitizePdfText(gst.phone)}
              {gst.email ? ` , E-mail Id : ${sanitizePdfText(gst.email)}` : ''}
            </Text>
          ) : null}
          <View style={styles.panGstRow}>
            <Text>PAN : {sanitizePdfText(sellerPan || '—')}</Text>
            <Text>GSTIN : {sanitizePdfText(gst.gstin || '—')}</Text>
          </View>
        </View>

        {showEinvoice ? (
          <View style={styles.complianceBox}>
            <View style={{ flex: 1, fontSize: 6.5 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>e-Invoice</Text>
              <Text>IRN: {sanitizePdfText(compliance!.irn!)}</Text>
              {compliance!.ack_no ? <Text>Ack No.: {sanitizePdfText(compliance!.ack_no)}</Text> : null}
              {compliance!.ack_date ? <Text>Ack Date: {sanitizePdfText(compliance!.ack_date)}</Text> : null}
            </View>
            {compliance!.qrImageSrc ? <Image style={styles.qr} src={compliance!.qrImageSrc} /> : null}
          </View>
        ) : null}

        <View style={styles.splitRow}>
          <View style={styles.splitLeft}>
            <Text style={styles.billingHead}>Billing Address</Text>
            <Text style={{ fontSize: 7, marginBottom: 2 }}>To</Text>
            <Text style={{ fontSize: 7.5, fontWeight: 'bold' }}>
              {sanitizePdfText(customerName || bill.customer_name || 'Walk-in')}
            </Text>
            {customerAddress ? (
              <Text style={{ fontSize: 7, marginTop: 3, lineHeight: 1.35 }}>
                {sanitizePdfText(customerAddress)}
              </Text>
            ) : null}
            {customerMobile ? (
              <Text style={{ fontSize: 7, marginTop: 2 }}>Mob: {sanitizePdfText(customerMobile)}</Text>
            ) : null}
            {customerPan ? <Text style={{ fontSize: 7 }}>PAN: {sanitizePdfText(customerPan)}</Text> : null}
            {customerGst ? <Text style={{ fontSize: 7 }}>GSTIN: {sanitizePdfText(customerGst)}</Text> : null}
          </View>
          <View style={styles.splitRight}>
            <Text style={{ fontSize: 8, marginBottom: 4 }}>
              <Text style={{ fontWeight: 'bold' }}>Bill No : </Text>
              {sanitizePdfText(bill.bill_number)}
            </Text>
            <Text style={{ fontSize: 8, marginBottom: 6 }}>
              <Text style={{ fontWeight: 'bold' }}>Date : </Text>
              {formatBillDate(bill)}
            </Text>
            <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Place Of Supply</Text>
            <Text style={{ fontSize: 8, marginTop: 2 }}>{sanitizePdfText(placeOfSupply)}</Text>
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
              { w: COL.amt, t: 'Amount\n( in Rs. )' },
            ].map((c, idx) => (
              <Text
                key={c.t}
                style={[styles.headCell, { width: c.w, borderRightWidth: idx === 6 ? 0 : 1 }]}
              >
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
                <Text style={[styles.bodyCell, { width: COL.hsn }]}>
                  {sanitizePdfText(line.hsn_code || '711411')}
                </Text>
                <Text style={[styles.bodyCell, { width: COL.gross, textAlign: 'right' }]}>
                  {grossKg.toFixed(3)}
                </Text>
                <Text style={[styles.bodyCell, { width: COL.net, textAlign: 'right' }]}>
                  {netKg.toFixed(3)}
                </Text>
                <Text style={[styles.bodyCell, { width: COL.rate, textAlign: 'right' }]}>
                  {rate > 0 ? rate.toFixed(2) : ''}
                </Text>
                <Text
                  style={[styles.bodyCell, { width: COL.amt, textAlign: 'right', borderRightWidth: 0 }]}
                >
                  {amt > 0 ? amt.toFixed(2) : ''}
                </Text>
              </View>
            )
          })}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View key={`empty-${i}`} style={{ flexDirection: 'row' }}>
              {[COL.sl, COL.desc, COL.hsn, COL.gross, COL.net, COL.rate, COL.amt].map((w, ci) => (
                <Text
                  key={`e-${i}-${ci}`}
                  style={[styles.bodyCell, { width: w, borderRightWidth: ci === 6 ? 0 : 1 }]}
                >
                  {' '}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <View>
              <Text style={{ fontSize: 7.5, fontWeight: 'bold', lineHeight: 1.4 }}>{words}</Text>
              <Text style={{ fontSize: 8, marginTop: 8, fontWeight: 'bold' }}>{payLabel}</Text>
            </View>
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

        <View style={styles.termsBlock}>
          <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>Terms &amp; Conditions</Text>
          {template.terms.map((t, i) => (
            <Text key={`term-${i}`}>
              {i + 1}. {t}
            </Text>
          ))}
        </View>

        {(bank.bankName || bank.accountNo) ? (
          <View style={styles.bankBlock}>
            {bank.bankName ? <Text>Bank : {sanitizePdfText(bank.bankName)}</Text> : null}
            {bank.branch ? <Text>Branch : {sanitizePdfText(bank.branch)}</Text> : null}
            {bank.ifsc ? <Text>IFSC : {sanitizePdfText(bank.ifsc)}</Text> : null}
            {bank.accountNo ? <Text>A/C No : {sanitizePdfText(bank.accountNo)}</Text> : null}
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <Text style={{ fontSize: 7, width: '50%' }}>
            {template.electronicRefLabel}{' '}
            {showEinvoice ? sanitizePdfText(compliance!.irn!) : ''}
          </Text>
          <View style={styles.signBlock}>
            <Text style={{ fontWeight: 'bold' }}>for {sanitizePdfText(shopDisplay)}</Text>
            <View style={styles.signLine}>
              <Text>Authorised Signatory</Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  )
}

export function ErpMarlechaTaxInvoicePdfDocument(props: ErpMarlechaPdfProps) {
  const lines = useMemo(() => groupMarlechaInvoiceLines(props.bill.lines ?? []), [props.bill.lines])
  const session = (props.bill.session && typeof props.bill.session === 'object'
    ? props.bill.session
    : {}) as Record<string, unknown>
  const template = props.template ?? DEFAULT_MARLECHA_SALES_INVOICE_TEMPLATE

  return (
    <Document>
      {template.copyLabels.map((pageCopyLabel, idx) => (
        <MarlechaChallanPage
          key={`copy-${idx}`}
          {...props}
          lines={lines}
          session={session}
          pageCopyLabel={pageCopyLabel}
          template={template}
        />
      ))}
    </Document>
  )
}

export type { ErpTaxInvoicePdfDocumentProps }
