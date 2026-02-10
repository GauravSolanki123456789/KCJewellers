/**
 * Enterprise Reports Module
 * ROL Analysis Widget & GST Tax Report Dashboard
 * 
 * Features:
 * - ROL (Re-Order Level) Analysis with shortage alerts
 * - GST Tax breakdown by bill
 * - Export to Excel functionality
 * - Beautiful data visualization
 */

// ==========================================
// REPORTS MODULE
// ==========================================

const ReportsModule = {
    // State
    currentReport: null,
    gstData: null,
    rolData: null,
    
    // API Base
    get API_BASE() {
        return window.API_BASE_URL || 'http://localhost:3000/api';
    },

    // ==========================================
    // INITIALIZATION
    // ==========================================

    init() {
        // Set default dates for GST report
        this.setDefaultDates();
        
        console.log('📊 Reports Module initialized');
    },

    setDefaultDates() {
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const gstFromDate = document.getElementById('gstFromDate');
        const gstToDate = document.getElementById('gstToDate');
        
        if (gstFromDate) {
            gstFromDate.value = firstOfMonth.toISOString().split('T')[0];
        }
        if (gstToDate) {
            gstToDate.value = today.toISOString().split('T')[0];
        }
    },

    // ==========================================
    // ROL ANALYSIS REPORT
    // ==========================================

    async loadRolReport(options = {}) {
        const container = document.getElementById('reportRolSection');
        if (!container) return;
        
        // Show loading
        this.showLoading(container);
        
        try {
            const params = new URLSearchParams();
            if (options.category) params.append('category', options.category);
            if (options.show_all) params.append('show_all', 'true');
            
            const response = await fetch(`${this.API_BASE}/reports/rol-analysis?${params}`);
            
            if (!response.ok) throw new Error('Failed to fetch ROL data');
            
            const data = await response.json();
            this.rolData = data;
            
            this.renderRolReport(container, data);
            
        } catch (error) {
            console.error('ROL Report error:', error);
            container.innerHTML = `
                <div class="text-center py-12 text-red-500">
                    <div class="text-4xl mb-3">⚠️</div>
                    <p class="font-medium">Failed to load ROL Analysis</p>
                    <p class="text-sm text-gray-500 mt-1">${error.message}</p>
                    <button onclick="ReportsModule.loadRolReport()" 
                        class="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                        Retry
                    </button>
                </div>
            `;
        }
    },

    renderRolReport(container, data) {
        // Process items: Calculate Shortage = Reorder_Level - Current_Stock
        const allItems = (data.items || data || []);
        const processedItems = allItems.map(item => {
            const rolQty = parseFloat(item.rol_quantity || item.rol_qty || item.rol_limit || 0);
            const currentStock = parseFloat(item.current_stock || item.stock_qty || 0);
            const shortage = Math.max(0, rolQty - currentStock);
            
            return {
                ...item,
                rol_quantity: rolQty,
                current_stock: currentStock,
                shortage_qty: shortage
            };
        });
        
        // Filter: Only show items where Current_Stock < Reorder_Level (shortage > 0)
        const shortages = processedItems.filter(item => item.current_stock < item.rol_quantity);
        
        // Summary stats
        const totalItems = processedItems.length;
        const alertCount = shortages.length;
        const criticalCount = shortages.filter(s => s.shortage_qty > (s.rol_quantity || 0) * 0.5).length;
        
        container.innerHTML = `
            <!-- ROL Header & Filters -->
            <div class="bg-gradient-to-r from-orange-50 to-amber-50 p-4 rounded-lg mb-4 border border-orange-200">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">📉 Re-Order Level Analysis</h3>
                    <div class="flex gap-2">
                        <select id="rolCategoryFilter" onchange="ReportsModule.filterRolByCategory(this.value)"
                            class="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500">
                            <option value="">All Categories</option>
                            ${this.getUniqueCategories(data.items || data).map(cat => 
                                `<option value="${cat}">${cat}</option>`
                            ).join('')}
                        </select>
                        <button onclick="ReportsModule.loadRolReport({ show_all: true })" 
                            class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium">
                            Show All
                        </button>
                        <button onclick="ReportsModule.exportRolReport()" 
                            class="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                            📥 Export
                        </button>
                    </div>
                </div>
                
                <!-- Summary Cards -->
                <div class="grid grid-cols-4 gap-3">
                    <div class="bg-white p-3 rounded-lg shadow-sm border">
                        <p class="text-xs text-gray-500">Total Items</p>
                        <p class="text-2xl font-bold text-gray-800">${totalItems}</p>
                    </div>
                    <div class="bg-white p-3 rounded-lg shadow-sm border-2 ${alertCount > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}">
                        <p class="text-xs ${alertCount > 0 ? 'text-red-600' : 'text-green-600'}">Alerts</p>
                        <p class="text-2xl font-bold ${alertCount > 0 ? 'text-red-600' : 'text-green-600'}">${alertCount}</p>
                    </div>
                    <div class="bg-white p-3 rounded-lg shadow-sm border-2 ${criticalCount > 0 ? 'border-orange-300 bg-orange-50' : ''}">
                        <p class="text-xs text-orange-600">Critical</p>
                        <p class="text-2xl font-bold text-orange-600">${criticalCount}</p>
                    </div>
                    <div class="bg-white p-3 rounded-lg shadow-sm border">
                        <p class="text-xs text-gray-500">OK Items</p>
                        <p class="text-2xl font-bold text-green-600">${totalItems - alertCount}</p>
                    </div>
                </div>
            </div>
            
            ${alertCount > 0 ? `
                <!-- ALERT TABLE - Red themed for urgency -->
                <div class="bg-red-50 rounded-xl border-2 border-red-200 overflow-hidden mb-4">
                    <div class="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-3 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-xl animate-pulse">🚨</span>
                            <h4 class="font-bold">Shortage Alerts - Requires Immediate Action</h4>
                        </div>
                        <span class="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">${alertCount} Items</span>
                    </div>
                    <div class="overflow-x-auto max-h-96">
                        <table class="w-full text-sm">
                            <thead class="bg-red-100 sticky top-0">
                                <tr>
                                    <th class="px-3 py-2 text-left font-bold text-red-800">Style Code</th>
                                    <th class="px-3 py-2 text-left font-bold text-red-800">Item Name</th>
                                    <th class="px-3 py-2 text-left font-bold text-red-800">Category</th>
                                    <th class="px-3 py-2 text-right font-bold text-red-800">ROL Qty</th>
                                    <th class="px-3 py-2 text-right font-bold text-red-800">Current Stock</th>
                                    <th class="px-3 py-2 text-right font-bold text-red-800 bg-red-200">Shortage</th>
                                    <th class="px-3 py-2 text-center font-bold text-red-800">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-red-200">
                                ${shortages.map(item => `
                                    <tr class="hover:bg-red-100 transition">
                                        <td class="px-3 py-2 font-mono font-bold text-gray-800">${item.style_code || 'N/A'}</td>
                                        <td class="px-3 py-2">${item.item_name || item.style_name || 'Unknown'}</td>
                                        <td class="px-3 py-2">
                                            <span class="px-2 py-0.5 bg-gray-200 rounded text-xs">${item.category || 'N/A'}</span>
                                        </td>
                                        <td class="px-3 py-2 text-right font-medium">${item.rol_quantity || item.rol_qty || 0}</td>
                                        <td class="px-3 py-2 text-right font-medium">${item.current_stock || item.stock_qty || 0}</td>
                                        <td class="px-3 py-2 text-right font-bold text-red-700 bg-red-100">
                                            ${item.shortage_qty || ((item.rol_quantity || 0) - (item.current_stock || 0))}
                                        </td>
                                        <td class="px-3 py-2 text-center">
                                            ${this.getRolStatusBadge(item)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : `
                <div class="bg-green-50 rounded-xl border-2 border-green-200 p-8 text-center mb-4">
                    <div class="text-5xl mb-3">✅</div>
                    <h4 class="text-xl font-bold text-green-700 mb-1">All Stock Levels OK</h4>
                    <p class="text-green-600">No items below re-order level</p>
                </div>
            `}
            
            <!-- Full Items List (Collapsible) -->
            <details class="bg-white rounded-xl border overflow-hidden">
                <summary class="px-4 py-3 bg-gray-100 cursor-pointer font-medium text-gray-800 hover:bg-gray-200">
                    📋 View All Items (${totalItems})
                </summary>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 sticky top-0">
                            <tr>
                                <th class="px-3 py-2 text-left font-semibold">Style Code</th>
                                <th class="px-3 py-2 text-left font-semibold">Item Name</th>
                                <th class="px-3 py-2 text-left font-semibold">Category</th>
                                <th class="px-3 py-2 text-right font-semibold">ROL Qty</th>
                                <th class="px-3 py-2 text-right font-semibold">Current Stock</th>
                                <th class="px-3 py-2 text-center font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200" id="rolAllItemsBody">
                            ${processedItems.map(item => {
                                const rolQty = parseFloat(item.rol_quantity || item.rol_qty || item.rol_limit || 0);
                                const currentStock = parseFloat(item.current_stock || item.stock_qty || 0);
                                const shortage = Math.max(0, rolQty - currentStock);
                                
                                return `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-2 font-mono">${item.style_code || 'N/A'}</td>
                                    <td class="px-3 py-2">${item.item_name || item.style_name || 'Unknown'}</td>
                                    <td class="px-3 py-2">${item.category || 'N/A'}</td>
                                    <td class="px-3 py-2 text-right">${rolQty}</td>
                                    <td class="px-3 py-2 text-right">${currentStock}</td>
                                    <td class="px-3 py-2 text-center">${this.getRolStatusBadge({...item, rol_quantity: rolQty, current_stock: currentStock, shortage_qty: shortage})}</td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </details>
        `;
    },

    getRolStatusBadge(item) {
        const current = parseFloat(item.current_stock || item.stock_qty || 0);
        const rol = parseFloat(item.rol_quantity || item.rol_qty || item.rol_limit || 0);
        const shortage = parseFloat(item.shortage_qty || Math.max(0, rol - current));
        
        // If Current_Stock >= Reorder_Level, show OK
        if (current >= rol || shortage <= 0) {
            return '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">✓ OK</span>';
        } else if (shortage > rol * 0.5) {
            return '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium animate-pulse">🔴 Critical</span>';
        } else {
            return '<span class="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">⚠️ Low</span>';
        }
    },

    filterRolByCategory(category) {
        if (!this.rolData) return;
        
        const tbody = document.getElementById('rolAllItemsBody');
        if (!tbody) return;
        
        const items = this.rolData.items || this.rolData || [];
        const filtered = category ? items.filter(i => i.category === category) : items;
        
        tbody.innerHTML = filtered.map(item => `
            <tr class="hover:bg-gray-50">
                <td class="px-3 py-2 font-mono">${item.style_code || 'N/A'}</td>
                <td class="px-3 py-2">${item.item_name || item.style_name || 'Unknown'}</td>
                <td class="px-3 py-2">${item.category || 'N/A'}</td>
                <td class="px-3 py-2 text-right">${item.rol_quantity || item.rol_qty || 0}</td>
                <td class="px-3 py-2 text-right">${item.current_stock || item.stock_qty || 0}</td>
                <td class="px-3 py-2 text-center">${this.getRolStatusBadge(item)}</td>
            </tr>
        `).join('');
    },

    getUniqueCategories(items) {
        const categories = new Set();
        (items || []).forEach(item => {
            if (item.category) categories.add(item.category);
        });
        return Array.from(categories).sort();
    },

    async exportRolReport() {
        if (!this.rolData) {
            this.showNotification('No data to export. Load report first.', 'warning');
            return;
        }
        
        const items = this.rolData.items || this.rolData || [];
        
        // Create CSV content
        const headers = ['Style Code', 'Item Name', 'Category', 'ROL Qty', 'Current Stock', 'Shortage', 'Status'];
        const rows = items.map(item => {
            const current = item.current_stock || item.stock_qty || 0;
            const rol = item.rol_quantity || item.rol_qty || 0;
            const shortage = Math.max(0, rol - current);
            const status = shortage > 0 ? 'LOW' : 'OK';
            
            return [
                item.style_code || '',
                item.item_name || item.style_name || '',
                item.category || '',
                rol,
                current,
                shortage,
                status
            ];
        });
        
        this.downloadCSV([headers, ...rows], 'rol-analysis-report.csv');
        this.showNotification('📥 ROL Report exported', 'success');
    },

    // ==========================================
    // GST TAX REPORT
    // ==========================================

    async loadGstReport() {
        const container = document.getElementById('reportGstSection');
        const fromDate = document.getElementById('gstFromDate')?.value;
        const toDate = document.getElementById('gstToDate')?.value;
        
        if (!container) return;
        
        if (!fromDate || !toDate) {
            this.showNotification('Please select date range', 'warning');
            return;
        }
        
        // Show loading
        this.showLoading(container, 'Loading GST data...');
        
        try {
            const params = new URLSearchParams({
                from_date: fromDate,
                to_date: toDate
            });
            
            const response = await fetch(`${this.API_BASE}/reports/gst?${params}`);
            
            if (!response.ok) throw new Error('Failed to fetch GST data');
            
            const data = await response.json();
            this.gstData = data;
            
            this.renderGstReport(container, data);
            
        } catch (error) {
            console.error('GST Report error:', error);
            container.innerHTML = `
                <div class="text-center py-12 text-red-500">
                    <div class="text-4xl mb-3">⚠️</div>
                    <p class="font-medium">Failed to load GST Report</p>
                    <p class="text-sm text-gray-500 mt-1">${error.message}</p>
                </div>
            `;
        }
    },

    renderGstReport(container, data) {
        const bills = data.bills || data || [];
        const summary = data.summary || this.calculateGstSummary(bills);
        
        // Update summary cards
        this.updateGstSummaryCards(summary);
        
        // Render table
        const tableBody = document.getElementById('gstReportBody');
        if (tableBody) {
            if (bills.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                            <div class="text-4xl mb-3">📭</div>
                            <p class="font-medium">No bills found for selected period</p>
                        </td>
                    </tr>
                `;
            } else {
                tableBody.innerHTML = bills.map(bill => `
                    <tr class="hover:bg-gray-50 transition">
                        <td class="px-3 py-2">${this.formatDate(bill.date || bill.bill_date)}</td>
                        <td class="px-3 py-2 font-mono font-bold text-blue-600">${bill.bill_no || bill.billNo || 'N/A'}</td>
                        <td class="px-3 py-2">${bill.customer_name || bill.customerName || 'Cash'}</td>
                        <td class="px-3 py-2 text-right font-medium">₹${this.formatNumber(bill.taxable_value || bill.subtotal || 0)}</td>
                        <td class="px-3 py-2 text-right text-green-700 font-medium">₹${this.formatNumber(bill.cgst || 0)}</td>
                        <td class="px-3 py-2 text-right text-orange-700 font-medium">₹${this.formatNumber(bill.sgst || 0)}</td>
                        <td class="px-3 py-2 text-right font-medium">₹${this.formatNumber((bill.cgst || 0) + (bill.sgst || 0))}</td>
                        <td class="px-3 py-2 text-right font-bold">₹${this.formatNumber(bill.total || bill.net_total || 0)}</td>
                    </tr>
                `).join('');
                
                // Add totals row
                tableBody.innerHTML += `
                    <tr class="bg-gradient-to-r from-green-100 to-emerald-100 font-bold border-t-2 border-gray-300">
                        <td colspan="3" class="px-3 py-3 text-right">TOTALS:</td>
                        <td class="px-3 py-3 text-right">₹${this.formatNumber(summary.taxable_value)}</td>
                        <td class="px-3 py-3 text-right text-green-700">₹${this.formatNumber(summary.cgst)}</td>
                        <td class="px-3 py-3 text-right text-orange-700">₹${this.formatNumber(summary.sgst)}</td>
                        <td class="px-3 py-3 text-right">₹${this.formatNumber(summary.total_tax)}</td>
                        <td class="px-3 py-3 text-right">₹${this.formatNumber(summary.total_amount)}</td>
                    </tr>
                `;
            }
        }
    },

    updateGstSummaryCards(summary) {
        const update = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        
        update('gstTotalBills', summary.bill_count || 0);
        update('gstTaxableValue', '₹' + this.formatNumber(summary.taxable_value || 0));
        update('gstCgstTotal', '₹' + this.formatNumber(summary.cgst || 0));
        update('gstSgstTotal', '₹' + this.formatNumber(summary.sgst || 0));
        update('gstTotalTax', '₹' + this.formatNumber(summary.total_tax || 0));
    },

    calculateGstSummary(bills) {
        return {
            bill_count: bills.length,
            taxable_value: bills.reduce((sum, b) => sum + (parseFloat(b.taxable_value) || parseFloat(b.subtotal) || 0), 0),
            cgst: bills.reduce((sum, b) => sum + (parseFloat(b.cgst) || 0), 0),
            sgst: bills.reduce((sum, b) => sum + (parseFloat(b.sgst) || 0), 0),
            total_tax: bills.reduce((sum, b) => sum + (parseFloat(b.cgst) || 0) + (parseFloat(b.sgst) || 0), 0),
            total_amount: bills.reduce((sum, b) => sum + (parseFloat(b.total) || parseFloat(b.net_total) || 0), 0)
        };
    },

    async exportGstReport() {
        if (!this.gstData) {
            this.showNotification('No data to export. Generate report first.', 'warning');
            return;
        }
        
        const bills = this.gstData.bills || this.gstData || [];
        
        // Create CSV content
        const headers = ['Date', 'Bill No', 'Customer', 'Taxable Value', 'CGST', 'SGST', 'Total Tax', 'Total Amount'];
        const rows = bills.map(bill => [
            this.formatDate(bill.date || bill.bill_date),
            bill.bill_no || bill.billNo || '',
            bill.customer_name || bill.customerName || 'Cash',
            bill.taxable_value || bill.subtotal || 0,
            bill.cgst || 0,
            bill.sgst || 0,
            (bill.cgst || 0) + (bill.sgst || 0),
            bill.total || bill.net_total || 0
        ]);
        
        // Add summary row
        const summary = this.gstData.summary || this.calculateGstSummary(bills);
        rows.push([
            'TOTAL', '', '',
            summary.taxable_value,
            summary.cgst,
            summary.sgst,
            summary.total_tax,
            summary.total_amount
        ]);
        
        this.downloadCSV([headers, ...rows], 'gst-tax-report.csv');
        this.showNotification('📥 GST Report exported', 'success');
    },

    // ==========================================
    // STOCK SUMMARY REPORT
    // ==========================================

    async loadStockReport(options = {}) {
        const container = document.getElementById('reportStockSection');
        if (!container) return;
        
        this.showLoading(container);
        
        try {
            const params = new URLSearchParams();
            if (options.category) params.append('category', options.category);
            if (options.metal_type) params.append('metal_type', options.metal_type);
            
            const response = await fetch(`${this.API_BASE}/reports/stock-summary?${params}`);
            
            if (!response.ok) throw new Error('Failed to fetch stock data');
            
            const data = await response.json();
            this.renderStockReport(container, data);
            
        } catch (error) {
            console.error('Stock Report error:', error);
            container.innerHTML = `
                <div class="text-center py-12 text-red-500">
                    <div class="text-4xl mb-3">⚠️</div>
                    <p class="font-medium">Failed to load Stock Summary</p>
                    <button onclick="ReportsModule.loadStockReport()" 
                        class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Retry
                    </button>
                </div>
            `;
        }
    },

    renderStockReport(container, data) {
        const categories = data.categories || data || [];
        
        container.innerHTML = `
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg mb-4 border border-blue-200">
                <h3 class="text-lg font-bold text-gray-800 mb-4">📦 Stock Summary by Category</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${categories.map(cat => `
                        <div class="bg-white p-4 rounded-lg shadow-sm border hover:shadow-md transition">
                            <div class="flex justify-between items-start mb-3">
                                <h4 class="font-bold text-gray-800">${cat.category || 'Uncategorized'}</h4>
                                <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                    ${cat.item_count || 0} items
                                </span>
                            </div>
                            <div class="space-y-2">
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600">Total Weight:</span>
                                    <span class="font-bold text-blue-600">${(cat.total_weight || 0).toFixed(2)}g</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600">Gold:</span>
                                    <span class="font-bold text-yellow-600">${(cat.gold_weight || 0).toFixed(2)}g</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600">Silver:</span>
                                    <span class="font-bold text-gray-600">${(cat.silver_weight || 0).toFixed(2)}g</span>
                                </div>
                                <div class="flex justify-between text-sm border-t pt-2">
                                    <span class="text-gray-600">Est. Value:</span>
                                    <span class="font-bold text-green-600">₹${this.formatNumber(cat.estimated_value || 0)}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // ==========================================
    // TAG OPERATIONS HISTORY
    // ==========================================

    async loadTagOpsReport() {
        const container = document.getElementById('reportTagOpsSection');
        if (!container) return;
        
        this.showLoading(container);
        
        try {
            const response = await fetch(`${this.API_BASE}/tags/operations?limit=50`);
            
            if (!response.ok) throw new Error('Failed to fetch tag operations');
            
            const data = await response.json();
            this.renderTagOpsReport(container, data);
            
        } catch (error) {
            console.error('Tag Ops Report error:', error);
            container.innerHTML = `
                <div class="text-center py-12 text-red-500">
                    <div class="text-4xl mb-3">⚠️</div>
                    <p class="font-medium">Failed to load Tag Operations</p>
                </div>
            `;
        }
    },

    renderTagOpsReport(container, data) {
        const operations = data.operations || data || [];
        
        container.innerHTML = `
            <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg mb-4 border border-purple-200">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">✂️ Tag Operations History</h3>
                    <div class="flex gap-2">
                        <select id="tagOpsTypeFilter" onchange="ReportsModule.filterTagOps(this.value)"
                            class="px-3 py-1.5 border rounded-lg text-sm">
                            <option value="">All Types</option>
                            <option value="split">Splits</option>
                            <option value="merge">Merges</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-xl border overflow-hidden">
                <div class="overflow-x-auto max-h-96">
                    ${operations.length === 0 ? `
                        <div class="text-center py-12 text-gray-500">
                            <div class="text-4xl mb-3">📭</div>
                            <p>No tag operations found</p>
                        </div>
                    ` : `
                        <table class="w-full text-sm">
                            <thead class="bg-gray-100 sticky top-0">
                                <tr>
                                    <th class="px-3 py-2 text-left font-semibold">Date</th>
                                    <th class="px-3 py-2 text-left font-semibold">Type</th>
                                    <th class="px-3 py-2 text-left font-semibold">Source Tag(s)</th>
                                    <th class="px-3 py-2 text-left font-semibold">Result Tag(s)</th>
                                    <th class="px-3 py-2 text-right font-semibold">Weight</th>
                                    <th class="px-3 py-2 text-left font-semibold">Notes</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200" id="tagOpsReportBody">
                                ${operations.map(op => `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-3 py-2">${this.formatDate(op.created_at || op.date)}</td>
                                        <td class="px-3 py-2">
                                            ${op.operation_type === 'split' 
                                                ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">✂️ Split</span>'
                                                : '<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">🔗 Merge</span>'
                                            }
                                        </td>
                                        <td class="px-3 py-2 font-mono text-xs">${op.source_tags || op.source_tag || 'N/A'}</td>
                                        <td class="px-3 py-2 font-mono text-xs text-blue-600">${op.result_tags || op.new_tags || 'N/A'}</td>
                                        <td class="px-3 py-2 text-right font-medium">${(op.total_weight || 0).toFixed(3)}g</td>
                                        <td class="px-3 py-2 text-gray-600 text-xs">${op.notes || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    },

    // ==========================================
    // UTILITIES
    // ==========================================

    showLoading(container, message = 'Loading...') {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent mb-4"></div>
                <p class="text-gray-600">${message}</p>
            </div>
        `;
    },

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    },

    formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return parseFloat(num).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    },

    downloadCSV(data, filename) {
        const csv = data.map(row => 
            row.map(cell => {
                const value = cell?.toString() || '';
                // Escape quotes and wrap in quotes if contains comma or quote
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }).join(',')
        ).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    },

    showNotification(message, type = 'info') {
        const colors = {
            success: 'from-green-500 to-emerald-600',
            error: 'from-red-500 to-red-600',
            warning: 'from-yellow-500 to-orange-500',
            info: 'from-blue-500 to-indigo-600'
        };
        
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-6 py-3 bg-gradient-to-r ${colors[type]} text-white rounded-lg shadow-lg`;
        notification.style.animation = 'slideIn 0.3s ease-out';
        notification.innerHTML = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};

// ==========================================
// GLOBAL FUNCTIONS FOR HTML ONCLICK BINDINGS
// ==========================================

// Override existing showReport function if it exists
function showReport(reportType) {
    // Hide all report sections
    ['reportGstSection', 'reportRolSection', 'reportStockSection', 'reportTagOpsSection'].forEach(id => {
        const section = document.getElementById(id);
        if (section) section.classList.add('hidden');
    });
    
    // Update active button styles
    ['reportGstBtn', 'reportRolBtn', 'reportStockBtn', 'reportTagOpsBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('ring-4', 'ring-white/50');
        }
    });
    
    // Show selected report
    const sectionId = `report${reportType.charAt(0).toUpperCase() + reportType.slice(1)}Section`;
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.remove('hidden');
    }
    
    // Highlight active button
    const btnId = `report${reportType.charAt(0).toUpperCase() + reportType.slice(1)}Btn`;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.add('ring-4', 'ring-white/50');
    }
    
    // Load report data
    switch (reportType) {
        case 'gst':
            // GST report has its own generate button
            break;
        case 'rol':
            ReportsModule.loadRolReport();
            break;
        case 'stock':
            ReportsModule.loadStockReport();
            break;
        case 'tagops':
            ReportsModule.loadTagOpsReport();
            break;
    }
}

// GST Report functions
function loadGstReport() {
    ReportsModule.loadGstReport();
}

function exportGstReport() {
    ReportsModule.exportGstReport();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ReportsModule.init();
});

// Export for global access
window.ReportsModule = ReportsModule;
window.showReport = showReport;
window.loadGstReport = loadGstReport;
window.exportGstReport = exportGstReport;
