// Tally Integration Module
// Supports syncing Sales Bills, Accounts Billing, Metal Purchases, Cash Transactions, and Bills to Tally

const https = require('https');
const http = require('http');
const { XMLBuilder, XMLParser } = require('fast-xml-parser');

class TallyIntegration {
    constructor(config = {}) {
        this.tallyUrl = config.tallyUrl || 'http://localhost:9000';
        this.companyName = config.companyName || 'Default Company';
        this.enabled = config.enabled !== false;
        this.syncMode = config.syncMode || 'auto'; // 'auto' or 'manual'
    }

    /**
     * Generate Tally XML for Sales Invoice
     */
    generateSalesInvoiceXML(bill) {
        const items = Array.isArray(bill.items) ? bill.items : JSON.parse(bill.items || '[]');
        
        // Calculate item details
        const invoiceItems = items.map((item, index) => {
            const itemName = item.itemName || item.shortName || 'Jewelry Item';
            const quantity = item.pcs || item.quantity || 1;
            const rate = item.rate || 0;
            const amount = item.total || (rate * quantity);
            
            return `
                        <INVENTORYENTRIES.LIST>
                            <STOCKITEMNAME>${this.escapeXML(itemName)}</STOCKITEMNAME>
                            <RATE>${rate}</RATE>
                            <AMOUNT>${amount}</AMOUNT>
                            <ACTUALQTY>${quantity}</ACTUALQTY>
                            <BILLEDQTY>${quantity}</BILLEDQTY>
                            <UNIT>PCS</UNIT>
                            ${item.gst ? `<GSTAPPLICABLE>Yes</GSTAPPLICABLE>` : ''}
                            ${item.hsn ? `<HSNCODE>${item.hsn}</HSNCODE>` : ''}
                        </INVENTORYENTRIES.LIST>`;
        }).join('');

        const invoiceDate = bill.date ? new Date(bill.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const invoiceNumber = bill.bill_no || bill.billNo || `INV-${Date.now()}`;
        const customerName = bill.customer_name || bill.customerName || 'Cash Customer';
        const netTotal = bill.net_total || bill.netTotal || bill.total || 0;
        const gst = bill.gst || 0;
        const cgst = bill.cgst || 0;
        const sgst = bill.sgst || 0;
        const paymentMethod = bill.payment_method || bill.paymentMethod || 'Cash';

        const xml = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Vouchers</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
        <DATA>
            <TALLYMESSAGE>
                <VOUCHER>
                    <DATE>${invoiceDate}</DATE>
                    <VOUCHERTYPE>Sales</VOUCHERTYPE>
                    <VOUCHERNUMBER>${invoiceNumber}</VOUCHERNUMBER>
                    <PARTYNAME>${this.escapeXML(customerName)}</PARTYNAME>
                    <NARRATION>Sales Invoice - ${invoiceNumber}</NARRATION>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>Sales</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${netTotal}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    ${items.length > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(customerName)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${netTotal}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${gst > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>GST Output</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${gst}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${cgst > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>CGST Output</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${cgst}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${sgst > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>SGST Output</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${sgst}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${invoiceItems}
                </VOUCHER>
            </TALLYMESSAGE>
        </DATA>
    </BODY>
</ENVELOPE>`;

        return xml;
    }

    /**
     * Generate Tally XML for Purchase Voucher (Metal Purchase)
     */
    generatePurchaseVoucherXML(pv) {
        const items = Array.isArray(pv.items) ? pv.items : JSON.parse(pv.items || '[]');
        
        const invoiceItems = items.map((item) => {
            const itemName = item.itemName || item.shortName || 'Metal Purchase';
            const quantity = item.pcs || item.quantity || item.weight || 1;
            const rate = item.rate || 0;
            const amount = item.total || (rate * quantity);
            
            return `
                        <INVENTORYENTRIES.LIST>
                            <STOCKITEMNAME>${this.escapeXML(itemName)}</STOCKITEMNAME>
                            <RATE>${rate}</RATE>
                            <AMOUNT>${amount}</AMOUNT>
                            <ACTUALQTY>${quantity}</ACTUALQTY>
                            <BILLEDQTY>${quantity}</BILLEDQTY>
                            <UNIT>${item.unit || 'GMS'}</UNIT>
                        </INVENTORYENTRIES.LIST>`;
        }).join('');

        const voucherDate = pv.date ? new Date(pv.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const voucherNumber = pv.pv_no || pv.pvNo || `PV-${Date.now()}`;
        const supplierName = pv.supplier_name || pv.supplierName || 'Metal Supplier';
        const total = pv.total || 0;

        const xml = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Vouchers</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
        <DATA>
            <TALLYMESSAGE>
                <VOUCHER>
                    <DATE>${voucherDate}</DATE>
                    <VOUCHERTYPE>Purchase</VOUCHERTYPE>
                    <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
                    <PARTYNAME>${this.escapeXML(supplierName)}</PARTYNAME>
                    <NARRATION>Metal Purchase - ${voucherNumber}</NARRATION>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>Purchase</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${total}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(supplierName)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${total}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    ${invoiceItems}
                </VOUCHER>
            </TALLYMESSAGE>
        </DATA>
    </BODY>
</ENVELOPE>`;

        return xml;
    }

    /**
     * Generate Tally XML for Cash Entry
     */
    generateCashEntryXML(transaction) {
        const transactionDate = transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const voucherNumber = transaction.reference || transaction.bill_no || `CASH-${Date.now()}`;
        const amount = transaction.amount || 0;
        const description = transaction.description || transaction.transaction_type || 'Cash Transaction';
        const transactionType = transaction.transaction_type || 'Cash';
        const cashType = transaction.cash_type || transaction.cashType || 'Cash-1';
        const customerName = transaction.customer_name || transaction.customerName || 'Cash';
        
        // Determine ledger based on transaction type
        let ledgerName = 'Cash';
        if (cashType === 'Cash-1') {
            ledgerName = 'Cash-1';
        } else if (cashType === 'Cash-2') {
            ledgerName = 'Cash-2';
        }

        let debitLedger = ledgerName;
        let creditLedger = '';

        if (transactionType === 'Cash Received' || transactionType === 'Payment Received') {
            creditLedger = customerName;
        } else if (transactionType === 'Cash Paid' || transactionType === 'Payment Made') {
            creditLedger = customerName;
            debitLedger = customerName;
            creditLedger = ledgerName;
        } else if (transactionType === 'Cash Transfer') {
            if (cashType === 'Cash-1') {
                debitLedger = 'Cash-2';
                creditLedger = 'Cash-1';
            } else {
                debitLedger = 'Cash-1';
                creditLedger = 'Cash-2';
            }
        } else {
            creditLedger = customerName || 'Miscellaneous';
        }

        const xml = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Vouchers</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
        <DATA>
            <TALLYMESSAGE>
                <VOUCHER>
                    <DATE>${transactionDate}</DATE>
                    <VOUCHERTYPE>Cash</VOUCHERTYPE>
                    <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
                    <NARRATION>${this.escapeXML(description)}</NARRATION>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(debitLedger)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${amount}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(creditLedger)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${amount}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                </VOUCHER>
            </TALLYMESSAGE>
        </DATA>
    </BODY>
</ENVELOPE>`;

        return xml;
    }

    /**
     * Generate Tally XML for Sales Return
     */
    generateSalesReturnXML(salesReturn) {
        const items = Array.isArray(creditNote.items) ? creditNote.items : JSON.parse(creditNote.items || '[]');
        
        const invoiceItems = items.map((item) => {
            const itemName = item.itemName || item.shortName || 'Jewelry Item';
            const quantity = item.pcs || item.quantity || 1;
            const rate = item.rate || 0;
            const amount = item.total || (rate * quantity);
            
            return `
                        <INVENTORYENTRIES.LIST>
                            <STOCKITEMNAME>${this.escapeXML(itemName)}</STOCKITEMNAME>
                            <RATE>${rate}</RATE>
                            <AMOUNT>${amount}</AMOUNT>
                            <ACTUALQTY>${quantity}</ACTUALQTY>
                            <BILLEDQTY>${quantity}</BILLEDQTY>
                            <UNIT>PCS</UNIT>
                            ${item.gst ? `<GSTAPPLICABLE>Yes</GSTAPPLICABLE>` : ''}
                            ${item.hsn ? `<HSNCODE>${item.hsn}</HSNCODE>` : ''}
                        </INVENTORYENTRIES.LIST>`;
        }).join('');

        const salesReturnDate = salesReturn.date ? new Date(salesReturn.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const salesReturnNumber = salesReturn.ssr_no || salesReturn.ssrNo || `SSR-${Date.now()}`;
        const customerName = salesReturn.customer_name || salesReturn.customerName || 'Customer';
        const netTotal = salesReturn.net_total || salesReturn.netTotal || salesReturn.total || 0;
        const gst = salesReturn.gst || 0;
        const cgst = salesReturn.cgst || 0;
        const sgst = salesReturn.sgst || 0;
        const originalBillNo = salesReturn.bill_no || salesReturn.billNo || '';
        const reason = salesReturn.reason || 'Product Return';

        const xml = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Vouchers</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
        <DATA>
            <TALLYMESSAGE>
                <VOUCHER>
                    <DATE>${salesReturnDate}</DATE>
                    <VOUCHERTYPE>Credit Note</VOUCHERTYPE>
                    <VOUCHERNUMBER>${salesReturnNumber}</VOUCHERNUMBER>
                    <PARTYNAME>${this.escapeXML(customerName)}</PARTYNAME>
                    <NARRATION>Sales Return ${salesReturnNumber} - ${this.escapeXML(reason)}${originalBillNo ? ` (Original Bill: ${originalBillNo})` : ''}</NARRATION>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>Sales</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${netTotal}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(customerName)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${netTotal}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    ${gst > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>GST Output</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${gst}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${cgst > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>CGST Output</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${cgst}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${sgst > 0 ? `
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>SGST Output</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${sgst}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>` : ''}
                    ${invoiceItems}
                </VOUCHER>
            </TALLYMESSAGE>
        </DATA>
    </BODY>
</ENVELOPE>`;

        return xml;
    }

    /**
     * Generate Tally XML for Payment/Receipt (Accounts Billing)
     */
    generatePaymentReceiptXML(transaction) {
        const transactionDate = transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const voucherNumber = transaction.reference || transaction.bill_no || `PAY-${Date.now()}`;
        const amount = transaction.amount || 0;
        const description = transaction.description || transaction.transaction_type || 'Payment';
        const transactionType = transaction.transaction_type || 'Payment';
        const customerName = transaction.customer_name || transaction.customerName || 'Customer';
        const paymentMethod = transaction.payment_method || transaction.paymentMethod || 'Cash';

        let voucherType = 'Payment';
        let debitLedger = customerName;
        let creditLedger = paymentMethod === 'Cash' ? 'Cash' : 'Bank';

        if (transactionType === 'Payment Received' || transactionType === 'Receipt') {
            voucherType = 'Receipt';
            debitLedger = paymentMethod === 'Cash' ? 'Cash' : 'Bank';
            creditLedger = customerName;
        }

        const xml = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Vouchers</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
        <DATA>
            <TALLYMESSAGE>
                <VOUCHER>
                    <DATE>${transactionDate}</DATE>
                    <VOUCHERTYPE>${voucherType}</VOUCHERTYPE>
                    <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
                    <PARTYNAME>${this.escapeXML(customerName)}</PARTYNAME>
                    <NARRATION>${this.escapeXML(description)}</NARRATION>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(debitLedger)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>${amount}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${this.escapeXML(creditLedger)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${amount}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                </VOUCHER>
            </TALLYMESSAGE>
        </DATA>
    </BODY>
</ENVELOPE>`;

        return xml;
    }

    /**
     * Send XML to Tally
     */
    async sendToTally(xml, options = {}) {
        if (!this.enabled) {
            throw new Error('Tally integration is disabled');
        }

        return new Promise((resolve, reject) => {
            const url = new URL(this.tallyUrl);
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            
            const postData = xml;
            const postOptions = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname || '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/xml',
                    'Content-Length': Buffer.byteLength(postData),
                    ...options.headers
                },
                timeout: options.timeout || 30000
            };

            const req = httpModule.request(postOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            success: true,
                            statusCode: res.statusCode,
                            data: data,
                            response: this.parseTallyResponse(data)
                        });
                    } else {
                        reject(new Error(`Tally returned status ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Failed to connect to Tally: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Tally connection timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Parse Tally response
     */
    parseTallyResponse(xmlResponse) {
        try {
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
                textNodeName: '#text'
            });
            const result = parser.parse(xmlResponse);
            return result;
        } catch (error) {
            return { raw: xmlResponse, error: error.message };
        }
    }

    /**
     * Escape XML special characters
     */
    escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Sync Sales Bill to Tally
     */
    async syncSalesBill(bill) {
        try {
            const xml = this.generateSalesInvoiceXML(bill);
            const result = await this.sendToTally(xml);
            return {
                success: true,
                type: 'Sales Bill',
                billNo: bill.bill_no || bill.billNo,
                tallyResponse: result
            };
        } catch (error) {
            return {
                success: false,
                type: 'Sales Bill',
                billNo: bill.bill_no || bill.billNo,
                error: error.message
            };
        }
    }

    /**
     * Sync Purchase Voucher to Tally
     */
    async syncPurchaseVoucher(pv) {
        try {
            const xml = this.generatePurchaseVoucherXML(pv);
            const result = await this.sendToTally(xml);
            return {
                success: true,
                type: 'Purchase Voucher',
                pvNo: pv.pv_no || pv.pvNo,
                tallyResponse: result
            };
        } catch (error) {
            return {
                success: false,
                type: 'Purchase Voucher',
                pvNo: pv.pv_no || pv.pvNo,
                error: error.message
            };
        }
    }

    /**
     * Sync Cash Entry to Tally
     */
    async syncCashEntry(transaction) {
        try {
            const xml = this.generateCashEntryXML(transaction);
            const result = await this.sendToTally(xml);
            return {
                success: true,
                type: 'Cash Entry',
                reference: transaction.reference || transaction.bill_no,
                tallyResponse: result
            };
        } catch (error) {
            return {
                success: false,
                type: 'Cash Entry',
                reference: transaction.reference || transaction.bill_no,
                error: error.message
            };
        }
    }

    /**
     * Sync Payment/Receipt to Tally
     */
    async syncPaymentReceipt(transaction) {
        try {
            const xml = this.generatePaymentReceiptXML(transaction);
            const result = await this.sendToTally(xml);
            return {
                success: true,
                type: 'Payment/Receipt',
                reference: transaction.reference || transaction.bill_no,
                tallyResponse: result
            };
        } catch (error) {
            return {
                success: false,
                type: 'Payment/Receipt',
                reference: transaction.reference || transaction.bill_no,
                error: error.message
            };
        }
    }

    /**
     * Sync Sales Return to Tally
     */
    async syncSalesReturn(salesReturn) {
        try {
            const xml = this.generateSalesReturnXML(salesReturn);
            const result = await this.sendToTally(xml);
            return {
                success: true,
                type: 'Sales Return',
                ssrNo: salesReturn.ssr_no || salesReturn.ssrNo,
                tallyResponse: result
            };
        } catch (error) {
            return {
                success: false,
                type: 'Sales Return',
                ssrNo: salesReturn.ssr_no || salesReturn.ssrNo,
                error: error.message
            };
        }
    }

    /**
     * Test Tally connection
     */
    async testConnection() {
        try {
            const testXML = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Company Info</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
    </BODY>
</ENVELOPE>`;

            const result = await this.sendToTally(testXML, { timeout: 10000 });
            return {
                success: true,
                message: 'Tally connection successful',
                response: result
            };
        } catch (error) {
            return {
                success: false,
                message: 'Tally connection failed',
                error: error.message
            };
        }
    }
}

module.exports = TallyIntegration;

