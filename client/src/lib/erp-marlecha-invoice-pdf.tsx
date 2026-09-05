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
  paymentMethodInvoiceLabel,
} from '@/lib/erp-invoice-template'
import type {
  ErpBankSettings,
  ErpGstSettings,
  ErpTaxInvoiceCompliance,
  ErpTaxInvoicePdfDocumentProps,
} from '@/lib/erp-tax-invoice-pdf-document'
import {
  DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE,
  mergeTemplateWithGstSettings,
  normalizeTaxInvoiceTemplate,
  type ErpTaxInvoiceTemplateConfig,
} from '@/lib/erp-tax-invoice-template'

export type { ErpTaxInvoicePdfDocumentProps }

export type ConfigurableTaxInvoiceProps = ErpTaxInvoicePdfDocumentProps & {
  templateConfig?: ErpTaxInvoiceTemplateConfig | null
  /** e-way bill number when rendering e-way variant */
  ewayBillNo?: string | null
}

const COL_W = ['5%', '28%', '10%', '12%', '12%', '14%', '19%'] as const

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#000',
    lineHeight: 1.25,
  },
  headerBox: {
    borderWidth: 1.5,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 6,
    marginBottom: 0,
  },
  copyTag: {
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 2,
  },
  title: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  shopName: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  centerLine: { fontSize: 7.5, textAlign: 'center', lineHeight: 1.3 },
  taxIdLine: { fontSize: 8, fontWeight: 'bold', textAlign: 'center', marginTop: 2 },
  billingBox: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: '#000', minHeight: 78 },
  billingLeft: { width: '58%', borderRightWidth: 1, borderRightColor: '#000' },
  billingRight: { width: '42%', padding: 6, paddingTop: 8 },
  billingBar: {
    backgroundColor: '#e8e8e8',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontSize: 7.5,
    fontWeight: 'bold',
  },
  billingBody: { padding: 6, fontSize: 7.5, lineHeight: 1.35 },
  table: { borderWidth: 1, borderTopWidth: 0, borderColor: '#000' },
  tableHead: { flexDirection: 'row', backgroundColor: '#e8e8e8', borderBottomWidth: 1, borderBottomColor: '#000' },
  headCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  bodyCell: {
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontSize: 7,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  summaryRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: '#000', minHeight: 72 },
  summaryLeft: { width: '58%', borderRightWidth: 1, borderRightColor: '#000', padding: 8, justifyContent: 'space-between' },
  summaryRight: { width: '42%' },
  totalCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontSize: 7.5,
  },
  totalCellEmpty: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 14 },
  netCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontWeight: 'bold',
    fontSize: 8.5,
  },
  footerRow: { flexDirection: 'row', marginTop: 6, minHeight: 64 },
  termsCol: { width: '50%', fontSize: 6.5, lineHeight: 1.35, paddingRight: 6 },
  bankCol: { width: '28%', fontSize: 7, lineHeight: 1.4, paddingTop: 2 },
  signCol: { width: '22%', fontSize: 7.5, textAlign: 'center', justifyContent: 'flex-end' },
  signLine: { borderTopWidth: 1, borderTopColor: '#000', marginTop: 28, paddingTop: 3, textAlign: 'center' },
  eRef: { marginTop: 6, fontSize: 7 },
  eInvoiceRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#666',
    marginBottom: 4,
    padding: 4,
    gap: 6,
  },
  qr: { width: 56, height: 56, objectFit: 'contain' },
})

function formatBillDate(bill: ErpBill): string {
  return formatErpDateDdMmYyyy(bill.bill_date || bill.created_at)
}

function gmToKg(gm: number): number {
  return (Number(gm) || 0) / 1000
}

function lineRatePerKg(line: ErpBillLine): number {
  const wtKg = (Number(line.weightGm) || 0) / 1000
  const amt = Number(line.lineTotalInr) || 0
  if (wtKg <= 0) return 0
  return amt / wtKg
}

