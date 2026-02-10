/**
 * Stock-In Smart Grid Module
 * Enterprise Feature - "Green Grid" for Purchase Voucher Stock Entry
 * 
 * Features:
 * - Dynamic table with inline editing
 * - Auto-fill from Style Code lookup
 * - Cost validation with visual indicators
 * - Paste from Excel support
 * - Bulk validation before save
 */

// ==========================================
// SMART GRID STATE & CONFIG
// ==========================================

const StockInGrid = {
    rows: [],
    rowCounter: 0,
    rates: { gold: 7500, silver: 156, platinum: 3500 },
    stylesCache: new Map(),
    isInitialized: false,
    
    // CSS classes for validation states
    CSS: {
        styleNotFound: 'bg-blue-100 border-blue-500 text-blue-800',
        costMismatch: 'bg-red-100 border-red-500 text-red-800',
        valid: 'bg-green-50 border-green-300',
        warning: 'bg-yellow-50 border-yellow-400'
    },

    // Initialize the Smart Grid
    async init() {
        if (this.isInitialized) return;
        
        await this.fetchCurrentRates();
        this.setupPasteModal();
        this.addInitialRows(5);
        this.setupKeyboardNavigation();
        this.isInitialized = true;
        
        console.log('📗 Stock-In Smart Grid initialized');
    },

    // Fetch current metal rates
    async fetchCurrentRates() {
        try {
            const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
            const response = await fetch(`${API_BASE}/rates`);
            if (response.ok) {
                const data = await response.json();
                if (data) {
                    this.rates.gold = data.gold || 7500;
                    this.rates.silver = data.silver || 156;
                    this.rates.platinum = data.platinum || 3500;
                }
            }
        } catch (error) {
            console.warn('Could not fetch rates, using defaults:', error);
        }
    },

    // ==========================================
    // TABLE RENDERING
    // ==========================================

    renderTable() {
        const container = document.getElementById('stockInGridContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg border-2 border-green-200 overflow-hidden">
                <!-- Header with Actions -->
                <div class="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-3 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">📗</span>
                        <h3 class="text-lg font-bold">Smart Stock-In Grid</h3>
                        <span class="bg-white/20 px-2 py-1 rounded text-sm" id="gridRowCount">${this.rows.length} Rows</span>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="StockInGrid.showPasteModal()" 
                            class="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded font-medium text-sm transition">
                            📋 Paste Excel
                        </button>
                        <button onclick="StockInGrid.addRow()" 
                            class="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded font-medium text-sm transition">
                            ➕ Add Row
                        </button>
                        <button onclick="StockInGrid.validateAll()" 
                            class="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 rounded font-bold text-sm transition">
                            ✅ Validate All
                        </button>
                    </div>
                </div>
                
                <!-- Table Container -->
                <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table class="w-full text-sm" id="stockInTable">
                        <thead class="bg-gray-100 sticky top-0 z-10">
                            <tr class="border-b-2 border-gray-300">
                                <th class="px-2 py-2 text-center font-bold text-gray-700 w-12 border-r">Sr</th>
                                <th class="px-2 py-2 text-left font-bold text-gray-700 w-32 border-r bg-blue-50">Style Code</th>
                                <th class="px-2 py-2 text-left font-bold text-gray-700 w-28 border-r">Tag No</th>
                                <th class="px-2 py-2 text-right font-bold text-gray-700 w-24 border-r">Gross Wt</th>
                                <th class="px-2 py-2 text-right font-bold text-gray-700 w-24 border-r">Net Wt</th>
                                <th class="px-2 py-2 text-center font-bold text-gray-700 w-20 border-r">Purity</th>
                                <th class="px-2 py-2 text-right font-bold text-gray-700 w-24 border-r">MC</th>
                                <th class="px-2 py-2 text-right font-bold text-gray-700 w-28 border-r bg-orange-50">Cost</th>
                                <th class="px-2 py-2 text-left font-bold text-gray-700 w-32 border-r">Category</th>
                                <th class="px-2 py-2 text-center font-bold text-gray-700 w-24 border-r">Status</th>
                                <th class="px-2 py-2 text-center font-bold text-gray-700 w-16">Action</th>
                            </tr>
                        </thead>
                        <tbody id="stockInTableBody">
                            ${this.rows.map((row, idx) => this.renderRow(row, idx)).join('')}
                        </tbody>
                    </table>
                </div>
                
                <!-- Summary Footer -->
                <div class="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 border-t-2 border-gray-200">
                    <div class="grid grid-cols-5 gap-4 text-center">
                        <div>
                            <p class="text-xs text-gray-600">Total Rows</p>
                            <p class="text-lg font-bold text-gray-800" id="gridTotalRows">${this.rows.length}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Gross Weight</p>
                            <p class="text-lg font-bold text-blue-600" id="gridTotalGrossWt">${this.getTotalGrossWt().toFixed(3)}g</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Net Weight</p>
                            <p class="text-lg font-bold text-green-600" id="gridTotalNetWt">${this.getTotalNetWt().toFixed(3)}g</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Total Cost</p>
                            <p class="text-lg font-bold text-amber-600" id="gridTotalCost">₹${this.getTotalCost().toLocaleString()}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Valid Rows</p>
                            <p class="text-lg font-bold text-emerald-600" id="gridValidRows">${this.getValidRowCount()}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
    },

    renderRow(row, idx) {
        const statusBadge = this.getStatusBadge(row.status);
        const styleClass = row.status === 'STYLE_NOT_FOUND' ? this.CSS.styleNotFound : '';
        const costClass = row.status === 'COST_MISMATCH' ? this.CSS.costMismatch : '';
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition" data-row-id="${row.id}">
                <td class="px-2 py-1.5 text-center font-medium text-gray-600 border-r">${idx + 1}</td>
                <td class="px-1 py-1 border-r">
                    <input type="text" value="${row.style_code || ''}" 
                        data-field="style_code" data-row-id="${row.id}"
                        class="w-full px-2 py-1 border rounded text-sm font-mono uppercase focus:ring-2 focus:ring-blue-400 ${styleClass}"
                        placeholder="RING-01" onblur="StockInGrid.onStyleCodeBlur(${row.id})">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="text" value="${row.tag_no || ''}" 
                        data-field="tag_no" data-row-id="${row.id}"
                        class="w-full px-2 py-1 bg-gray-100 border rounded text-sm font-mono"
                        ${row.tag_no ? 'readonly' : ''} placeholder="Auto">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="number" step="0.001" value="${row.gross_wt || ''}" 
                        data-field="gross_wt" data-row-id="${row.id}"
                        class="w-full px-2 py-1 border rounded text-sm text-right focus:ring-2 focus:ring-green-400"
                        placeholder="0.000" onchange="StockInGrid.onWeightChange(${row.id})">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="number" step="0.001" value="${row.net_wt || ''}" 
                        data-field="net_wt" data-row-id="${row.id}"
                        class="w-full px-2 py-1 border rounded text-sm text-right focus:ring-2 focus:ring-green-400"
                        placeholder="0.000" onchange="StockInGrid.onWeightChange(${row.id})">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="number" step="0.1" value="${row.purity || 91.6}" 
                        data-field="purity" data-row-id="${row.id}"
                        class="w-full px-2 py-1 border rounded text-sm text-center focus:ring-2 focus:ring-purple-400"
                        placeholder="91.6">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="number" step="0.01" value="${row.mc_value || ''}" 
                        data-field="mc_value" data-row-id="${row.id}"
                        class="w-full px-2 py-1 border rounded text-sm text-right focus:ring-2 focus:ring-amber-400"
                        placeholder="0">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="number" step="0.01" value="${row.cost || ''}" 
                        data-field="cost" data-row-id="${row.id}"
                        class="w-full px-2 py-1 border rounded text-sm text-right font-bold focus:ring-2 focus:ring-orange-400 ${costClass}"
                        placeholder="0" onblur="StockInGrid.onCostBlur(${row.id})">
                </td>
                <td class="px-1 py-1 border-r">
                    <input type="text" value="${row.category || ''}" 
                        data-field="category" data-row-id="${row.id}"
                        class="w-full px-2 py-1 bg-gray-50 border rounded text-sm"
                        placeholder="Auto" readonly>
                </td>
                <td class="px-1 py-1 border-r text-center">
                    ${statusBadge}
                </td>
                <td class="px-1 py-1 text-center">
                    <button onclick="StockInGrid.deleteRow(${row.id})" 
                        class="px-2 py-1 text-red-600 hover:bg-red-50 rounded transition">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    },

    getStatusBadge(status) {
        const badges = {
            'VALID': '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">✓ Valid</span>',
            'STYLE_NOT_FOUND': '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">📘 New</span>',
            'COST_MISMATCH': '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">⚠️ Cost</span>',
            'DUPLICATE_TAG': '<span class="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">🔄 Dup</span>',
            'INVALID_DATA': '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">❌ Invalid</span>',
            'PENDING': '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">⏳ Pending</span>'
        };
        return badges[status] || badges['PENDING'];
    },

    // ==========================================
    // ROW MANAGEMENT
    // ==========================================

    addRow(data = {}) {
        const newRow = {
            id: ++this.rowCounter,
            style_code: data.style_code || '',
            tag_no: data.tag_no || '',
            gross_wt: data.gross_wt || '',
            net_wt: data.net_wt || '',
            purity: data.purity || 91.6,
            mc_value: data.mc_value || '',
            mc_type: data.mc_type || 'PER_GRAM',
            cost: data.cost || '',
            category: data.category || '',
            metal_type: data.metal_type || 'gold',
            status: 'PENDING',
            errors: []
        };
        
        this.rows.push(newRow);
        this.renderTable();
        
        // Focus on the new row's style code input
        setTimeout(() => {
            const input = document.querySelector(`input[data-row-id="${newRow.id}"][data-field="style_code"]`);
            if (input) input.focus();
        }, 50);
        
        return newRow;
    },

    addInitialRows(count) {
        for (let i = 0; i < count; i++) {
            this.rows.push({
                id: ++this.rowCounter,
                style_code: '',
                tag_no: '',
                gross_wt: '',
                net_wt: '',
                purity: 91.6,
                mc_value: '',
                mc_type: 'PER_GRAM',
                cost: '',
                category: '',
                metal_type: 'gold',
                status: 'PENDING',
                errors: []
            });
        }
    },

    deleteRow(rowId) {
        this.rows = this.rows.filter(r => r.id !== rowId);
        this.renderTable();
        this.updateSummary();
    },

    getRowById(rowId) {
        return this.rows.find(r => r.id === rowId);
    },

    updateRowField(rowId, field, value) {
        const row = this.getRowById(rowId);
        if (row) {
            row[field] = value;
        }
    },

    // ==========================================
    // EVENT HANDLERS - THE "SMART" PART
    // ==========================================

    async onStyleCodeBlur(rowId) {
        const row = this.getRowById(rowId);
        if (!row || !row.style_code) return;
        
        const styleCode = row.style_code.toUpperCase().trim();
        row.style_code = styleCode;
        
        // Check cache first
        if (this.stylesCache.has(styleCode)) {
            this.applyStyleData(row, this.stylesCache.get(styleCode));
            return;
        }
        
        try {
            const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
            const response = await fetch(`${API_BASE}/styles/${encodeURIComponent(styleCode)}`);
            
            if (response.ok) {
                const styleData = await response.json();
                this.stylesCache.set(styleCode, styleData);
                this.applyStyleData(row, styleData);
            } else if (response.status === 404) {
                // Style not found - highlight blue
                row.status = 'STYLE_NOT_FOUND';
                this.highlightField(rowId, 'style_code', 'blue');
            }
        } catch (error) {
            console.error('Error fetching style:', error);
        }
        
        this.renderTable();
    },

    applyStyleData(row, styleData) {
        // Auto-fill from style master
        row.purity = styleData.default_purity || row.purity;
        row.mc_value = styleData.default_mc_value || row.mc_value;
        row.mc_type = styleData.default_mc_type || 'PER_GRAM';
        row.category = styleData.category || '';
        row.metal_type = styleData.metal_type || 'gold';
        row.status = 'VALID';
        row.errors = [];
        
        // Update UI
        this.renderTable();
        this.showNotification(`Style "${styleData.style_code}" auto-filled`, 'success');
    },

    onWeightChange(rowId) {
        const row = this.getRowById(rowId);
        if (!row) return;
        
        // Auto-fill net weight if empty
        if (row.gross_wt && !row.net_wt) {
            row.net_wt = row.gross_wt;
        }
        
        this.updateSummary();
    },

    onCostBlur(rowId) {
        const row = this.getRowById(rowId);
        if (!row || !row.cost || !row.gross_wt) return;
        
        // Calculate expected cost
        const metalRate = this.rates[row.metal_type] || this.rates.gold;
        const netWt = parseFloat(row.net_wt) || parseFloat(row.gross_wt);
        const purity = parseFloat(row.purity) || 91.6;
        const mcValue = parseFloat(row.mc_value) || 0;
        
        const metalValue = netWt * metalRate * (purity / 100);
        const mcAmount = row.mc_type === 'FIXED' ? mcValue : (netWt * mcValue);
        const expectedCost = metalValue + mcAmount;
        
        const cost = parseFloat(row.cost);
        
        // Check if cost is too low (more than 20% below expected)
        if (cost < expectedCost * 0.8) {
            row.status = 'COST_MISMATCH';
            row.errors.push(`Cost too low. Expected ~₹${Math.round(expectedCost)}`);
            this.highlightField(rowId, 'cost', 'red');
            this.showNotification(`⚠️ Row ${rowId}: Cost below expected (₹${Math.round(expectedCost)})`, 'warning');
        } else if (cost > expectedCost * 1.3) {
            row.status = 'COST_MISMATCH';
            row.errors.push(`Cost too high. Expected ~₹${Math.round(expectedCost)}`);
            this.highlightField(rowId, 'cost', 'red');
        } else {
            // Cost is within acceptable range
            if (row.status === 'COST_MISMATCH') {
                row.status = 'VALID';
                row.errors = row.errors.filter(e => !e.includes('Cost'));
            }
            this.highlightField(rowId, 'cost', 'green');
        }
        
        this.renderTable();
        this.updateSummary();
    },

    highlightField(rowId, field, color) {
        const input = document.querySelector(`input[data-row-id="${rowId}"][data-field="${field}"]`);
        if (!input) return;
        
        input.classList.remove('bg-blue-100', 'border-blue-500', 'bg-red-100', 'border-red-500', 'bg-green-100', 'border-green-500');
        
        if (color === 'blue') {
            input.classList.add('bg-blue-100', 'border-blue-500');
        } else if (color === 'red') {
            input.classList.add('bg-red-100', 'border-red-500');
        } else if (color === 'green') {
            input.classList.add('bg-green-50', 'border-green-400');
        }
    },

    attachEventListeners() {
        // Attach input change listeners
        document.querySelectorAll('#stockInTable input').forEach(input => {
            input.addEventListener('change', (e) => {
                const rowId = parseInt(e.target.dataset.rowId);
                const field = e.target.dataset.field;
                let value = e.target.value;
                
                if (['gross_wt', 'net_wt', 'purity', 'mc_value', 'cost'].includes(field)) {
                    value = parseFloat(value) || '';
                }
                
                this.updateRowField(rowId, field, value);
                this.updateSummary();
            });
        });
    },

    // ==========================================
    // VALIDATION
    // ==========================================

    async validateAll() {
        // Gather all rows with data
        const rowsWithData = this.rows.filter(r => r.style_code || r.gross_wt);
        
        if (rowsWithData.length === 0) {
            this.showNotification('No data to validate', 'warning');
            return;
        }
        
        // Show loading state with global loader
        const btn = document.querySelector('button[onclick="StockInGrid.validateAll()"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Validating...';
        }
        if (typeof showLoader === 'function') showLoader('Validating stock entries...');
        
        try {
            const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
            const response = await fetch(`${API_BASE}/purchase-vouchers/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: rowsWithData })
            });
            
            if (!response.ok) throw new Error('Validation failed');
            
            const result = await response.json();
            
            // Update rows with validation results
            result.rows.forEach(validatedRow => {
                const localRow = this.rows[validatedRow.row_index];
                if (localRow) {
                    localRow.status = validatedRow.status;
                    localRow.errors = validatedRow.errors;
                }
            });
            
            // Update rates from response
            if (result.rates) {
                this.rates = { ...this.rates, ...result.rates };
            }
            
            this.renderTable();
            
            // Show results
            const validCount = result.valid;
            const invalidCount = result.invalid;
            
            if (invalidCount === 0) {
                this.showNotification(`✅ All ${validCount} rows are valid!`, 'success');
            } else {
                this.showNotification(`⚠️ ${validCount} valid, ${invalidCount} need attention`, 'warning');
            }
            
        } catch (error) {
            console.error('Validation error:', error);
            this.showNotification('Validation failed. Please try again.', 'error');
        } finally {
            if (typeof hideLoader === 'function') hideLoader();
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '✅ Validate All';
            }
        }
    },

    // ==========================================
    // PASTE FROM EXCEL
    // ==========================================

    setupPasteModal() {
        // Create the paste modal if not exists
        if (document.getElementById('pasteExcelModal')) return;
        
        const modal = document.createElement('div');
        modal.id = 'pasteExcelModal';
        modal.className = 'fixed inset-0 flex items-center justify-center z-50 hidden';
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-50" onclick="StockInGrid.closePasteModal()"></div>
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 relative z-10 overflow-hidden">
                <div class="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4">
                    <h3 class="text-xl font-bold">📋 Paste from Excel</h3>
                    <p class="text-sm opacity-90 mt-1">Copy rows from Excel and paste below</p>
                </div>
                <div class="p-6">
                    <div class="mb-4">
                        <p class="text-sm text-gray-600 mb-2"><strong>Expected columns (tab-separated):</strong></p>
                        <div class="bg-gray-100 p-2 rounded text-xs font-mono">
                            Style Code | Tag No | Gross Wt | Net Wt | Purity | MC | Cost
                        </div>
                    </div>
                    <textarea id="pasteExcelTextarea" 
                        class="w-full h-48 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono text-sm"
                        placeholder="Paste Excel data here..."></textarea>
                    <div class="flex gap-3 mt-4">
                        <button onclick="StockInGrid.processPastedData()" 
                            class="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold">
                            📥 Import Data
                        </button>
                        <button onclick="StockInGrid.closePasteModal()" 
                            class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    showPasteModal() {
        const modal = document.getElementById('pasteExcelModal');
        if (modal) {
            modal.classList.remove('hidden');
            const textarea = document.getElementById('pasteExcelTextarea');
            if (textarea) {
                textarea.value = '';
                textarea.focus();
            }
        }
    },

    closePasteModal() {
        const modal = document.getElementById('pasteExcelModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    processPastedData() {
        const textarea = document.getElementById('pasteExcelTextarea');
        if (!textarea || !textarea.value.trim()) {
            this.showNotification('No data to import', 'warning');
            return;
        }
        
        const lines = textarea.value.trim().split('\n');
        let importedCount = 0;
        
        lines.forEach(line => {
            const cells = line.split('\t');
            if (cells.length >= 3) { // At least Style Code, Tag, and Gross Wt
                const rowData = {
                    style_code: (cells[0] || '').trim().toUpperCase(),
                    tag_no: (cells[1] || '').trim(),
                    gross_wt: parseFloat(cells[2]) || '',
                    net_wt: parseFloat(cells[3]) || parseFloat(cells[2]) || '',
                    purity: parseFloat(cells[4]) || 91.6,
                    mc_value: parseFloat(cells[5]) || '',
                    cost: parseFloat(cells[6]) || ''
                };
                
                if (rowData.style_code || rowData.gross_wt) {
                    this.addRow(rowData);
                    importedCount++;
                }
            }
        });
        
        this.closePasteModal();
        this.showNotification(`📥 Imported ${importedCount} rows`, 'success');
        
        // Trigger validation for style codes
        setTimeout(() => {
            this.rows.forEach(row => {
                if (row.style_code) {
                    this.onStyleCodeBlur(row.id);
                }
            });
        }, 100);
    },

    // ==========================================
    // KEYBOARD NAVIGATION
    // ==========================================

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('stockInTable')) return;
            
            const activeEl = document.activeElement;
            if (!activeEl || !activeEl.dataset.rowId) return;
            
            const rowId = parseInt(activeEl.dataset.rowId);
            const field = activeEl.dataset.field;
            
            // Tab / Enter to move to next cell
            if (e.key === 'Tab' || e.key === 'Enter') {
                const fields = ['style_code', 'tag_no', 'gross_wt', 'net_wt', 'purity', 'mc_value', 'cost'];
                const currentIdx = fields.indexOf(field);
                
                if (e.key === 'Enter' && field === 'cost') {
                    // Add new row when pressing Enter on last field
                    e.preventDefault();
                    this.addRow();
                }
            }
            
            // Ctrl+V in table context
            if (e.ctrlKey && e.key === 'v') {
                // Allow default paste in inputs
            }
        });
    },

    // ==========================================
    // SUMMARY & UTILITIES
    // ==========================================

    updateSummary() {
        const totalRows = document.getElementById('gridTotalRows');
        const totalGrossWt = document.getElementById('gridTotalGrossWt');
        const totalNetWt = document.getElementById('gridTotalNetWt');
        const totalCost = document.getElementById('gridTotalCost');
        const validRows = document.getElementById('gridValidRows');
        const rowCount = document.getElementById('gridRowCount');
        
        if (totalRows) totalRows.textContent = this.rows.length;
        if (totalGrossWt) totalGrossWt.textContent = this.getTotalGrossWt().toFixed(3) + 'g';
        if (totalNetWt) totalNetWt.textContent = this.getTotalNetWt().toFixed(3) + 'g';
        if (totalCost) totalCost.textContent = '₹' + this.getTotalCost().toLocaleString();
        if (validRows) validRows.textContent = this.getValidRowCount();
        if (rowCount) rowCount.textContent = `${this.rows.length} Rows`;
    },

    getTotalGrossWt() {
        return this.rows.reduce((sum, r) => sum + (parseFloat(r.gross_wt) || 0), 0);
    },

    getTotalNetWt() {
        return this.rows.reduce((sum, r) => sum + (parseFloat(r.net_wt) || parseFloat(r.gross_wt) || 0), 0);
    },

    getTotalCost() {
        return this.rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    },

    getValidRowCount() {
        return this.rows.filter(r => r.status === 'VALID').length;
    },

    // Get all validated rows for saving
    getValidatedRows() {
        return this.rows.filter(r => r.style_code || r.gross_wt);
    },

    // Clear all rows
    clearGrid() {
        if (confirm('Clear all rows? This cannot be undone.')) {
            this.rows = [];
            this.rowCounter = 0;
            this.addInitialRows(5);
            this.renderTable();
        }
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the right tab/page
    const pvTab = document.getElementById('pvTab');
    if (pvTab) {
        // Add container for the grid
        const gridContainer = document.createElement('div');
        gridContainer.id = 'stockInGridContainer';
        gridContainer.className = 'mb-6';
        
        // Insert after the PV statistics
        const statsDiv = pvTab.querySelector('.grid.grid-cols-2.md\\:grid-cols-4');
        if (statsDiv && statsDiv.parentNode) {
            statsDiv.parentNode.insertBefore(gridContainer, statsDiv.nextSibling);
        }
    }
});

// Export for global access
window.StockInGrid = StockInGrid;
