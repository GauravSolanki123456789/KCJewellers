/**
 * Tag Operations Module - Split & Merge
 * Enterprise Feature for Tag/Barcode Management
 * 
 * Features:
 * - Split a single tag into multiple tags
 * - Merge multiple tags into one
 * - Weight validation (sum must match)
 * - Print new tags on completion
 */

// ==========================================
// TAG OPERATIONS STATE
// ==========================================

const TagOps = {
    // Split state
    splitSource: null,
    splitEntries: [],
    splitCounter: 0,
    
    // Merge state
    mergeSourceTags: [],
    
    // API Base
    get API_BASE() {
        return window.API_BASE_URL || 'http://localhost:3000/api';
    },

    // ==========================================
    // SPLIT MODULE
    // ==========================================

    /**
     * Initialize split module with a source tag scan
     */
    async scanSourceTag(barcode) {
        if (!barcode || barcode.trim() === '') {
            this.showNotification('Please enter a barcode to scan', 'warning');
            return;
        }
        
        barcode = barcode.trim().toUpperCase();
        
        try {
            // Fetch product details
            const response = await fetch(`${this.API_BASE}/products/search?barcode=${encodeURIComponent(barcode)}`);
            
            if (!response.ok) {
                throw new Error('Product not found');
            }
            
            const products = await response.json();
            const product = Array.isArray(products) ? products[0] : products;
            
            if (!product) {
                this.showNotification(`No product found with barcode: ${barcode}`, 'error');
                return;
            }
            
            // Set as source
            this.splitSource = {
                barcode: product.barcode,
                tag_no: product.tag_no || product.barcode,
                product_name: product.item_name || product.short_name || 'Unknown',
                weight: parseFloat(product.weight) || parseFloat(product.net_wt) || 0,
                pcs: parseInt(product.pcs) || 1,
                metal_type: product.metal_type || 'gold',
                purity: product.purity || 91.6,
                mc_rate: product.mc_rate || 0,
                style_code: product.style_code || ''
            };
            
            // Clear previous entries
            this.splitEntries = [];
            this.splitCounter = 0;
            
            // Show the split form
            this.renderSplitUI();
            
            this.showNotification(`Loaded: ${this.splitSource.product_name}`, 'success');
            
        } catch (error) {
            console.error('Error scanning tag:', error);
            this.showNotification('Failed to load product. Please check the barcode.', 'error');
        }
    },

    renderSplitUI() {
        const container = document.getElementById('splitModuleContainer');
        if (!container) return;
        
        const source = this.splitSource;
        if (!source) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <div class="text-5xl mb-4">📷</div>
                    <p class="text-lg">Scan a barcode to start splitting</p>
                </div>
            `;
            return;
        }
        
        const remainingWeight = this.getRemainingWeight();
        const remainingPcs = this.getRemainingPcs();
        const isValid = Math.abs(remainingWeight) < 0.001 && remainingPcs === 0;
        
        container.innerHTML = `
            <!-- Source Tag Info Card -->
            <div class="bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-xl border-2 border-amber-300 mb-6">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-xs text-gray-500 uppercase tracking-wide">Source Tag</span>
                        <h3 class="text-2xl font-bold text-gray-800">${source.tag_no}</h3>
                        <p class="text-gray-600">${source.product_name}</p>
                    </div>
                    <div class="text-right">
                        <div class="bg-white px-4 py-2 rounded-lg shadow border">
                            <p class="text-xs text-gray-500">Original Weight</p>
                            <p class="text-2xl font-bold text-blue-600">${source.weight.toFixed(3)}g</p>
                        </div>
                        <div class="mt-2 bg-white px-4 py-2 rounded-lg shadow border">
                            <p class="text-xs text-gray-500">Pieces</p>
                            <p class="text-xl font-bold text-green-600">${source.pcs}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Add Split Entry Form -->
            <div class="bg-white p-4 rounded-xl border-2 border-gray-200 mb-4">
                <h4 class="font-bold text-gray-800 mb-3">➕ Add New Split Tag</h4>
                <div class="grid grid-cols-4 gap-4">
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Weight (g) *</label>
                        <input type="number" step="0.001" id="splitNewWeight" 
                            class="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg font-bold"
                            placeholder="0.000" onkeypress="if(event.key==='Enter') TagOps.addSplitEntry()">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Pieces</label>
                        <input type="number" id="splitNewPcs" value="1" min="1"
                            class="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Tag Prefix (Optional)</label>
                        <input type="text" id="splitTagPrefix" 
                            class="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Auto">
                    </div>
                    <div class="flex items-end">
                        <button onclick="TagOps.addSplitEntry()"
                            class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition">
                            ➕ Add Split
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Remaining Display -->
            <div class="bg-gradient-to-r ${isValid ? 'from-green-50 to-emerald-50 border-green-300' : 'from-orange-50 to-yellow-50 border-orange-300'} p-4 rounded-lg border-2 mb-4">
                <div class="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p class="text-sm text-gray-600">Remaining Weight</p>
                        <p class="text-3xl font-bold ${remainingWeight < 0 ? 'text-red-600' : remainingWeight === 0 ? 'text-green-600' : 'text-orange-600'}">
                            ${remainingWeight.toFixed(3)}g
                        </p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Remaining Pieces</p>
                        <p class="text-3xl font-bold ${remainingPcs < 0 ? 'text-red-600' : remainingPcs === 0 ? 'text-green-600' : 'text-orange-600'}">
                            ${remainingPcs}
                        </p>
                    </div>
                </div>
                ${!isValid && this.splitEntries.length > 0 ? `
                    <p class="text-center mt-2 text-sm text-orange-700">
                        ⚠️ Sum of split weights must equal original weight (${source.weight.toFixed(3)}g)
                    </p>
                ` : ''}
            </div>
            
            <!-- Split Entries Table -->
            <div class="bg-white rounded-xl border-2 border-gray-200 overflow-hidden mb-4">
                <div class="bg-gray-100 px-4 py-3 border-b">
                    <h4 class="font-bold text-gray-800">
                        Split Tags <span class="text-gray-500 font-normal">(${this.splitEntries.length} entries)</span>
                    </h4>
                </div>
                <div class="overflow-x-auto max-h-64">
                    ${this.splitEntries.length === 0 ? `
                        <div class="text-center py-8 text-gray-500">
                            <p>No split entries yet. Add weights above.</p>
                        </div>
                    ` : `
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-4 py-2 text-left font-medium">#</th>
                                    <th class="px-4 py-2 text-left font-medium">New Tag</th>
                                    <th class="px-4 py-2 text-right font-medium">Weight (g)</th>
                                    <th class="px-4 py-2 text-center font-medium">Pieces</th>
                                    <th class="px-4 py-2 text-center font-medium">Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                ${this.splitEntries.map((entry, idx) => `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-4 py-2">${idx + 1}</td>
                                        <td class="px-4 py-2 font-mono text-blue-600">${entry.new_tag}</td>
                                        <td class="px-4 py-2 text-right font-bold">${entry.weight.toFixed(3)}</td>
                                        <td class="px-4 py-2 text-center">${entry.pcs}</td>
                                        <td class="px-4 py-2 text-center">
                                            <button onclick="TagOps.removeSplitEntry(${entry.id})"
                                                class="text-red-600 hover:bg-red-50 px-2 py-1 rounded transition">
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="flex gap-4">
                <button onclick="TagOps.completeSplit()" 
                    ${!isValid || this.splitEntries.length < 2 ? 'disabled' : ''}
                    class="flex-1 px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                    ✅ Complete Split & Generate Tags
                </button>
                <button onclick="TagOps.cancelSplit()"
                    class="px-6 py-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-bold transition">
                    Cancel
                </button>
            </div>
        `;
        
        // Focus on weight input
        setTimeout(() => {
            const weightInput = document.getElementById('splitNewWeight');
            if (weightInput) weightInput.focus();
        }, 50);
    },

    addSplitEntry() {
        const weightInput = document.getElementById('splitNewWeight');
        const pcsInput = document.getElementById('splitNewPcs');
        const prefixInput = document.getElementById('splitTagPrefix');
        
        const weight = parseFloat(weightInput.value);
        const pcs = parseInt(pcsInput.value) || 1;
        const prefix = prefixInput.value.trim() || this.splitSource.tag_no;
        
        if (!weight || weight <= 0) {
            this.showNotification('Please enter a valid weight', 'warning');
            return;
        }
        
        // Check if remaining weight is sufficient
        const remaining = this.getRemainingWeight();
        if (weight > remaining + 0.001) {
            this.showNotification(`Weight exceeds remaining (${remaining.toFixed(3)}g)`, 'error');
            return;
        }
        
        const entry = {
            id: ++this.splitCounter,
            new_tag: `${prefix}-S${this.splitEntries.length + 1}`,
            weight: weight,
            pcs: pcs
        };
        
        this.splitEntries.push(entry);
        
        // Clear input
        weightInput.value = '';
        pcsInput.value = '1';
        
        this.renderSplitUI();
    },

    removeSplitEntry(entryId) {
        this.splitEntries = this.splitEntries.filter(e => e.id !== entryId);
        this.renderSplitUI();
    },

    getRemainingWeight() {
        if (!this.splitSource) return 0;
        const usedWeight = this.splitEntries.reduce((sum, e) => sum + e.weight, 0);
        return this.splitSource.weight - usedWeight;
    },

    getRemainingPcs() {
        if (!this.splitSource) return 0;
        const usedPcs = this.splitEntries.reduce((sum, e) => sum + e.pcs, 0);
        return this.splitSource.pcs - usedPcs;
    },

    async completeSplit() {
        if (!this.splitSource || this.splitEntries.length < 2) {
            this.showNotification('Need at least 2 split entries', 'warning');
            return;
        }
        
        const remaining = this.getRemainingWeight();
        if (Math.abs(remaining) > 0.001) {
            this.showNotification(`Weight mismatch: ${remaining.toFixed(3)}g remaining`, 'error');
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE}/tags/split`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_tag: this.splitSource.tag_no,
                    split_into: this.splitEntries.length,
                    weights: this.splitEntries.map(e => ({
                        weight: e.weight,
                        pcs: e.pcs,
                        tag_prefix: e.new_tag
                    })),
                    notes: `Split from ${this.splitSource.tag_no}`
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Split operation failed');
            }
            
            const result = await response.json();
            
            this.showNotification(`✅ Split complete! Created ${result.new_tags?.length || this.splitEntries.length} new tags`, 'success');
            
            // Reset state
            this.cancelSplit();
            
            // Offer to print labels
            if (result.new_tags && result.new_tags.length > 0) {
                if (confirm('Would you like to print labels for the new tags?')) {
                    this.printTags(result.new_tags);
                }
            }
            
        } catch (error) {
            console.error('Split error:', error);
            this.showNotification(`Split failed: ${error.message}`, 'error');
        }
    },

    cancelSplit() {
        this.splitSource = null;
        this.splitEntries = [];
        this.splitCounter = 0;
        
        const container = document.getElementById('splitModuleContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <div class="text-5xl mb-4">📷</div>
                    <p class="text-lg">Scan a barcode to start splitting</p>
                </div>
            `;
        }
        
        // Clear scanner input
        const scannerInput = document.getElementById('splitScannerInput');
        if (scannerInput) {
            scannerInput.value = '';
            scannerInput.focus();
        }
    },

    // ==========================================
    // MERGE MODULE
    // ==========================================

    async addMergeTag(barcode) {
        if (!barcode || barcode.trim() === '') {
            return;
        }
        
        barcode = barcode.trim().toUpperCase();
        
        // Check if already added
        if (this.mergeSourceTags.find(t => t.barcode === barcode)) {
            this.showNotification('Tag already added', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE}/products/search?barcode=${encodeURIComponent(barcode)}`);
            
            if (!response.ok) {
                throw new Error('Product not found');
            }
            
            const products = await response.json();
            const product = Array.isArray(products) ? products[0] : products;
            
            if (!product) {
                this.showNotification(`No product found: ${barcode}`, 'error');
                return;
            }
            
            this.mergeSourceTags.push({
                barcode: product.barcode,
                tag_no: product.tag_no || product.barcode,
                product_name: product.item_name || product.short_name || 'Unknown',
                weight: parseFloat(product.weight) || parseFloat(product.net_wt) || 0,
                pcs: parseInt(product.pcs) || 1,
                style_code: product.style_code || ''
            });
            
            this.renderMergeUI();
            this.showNotification(`Added: ${product.item_name || barcode}`, 'success');
            
        } catch (error) {
            console.error('Error adding tag:', error);
            this.showNotification('Failed to add tag', 'error');
        }
    },

    removeMergeTag(barcode) {
        this.mergeSourceTags = this.mergeSourceTags.filter(t => t.barcode !== barcode);
        this.renderMergeUI();
    },

    getMergeTotalWeight() {
        return this.mergeSourceTags.reduce((sum, t) => sum + t.weight, 0);
    },

    getMergeTotalPcs() {
        return this.mergeSourceTags.reduce((sum, t) => sum + t.pcs, 0);
    },

    renderMergeUI() {
        const container = document.getElementById('mergeModuleContainer');
        if (!container) return;
        
        const totalWeight = this.getMergeTotalWeight();
        const totalPcs = this.getMergeTotalPcs();
        
        container.innerHTML = `
            <!-- Add Tag Input -->
            <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border-2 border-purple-200 mb-4">
                <div class="flex gap-4">
                    <div class="flex-1">
                        <label class="block text-xs font-medium text-gray-700 mb-1">Scan Tag to Add</label>
                        <input type="text" id="mergeScannerInput" 
                            class="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-lg font-mono"
                            placeholder="Scan barcode..." 
                            onkeypress="if(event.key==='Enter') { TagOps.addMergeTag(this.value); this.value=''; }">
                    </div>
                    <div class="flex items-end">
                        <button onclick="const inp = document.getElementById('mergeScannerInput'); TagOps.addMergeTag(inp.value); inp.value='';"
                            class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold transition">
                            ➕ Add
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Tags List -->
            <div class="bg-white rounded-xl border-2 border-gray-200 overflow-hidden mb-4">
                <div class="bg-gray-100 px-4 py-3 border-b flex justify-between items-center">
                    <h4 class="font-bold text-gray-800">
                        Tags to Merge <span class="text-gray-500 font-normal">(${this.mergeSourceTags.length} tags)</span>
                    </h4>
                    ${this.mergeSourceTags.length > 0 ? `
                        <button onclick="TagOps.clearMergeTags()" class="text-sm text-red-600 hover:text-red-800">
                            Clear All
                        </button>
                    ` : ''}
                </div>
                <div class="overflow-x-auto max-h-64">
                    ${this.mergeSourceTags.length === 0 ? `
                        <div class="text-center py-8 text-gray-500">
                            <p>No tags added. Scan tags above to merge.</p>
                        </div>
                    ` : `
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-4 py-2 text-left font-medium">#</th>
                                    <th class="px-4 py-2 text-left font-medium">Tag/Barcode</th>
                                    <th class="px-4 py-2 text-left font-medium">Product</th>
                                    <th class="px-4 py-2 text-right font-medium">Weight (g)</th>
                                    <th class="px-4 py-2 text-center font-medium">Pcs</th>
                                    <th class="px-4 py-2 text-center font-medium">Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                ${this.mergeSourceTags.map((tag, idx) => `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-4 py-2">${idx + 1}</td>
                                        <td class="px-4 py-2 font-mono text-purple-600">${tag.tag_no}</td>
                                        <td class="px-4 py-2">${tag.product_name}</td>
                                        <td class="px-4 py-2 text-right font-bold">${tag.weight.toFixed(3)}</td>
                                        <td class="px-4 py-2 text-center">${tag.pcs}</td>
                                        <td class="px-4 py-2 text-center">
                                            <button onclick="TagOps.removeMergeTag('${tag.barcode}')"
                                                class="text-red-600 hover:bg-red-50 px-2 py-1 rounded transition">
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
            
            <!-- Total Display -->
            ${this.mergeSourceTags.length >= 2 ? `
                <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-300 mb-4">
                    <div class="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p class="text-sm text-gray-600">Total Merged Weight</p>
                            <p class="text-3xl font-bold text-green-600">${totalWeight.toFixed(3)}g</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">Total Pieces</p>
                            <p class="text-3xl font-bold text-green-600">${totalPcs}</p>
                        </div>
                    </div>
                </div>
                
                <!-- New Tag Prefix -->
                <div class="bg-white p-4 rounded-xl border-2 border-gray-200 mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">New Tag Prefix (Optional)</label>
                    <input type="text" id="mergeNewTagPrefix" 
                        class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        placeholder="Leave blank for auto-generate">
                </div>
            ` : ''}
            
            <!-- Action Button -->
            <button onclick="TagOps.completeMerge()" 
                ${this.mergeSourceTags.length < 2 ? 'disabled' : ''}
                class="w-full px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                🔗 Merge Tags & Print New Label
            </button>
        `;
        
        // Focus on scanner
        setTimeout(() => {
            const input = document.getElementById('mergeScannerInput');
            if (input) input.focus();
        }, 50);
    },

    clearMergeTags() {
        this.mergeSourceTags = [];
        this.renderMergeUI();
    },

    async completeMerge() {
        if (this.mergeSourceTags.length < 2) {
            this.showNotification('Need at least 2 tags to merge', 'warning');
            return;
        }
        
        const prefixInput = document.getElementById('mergeNewTagPrefix');
        const prefix = prefixInput?.value.trim() || '';
        
        try {
            const response = await fetch(`${this.API_BASE}/tags/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_tags: this.mergeSourceTags.map(t => t.tag_no),
                    new_tag_prefix: prefix,
                    notes: `Merged ${this.mergeSourceTags.length} tags`
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Merge operation failed');
            }
            
            const result = await response.json();
            
            this.showNotification(`✅ Merge complete! New tag: ${result.new_tag}`, 'success');
            
            // Clear state
            this.mergeSourceTags = [];
            this.renderMergeUI();
            
            // Offer to print label
            if (result.new_tag) {
                if (confirm('Would you like to print the new tag label?')) {
                    this.printTags([result.new_tag]);
                }
            }
            
        } catch (error) {
            console.error('Merge error:', error);
            this.showNotification(`Merge failed: ${error.message}`, 'error');
        }
    },

    // ==========================================
    // LABEL PRINTING
    // ==========================================

    async printTags(tags) {
        // This would integrate with the label printer
        // For now, show a confirmation
        this.showNotification(`🖨️ Printing ${tags.length} label(s)...`, 'info');
        
        // Call print API or trigger browser print
        try {
            if (typeof printLabelForTags === 'function') {
                printLabelForTags(tags);
            } else {
                console.log('Tags to print:', tags);
                if (typeof showToast === 'function') {
                    showToast(`${tags.length} tag(s) created. Use label printer to print.`, 'success');
                } else {
                    console.log('Tags created:', tags);
                }
            }
        } catch (error) {
            console.error('Print error:', error);
        }
    },

    // ==========================================
    // UTILITIES
    // ==========================================

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
    },

    // Initialize the module
    init() {
        // Setup Split Module
        const splitTab = document.getElementById('tagsplitTab');
        if (splitTab) {
            // Find or create split container
            let splitContainer = document.getElementById('splitModuleContainer');
            if (!splitContainer) {
                // Look for existing scanner input
                const existingScanner = splitTab.querySelector('#tagSplitBarcodeInput');
                if (existingScanner) {
                    // Wrap with our module
                    existingScanner.id = 'splitScannerInput';
                    existingScanner.setAttribute('onkeypress', "if(event.key==='Enter') TagOps.scanSourceTag(this.value)");
                }
                
                // Add container after scanner
                const scannerSection = splitTab.querySelector('.bg-gradient-to-r.from-blue-50');
                if (scannerSection) {
                    splitContainer = document.createElement('div');
                    splitContainer.id = 'splitModuleContainer';
                    splitContainer.className = 'mb-6';
                    scannerSection.parentNode.insertBefore(splitContainer, scannerSection.nextSibling);
                }
            }
            
            // Add merge container if not exists
            let mergeContainer = document.getElementById('mergeModuleContainer');
            if (!mergeContainer && splitContainer) {
                // Create a tabbed interface
                const tabsHTML = `
                    <div class="bg-white rounded-xl shadow-lg border mb-6 overflow-hidden">
                        <div class="flex border-b">
                            <button onclick="TagOps.showSplitTab()" id="splitTabBtn"
                                class="flex-1 px-6 py-3 text-center font-bold bg-green-600 text-white transition">
                                ✂️ Split Tag
                            </button>
                            <button onclick="TagOps.showMergeTab()" id="mergeTabBtn"
                                class="flex-1 px-6 py-3 text-center font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                                🔗 Merge Tags
                            </button>
                        </div>
                        <div class="p-6">
                            <div id="splitModuleContent">
                                ${splitContainer.innerHTML || `
                                    <div class="text-center py-12 text-gray-500">
                                        <div class="text-5xl mb-4">📷</div>
                                        <p class="text-lg">Scan a barcode to start splitting</p>
                                    </div>
                                `}
                            </div>
                            <div id="mergeModuleContent" class="hidden">
                                <!-- Merge UI will be rendered here -->
                            </div>
                        </div>
                    </div>
                `;
                
                if (splitContainer.parentNode) {
                    splitContainer.outerHTML = tabsHTML;
                }
            }
        }
        
        console.log('✂️ Tag Operations module initialized');
    },

    showSplitTab() {
        document.getElementById('splitModuleContent')?.classList.remove('hidden');
        document.getElementById('mergeModuleContent')?.classList.add('hidden');
        document.getElementById('splitTabBtn')?.classList.add('bg-green-600', 'text-white');
        document.getElementById('splitTabBtn')?.classList.remove('bg-gray-100', 'text-gray-700');
        document.getElementById('mergeTabBtn')?.classList.remove('bg-purple-600', 'text-white');
        document.getElementById('mergeTabBtn')?.classList.add('bg-gray-100', 'text-gray-700');
        
        // Update the container reference
        const content = document.getElementById('splitModuleContent');
        if (content) {
            content.id = 'splitModuleContainer';
        }
        this.renderSplitUI();
    },

    showMergeTab() {
        document.getElementById('splitModuleContent')?.classList.add('hidden');
        document.getElementById('mergeModuleContent')?.classList.remove('hidden');
        document.getElementById('mergeTabBtn')?.classList.add('bg-purple-600', 'text-white');
        document.getElementById('mergeTabBtn')?.classList.remove('bg-gray-100', 'text-gray-700');
        document.getElementById('splitTabBtn')?.classList.remove('bg-green-600', 'text-white');
        document.getElementById('splitTabBtn')?.classList.add('bg-gray-100', 'text-gray-700');
        
        // Update the container reference
        const content = document.getElementById('mergeModuleContent');
        if (content) {
            content.id = 'mergeModuleContainer';
        }
        this.renderMergeUI();
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    TagOps.init();
});

// Export for global access
window.TagOps = TagOps;