function InvoicePage({
  copyLabel,
  template,
  bill,
  totals,
  gst,
  customerName,
  customerAddress,
  customerMobile,
  compliance,
  lines,
  session,
  ewayBillNo,
}: {
  copyLabel: string
  template: ErpTaxInvoiceTemplateConfig
  bill: ErpBill
  totals: ErpQuoteTotals
  gst: ErpGstSettings
  customerName?: string | null
  customerAddress?: string | null
  customerMobile?: string | null
  compliance?: ErpTaxInvoiceCompliance | null
  lines: ErpBillLine[]
  session: Record<string, unknown>
  ewayBillNo?: string | null
}) {
  const placeOfSupply =
    String(session.placeOfSupply || gst.placeOfSupply || '').trim() || 'Tamil Nadu'
  const interstate = isInterstateSupply({
    sellerGstin: gst.gstin,
    placeOfSupply,
    buyerGstin: String(session.customerGst || ''),
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
  const shopDisplay = template.shopName || gst.legalName || 'Shop'

  return (
    <Page size="A4" style={styles.page}>
      {compliance?.irn ? (
        <View style={styles.eInvoiceRow}>
          <View style={{ flex: 1, fontSize: 6.5 }}>
            <Text style={{ fontWeight: 'bold' }}>e-Invoice</Text>
            <Text>IRN: {sanitizePdfText(compliance.irn)}</Text>
            {compliance.ack_no ? <Text>Ack No.: {sanitizePdfText(compliance.ack_no)}</Text> : null}
            {compliance.ack_date ? <Text>Ack Date: {sanitizePdfText(compliance.ack_date)}</Text> : null}
          </View>
          {compliance.qrImageSrc ? <Image style={styles.qr} src={compliance.qrImageSrc} /> : null}
        </View>
      ) : null}

      <View style={styles.headerBox}>
        <Text style={styles.copyTag}>{copyLabel}</Text>
        <Text style={styles.title}>{sanitizePdfText(template.headerTitle)}</Text>
        <Text style={styles.shopName}>{sanitizePdfText(shopDisplay)}</Text>
        {template.addressLines.map((line, i) => (
          <Text key={`addr-${i}`} style={styles.centerLine}>
            {sanitizePdfText(line)}
          </Text>
        ))}
        {template.phoneEmailLine ? (
          <Text style={styles.centerLine}>{sanitizePdfText(template.phoneEmailLine)}</Text>
        ) : null}
        <Text style={styles.taxIdLine}>{sanitizePdfText(template.panLine)}</Text>
        <Text style={styles.taxIdLine}>{sanitizePdfText(template.gstinLine)}</Text>
      </View>

      <View style={styles.billingBox}>
        <View style={styles.billingLeft}>
          <Text style={styles.billingBar}>{sanitizePdfText(template.billingAddressLabel)}</Text>
          <View style={styles.billingBody}>
            <Text>{sanitizePdfText(template.toLabel)}</Text>
            <Text style={{ fontWeight: 'bold', marginTop: 2 }}>
              {sanitizePdfText(customerName || bill.customer_name || 'Walk-in')}
            </Text>
            {customerAddress ? (
              <Text style={{ marginTop: 3 }}>{sanitizePdfText(customerAddress)}</Text>
            ) : null}
            {customerMobile ? <Text style={{ marginTop: 2 }}>Mob: {sanitizePdfText(customerMobile)}</Text> : null}
          </View>
        </View>
        <View style={styles.billingRight}>
          <Text style={{ fontSize: 8, marginBottom: 4 }}>
            {sanitizePdfText(template.billNoLabel)} {sanitizePdfText(bill.bill_number)}
          </Text>
          <Text style={{ fontSize: 8, marginBottom: 12 }}>
            {sanitizePdfText(template.dateLabel)} {formatBillDate(bill)}
          </Text>
          {ewayBillNo ? (
            <Text style={{ fontSize: 8, marginBottom: 8 }}>E-Way Bill : {sanitizePdfText(ewayBillNo)}</Text>
          ) : null}
          <Text style={{ fontSize: 7, marginBottom: 2 }}>{sanitizePdfText(template.placeOfSupplyLabel)}</Text>
          <Text style={{ fontSize: 8, fontWeight: 'bold' }}>{sanitizePdfText(placeOfSupply)}</Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          {template.tableColumns.map((label, i) => (
            <Text
              key={`h-${i}`}
              style={[styles.headCell, { width: COL_W[i] || '10%', borderRightWidth: i === 6 ? 0 : 1 }]}
            >
              {sanitizePdfText(label.replace(/\\n/g, '\n'))}
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
              <Text style={[styles.bodyCell, { width: COL_W[0], textAlign: 'center' }]}>{i + 1}.</Text>
              <Text style={[styles.bodyCell, { width: COL_W[1], textAlign: 'left' }]}>
                {sanitizePdfText(line.invoice_item_name || line.name || 'JEWELLERY')}
              </Text>
              <Text style={[styles.bodyCell, { width: COL_W[2], textAlign: 'center' }]}>
                {sanitizePdfText(line.hsn_code || '711311')}
              </Text>
              <Text style={[styles.bodyCell, { width: COL_W[3], textAlign: 'right' }]}>{grossKg.toFixed(3)}</Text>
              <Text style={[styles.bodyCell, { width: COL_W[4], textAlign: 'right' }]}>{netKg.toFixed(3)}</Text>
              <Text style={[styles.bodyCell, { width: COL_W[5], textAlign: 'right' }]}>
                {rate > 0 ? rate.toFixed(2) : '—'}
              </Text>
              <Text style={[styles.bodyCell, { width: COL_W[6], textAlign: 'right', borderRightWidth: 0 }]}>
                {amt.toFixed(2)}
              </Text>
            </View>
          )
        })}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <View>
            <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{amountInWordsInr(roundedTotal)}</Text>
            <Text style={{ marginTop: 6, fontSize: 8 }}>{payLabel}</Text>
          </View>
          <Text style={{ fontSize: 7.5, marginTop: 8 }}>{sanitizePdfText(template.partySignatureLabel)}</Text>
        </View>
        <View style={styles.summaryRight}>
          <View style={styles.totalCell}>
            <Text>{template.totalsLabels.total}</Text>
            <Text>{taxable.toFixed(2)}</Text>
          </View>
          {interstate ? (
            <View style={styles.totalCell}>
              <Text>{template.totalsLabels.igst}</Text>
              <Text>{igst.toFixed(2)}</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalCell}>
                <Text>{template.totalsLabels.cgst}</Text>
                <Text>{cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.totalCell}>
                <Text>{template.totalsLabels.sgst}</Text>
                <Text>{sgst.toFixed(2)}</Text>
              </View>
            </>
          )}
          <View style={styles.totalCellEmpty} />
          <View style={styles.totalCell}>
            <Text>{template.totalsLabels.roundOff}</Text>
            <Text>{roundOff.toFixed(2)}</Text>
          </View>
          <View style={styles.netCell}>
            <Text>{template.totalsLabels.netAmount}</Text>
            <Text>{roundedTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.termsCol}>
          <Text style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: 3 }}>
            {sanitizePdfText(template.termsTitle)}
          </Text>
          {template.termsLines.map((t, i) => (
            <Text key={`term-${i}`}>
              {i + 1}. {sanitizePdfText(t)}
            </Text>
          ))}
          <Text style={{ marginTop: 4, fontStyle: 'italic' }}>{sanitizePdfText(template.jurisdictionLine)}</Text>
        </View>
        <View style={styles.bankCol}>
          {template.bankLines.map((line, i) => (
            <Text key={`bank-${i}`}>{sanitizePdfText(line)}</Text>
          ))}
        </View>
        <View style={styles.signCol}>
          <Text style={{ fontWeight: 'bold' }}>
            {template.authorisedForPrefix} {sanitizePdfText(shopDisplay)}
          </Text>
          <View style={styles.signLine}>
            <Text>{sanitizePdfText(template.authorisedSignatoryLabel)}</Text>
          </View>
        </View>
      </View>

      {compliance?.irn || ewayBillNo ? (
        <Text style={styles.eRef}>
          {sanitizePdfText(template.electronicRefLabel)}{' '}
          {sanitizePdfText(compliance?.irn || ewayBillNo || '')}
        </Text>
      ) : (
        <Text style={styles.eRef}>{sanitizePdfText(template.electronicRefLabel)}</Text>
      )}
    </Page>
  )
}

export function ErpConfigurableTaxInvoicePdfDocument(props: ConfigurableTaxInvoiceProps) {
  const lines = useMemo(() => groupMarlechaInvoiceLines(props.bill.lines ?? []), [props.bill.lines])
  const session = (props.bill.session && typeof props.bill.session === 'object'
    ? props.bill.session
    : {}) as Record<string, unknown>

  const template = useMemo(() => {
    const raw = props.templateConfig
      ? normalizeTaxInvoiceTemplate(props.templateConfig)
      : DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE
    return mergeTemplateWithGstSettings(raw, props.gst, props.bank)
  }, [props.templateConfig, props.gst, props.bank])

  const pageProps = { ...props, lines, session, template }

  return (
    <Document>
      <InvoicePage copyLabel={template.copyLabels[0]} {...pageProps} />
      <InvoicePage copyLabel={template.copyLabels[1]} {...pageProps} />
      <InvoicePage copyLabel={template.copyLabels[2]} {...pageProps} />
    </Document>
  )
}

/** @deprecated use ErpConfigurableTaxInvoicePdfDocument */
export function ErpMarlechaTaxInvoicePdfDocument(props: ErpTaxInvoicePdfDocumentProps & { templateConfig?: ErpTaxInvoiceTemplateConfig | null }) {
  return <ErpConfigurableTaxInvoicePdfDocument {...props} />
}
