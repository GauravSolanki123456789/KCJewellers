/**
 * Dashboard Module - User Management with Granular Permissions
 * Enterprise Feature v2.0
 * 
 * Features:
 * - Add/Edit users with email authorization
 * - Granular module-based permissions
 * - Role-based access control
 * - User status management
 * - Global permission context for UI enforcement
 */

// ==========================================
// GLOBAL PERMISSION CONTEXT
// Stores the current user's permissions for UI enforcement
// ==========================================

const PermissionContext = {
    // Current user's permission data
    _data: null,
    _initialized: false,
    
    // Initialize from API response
    init(permissionData) {
        this._data = permissionData || null;
        this._initialized = true;
        
        // Also store in localStorage for persistence
        try {
            localStorage.setItem('permissionContext', JSON.stringify(permissionData));
        } catch (e) {
            console.warn('Could not store permissions in localStorage');
        }
        
        console.log('🔐 Permission Context initialized:', this._data);
        
        // Trigger UI update event
        window.dispatchEvent(new CustomEvent('permissionsLoaded', { detail: this._data }));
    },
    
    // Load from localStorage (for page refresh)
    loadFromStorage() {
        if (this._initialized && this._data) return this._data;
        
        try {
            const stored = localStorage.getItem('permissionContext');
            if (stored) {
                this._data = JSON.parse(stored);
                this._initialized = true;
            }
        } catch (e) {
            console.warn('Could not load permissions from localStorage');
        }
        return this._data;
    },
    
    // Clear on logout
    clear() {
        this._data = null;
        this._initialized = false;
        try {
            localStorage.removeItem('permissionContext');
        } catch (e) {}
    },
    
    // Check if user has permission for a specific module
    canAccess(module) {
        if (!this._data) this.loadFromStorage();
        if (!this._data) return false;
        
        // Admin always has access
        if (this._data.isAdmin || this._data.isSuperAdmin) return true;
        
        // Full access users
        if (this._data.hasFullAccess) return true;
        
        // Check specific module access
        if (this._data.canAccess && this._data.canAccess[module]) return true;
        
        // Check modules array
        if (this._data.modules) {
            if (this._data.modules.includes('*') || this._data.modules.includes('all')) return true;
            if (this._data.modules.includes(module)) return true;
        }
        
        // Check allowedTabs array (legacy)
        if (this._data.allowedTabs) {
            if (this._data.allowedTabs.includes('all') || this._data.allowedTabs.includes('*')) return true;
            if (this._data.allowedTabs.includes(module)) return true;
        }
        
        return false;
    },
    
    // Check if user is admin
    isAdmin() {
        if (!this._data) this.loadFromStorage();
        return this._data?.isAdmin || this._data?.isSuperAdmin || false;
    },
    
    // Check if user is super admin
    isSuperAdmin() {
        if (!this._data) this.loadFromStorage();
        return this._data?.isSuperAdmin || false;
    },
    
    // Get all accessible modules
    getAccessibleModules() {
        if (!this._data) this.loadFromStorage();
        if (!this._data) return [];
        
        if (this._data.hasFullAccess || this._data.isAdmin) {
            return ['all'];
        }
        
        return this._data.modules || this._data.allowedTabs || [];
    },
    
    // Get full permission data
    getData() {
        if (!this._data) this.loadFromStorage();
        return this._data;
    }
};

// Make globally accessible
window.PermissionContext = PermissionContext;

// ==========================================
// NAVIGATION VISIBILITY CONTROLLER
// Controls which nav items are visible based on permissions
// ==========================================

const NavigationController = {
    /**
     * Initialize navigation visibility based on user permissions
     * Called after login/authentication
     */
    init() {
        console.log('🧭 Initializing navigation visibility...');
        
        // Use PermissionContext methods for checking
        const isAdmin = PermissionContext.isAdmin();
        const isSuperAdmin = PermissionContext.isSuperAdmin();
        
        // Helper to check module access using PermissionContext method
        const can = (module) => PermissionContext.canAccess(module);
        
        // Desktop Navigation
        this.initDesktopNav(can, isAdmin, isSuperAdmin);
        
        // Mobile Navigation
        this.initMobileNav(can, isAdmin, isSuperAdmin);
        
        // Update user name displays
        this.updateUserDisplay();
        
        console.log('✅ Navigation visibility initialized. isAdmin:', isAdmin);
    },
    
    initDesktopNav(can, isAdmin, isSuperAdmin) {
        // Billing - visible if user has billing permission
        const canBilling = isAdmin || can('billing');
        this.showElement('navBilling', canBilling);
        
        // CRM Dropdown - visible if user has crm/customers permission
        const canCrm = isAdmin || can('crm') || can('customers') || can('quotations');
        this.showElement('navCrmDropdown', canCrm);
        
        // Inventory Dropdown - visible if user has any inventory permission
        const canInventory = isAdmin || 
            can('inventory') || can('products') || can('pv') || 
            can('tagsplit') || can('tagsearch') || can('floor') || 
            can('styles') || can('admin_ops');
        this.showElement('navInventoryDropdown', canInventory);
        
        // Reports Dropdown - visible if user has any reports permission
        const canReports = isAdmin || 
            can('reports') || can('salesbill') || can('salesreturn') || 
            can('billhistory') || can('ledger') || can('rol');
        this.showElement('navReportsDropdown', canReports);
        
        // Admin Dropdown - only visible for admins
        this.showElement('navAdminDropdown', isAdmin);
    },
    
    initMobileNav(can, isAdmin, isSuperAdmin) {
        // Billing Section
        const canBilling = isAdmin || can('billing');
        this.showElement('mobileBillingSection', canBilling);
        
        // CRM Section
        const canCrm = isAdmin || can('crm') || can('customers') || can('quotations');
        this.showElement('mobileCrmSection', canCrm);
        
        // Inventory Section
        const canInventory = isAdmin || 
            can('inventory') || can('products') || can('pv') || 
            can('tagsplit') || can('tagsearch') || can('floor') || 
            can('styles') || can('admin_ops');
        this.showElement('mobileInventorySection', canInventory);
        
        // Reports Section
        const canReports = isAdmin || 
            can('reports') || can('salesbill') || can('salesreturn') || 
            can('billhistory') || can('ledger') || can('rol');
        this.showElement('mobileReportsSection', canReports);
        
        // Admin Section
        this.showElement('mobileAdminSection', isAdmin);
    },
    
    updateUserDisplay() {
        const ctx = PermissionContext.getData();
        const userName = window.currentUser?.name || window.currentUser?.email || 'Guest';
        
        // Desktop user name
        const desktopUserEl = document.getElementById('currentUserName');
        if (desktopUserEl) {
            desktopUserEl.textContent = `User: ${userName}`;
        }
        
        // Mobile user name
        const mobileUserEl = document.getElementById('mobileUserName');
        if (mobileUserEl) {
            let roleText = '';
            if (ctx?.isSuperAdmin) roleText = ' (Super Admin)';
            else if (ctx?.isAdmin) roleText = ' (Admin)';
            mobileUserEl.textContent = `${userName}${roleText}`;
        }
    },
    
    showElement(elementId, show) {
        const el = document.getElementById(elementId);
        if (el) {
            if (show) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    }
};

// Make globally accessible
window.NavigationController = NavigationController;

// ==========================================
// SHADOW MODE (NUMBER 2) - GLOBAL STATE
// ==========================================

let currentAppMode = 'TAX'; // 'TAX' or 'ESTIMATE'

// Key sequence buffer for F11 -> n -> o -> 2 -> Enter
let shadowModeBuffer = '';
let isArmed = false; // F11 pressed
let bufferTimeout = null;

// Initialize Shadow Mode key listener
function initShadowMode() {
    document.addEventListener('keydown', (e) => {
        // F11 key is the "Arming" key
        if (e.key === 'F11') {
            e.preventDefault(); // Prevent browser fullscreen
            isArmed = true;
            shadowModeBuffer = '';
            console.log('🔓 Shadow Mode: Armed (F11 pressed)');
            
            // Clear buffer after 5 seconds of inactivity
            if (bufferTimeout) clearTimeout(bufferTimeout);
            bufferTimeout = setTimeout(() => {
                isArmed = false;
                shadowModeBuffer = '';
                console.log('🔒 Shadow Mode: Disarmed (timeout)');
            }, 5000);
            return;
        }
        
        // Only capture keys if armed
        if (!isArmed) return;
        
        // Capture Enter key to complete sequence
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // Check if buffer equals "no2"
            if (shadowModeBuffer.toLowerCase() === 'no2') {
                // Permission check: ONLY unlock if user has no2_access permission
                const currentUser = window.currentUser || {};
                const permissions = currentUser.permissions || {};
                const hasNo2Access = permissions.no2_access === true || 
                                     currentUser.isAdmin || 
                                     currentUser.role === 'admin' || 
                                     currentUser.role === 'super_admin';
                
                if (!hasNo2Access) {
                    console.warn('🚫 Shadow Mode: Access denied - no2_access permission required');
                    showShadowModeToast('Access Denied: No2 Access permission required', 'error');
                    isArmed = false;
                    shadowModeBuffer = '';
                    return;
                }
                
                // Toggle mode
                currentAppMode = currentAppMode === 'TAX' ? 'ESTIMATE' : 'TAX';
                
                // Refresh quotation list with current mode
                refreshQuotationListForMode();
                
                // Show toast notification
                const modeText = currentAppMode === 'ESTIMATE' ? 'ESTIMATE (Shadow Mode)' : 'TAX';
                showShadowModeToast(`Mode switched to: ${modeText}`, 'success');
                
                console.log(`✅ Shadow Mode: Switched to ${currentAppMode}`);
            } else {
                // Invalid sequence
                showShadowModeToast('Invalid sequence', 'error');
            }
            
            // Reset
            isArmed = false;
            shadowModeBuffer = '';
            if (bufferTimeout) clearTimeout(bufferTimeout);
            return;
        }
        
        // Capture alphanumeric characters for buffer
        if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
            shadowModeBuffer += e.key.toLowerCase();
            console.log(`🔓 Shadow Mode Buffer: "${shadowModeBuffer}"`);
            
            // Limit buffer size
            if (shadowModeBuffer.length > 10) {
                shadowModeBuffer = shadowModeBuffer.slice(-10);
            }
        }
    });
    
    console.log('✅ Shadow Mode key listener initialized');
}

// Refresh quotation list based on current mode
async function refreshQuotationListForMode() {
    try {
        const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
        const response = await fetch(`${API_BASE}/quotations?type=${currentAppMode}`);
        
        if (response.ok) {
            const quotationsData = await response.json();
            
            // Trigger custom event for quotation list refresh
            window.dispatchEvent(new CustomEvent('quotationsRefreshed', { 
                detail: { quotations: quotationsData, mode: currentAppMode } 
            }));
            
            // If there's a global loadQuotations function, call it
            if (typeof window.loadQuotations === 'function') {
                await window.loadQuotations();
            }
        }
    } catch (error) {
        console.error('Error refreshing quotations:', error);
    }
}

// Show toast notification for Shadow Mode
function showShadowModeToast(message, type = 'info') {
    // Try to use existing toast/dialog system
    if (typeof showDialog === 'function') {
        showDialog('Shadow Mode', message, type);
        return;
    }
    
    // Fallback: Create simple toast
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg ${
        type === 'success' ? 'bg-green-500 text-white' : 
        type === 'error' ? 'bg-red-500 text-white' : 
        'bg-blue-500 text-white'
    }`;
    toast.textContent = message;
    toast.style.animation = 'slideIn 0.3s ease-out';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Make globally accessible
window.currentAppMode = () => currentAppMode;
window.getCurrentAppMode = () => currentAppMode;
window.refreshQuotationListForMode = refreshQuotationListForMode;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShadowMode);
} else {
    initShadowMode();
}

// ==========================================
// DROPDOWN & MOBILE MENU FUNCTIONS
// ==========================================

// Toggle a specific dropdown menu
function toggleDropdown(menuId) {
    const menu = document.getElementById(menuId);
    const arrow = document.getElementById(menuId + 'Arrow');
    
    if (!menu) return;
    
    // Close all other dropdowns first
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m.id !== menuId) {
            m.classList.add('hidden');
        }
    });
    document.querySelectorAll('[id$="MenuArrow"]').forEach(a => {
        if (a.id !== menuId + 'Arrow') {
            a.classList.remove('rotate-180');
        }
    });
    
    // Toggle this dropdown
    menu.classList.toggle('hidden');
    if (arrow) {
        arrow.classList.toggle('rotate-180');
    }
}

// Close all dropdowns
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
    document.querySelectorAll('[id$="MenuArrow"]').forEach(arrow => {
        arrow.classList.remove('rotate-180');
    });
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    // Don't close if clicking inside a dropdown container
    if (!e.target.closest('[data-dropdown]')) {
        closeAllDropdowns();
    }
});

// ==========================================
// DROPDOWN INITIALIZATION (Robust Event Binding)
// ==========================================

function initDropdownListeners() {
    // Desktop dropdown triggers
    const dropdownMappings = {
        'crmMenu': 'navCrmDropdown',
        'inventoryMenu': 'navInventoryDropdown',
        'reportsMenu': 'navReportsDropdown',
        'adminMenu': 'navAdminDropdown'
    };
    
    // Attach click handlers to dropdown trigger buttons
    Object.entries(dropdownMappings).forEach(([menuId, containerId]) => {
        const container = document.getElementById(containerId);
        if (container) {
            const triggerBtn = container.querySelector('button');
            if (triggerBtn) {
                // Remove any existing onclick to prevent double-firing
                triggerBtn.removeAttribute('onclick');
                
                // Add robust click listener
                triggerBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent document click from immediately closing
                    toggleDropdown(menuId);
                });
            }
        }
    });
    
    console.log('✅ Dropdown listeners initialized');
}

// Initialize dropdowns when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDropdownListeners);
} else {
    // DOM already loaded, initialize immediately
    initDropdownListeners();
}

// Also re-initialize after navigation init (in case elements were hidden/shown)
window.addEventListener('permissionsLoaded', () => {
    setTimeout(initDropdownListeners, 100);
});

// Toggle mobile menu
function toggleMobileMenu() {
    const overlay = document.getElementById('mobileMenuOverlay');
    const drawer = document.getElementById('mobileMenuDrawer');
    
    if (overlay && drawer) {
        const isOpen = !drawer.classList.contains('-translate-x-full');
        
        if (isOpen) {
            // Close menu
            overlay.classList.add('hidden');
            drawer.classList.add('-translate-x-full');
            document.body.classList.remove('overflow-hidden');
        } else {
            // Open menu
            overlay.classList.remove('hidden');
            drawer.classList.remove('-translate-x-full');
            document.body.classList.add('overflow-hidden');
            
            // Update user name in drawer if available
            const drawerUserName = document.getElementById('mobileDrawerUserName');
            const currentUserName = document.getElementById('currentUserName')?.textContent || 
                                   document.getElementById('mobileUserName')?.textContent || 
                                   'Guest';
            if (drawerUserName) {
                drawerUserName.textContent = currentUserName.replace('User: ', '');
            }
        }
    }
}

// Close mobile menu
function closeMobileMenu() {
    const overlay = document.getElementById('mobileMenuOverlay');
    const drawer = document.getElementById('mobileMenuDrawer');
    
    if (overlay) overlay.classList.add('hidden');
    if (drawer) drawer.classList.add('-translate-x-full');
    document.body.classList.remove('overflow-hidden');
}

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const drawer = document.getElementById('mobileMenuDrawer');
    const menuBtn = document.getElementById('mobileMenuBtn');
    
    if (drawer && !drawer.contains(e.target) && !menuBtn?.contains(e.target)) {
        if (!drawer.classList.contains('-translate-x-full')) {
            closeMobileMenu();
        }
    }
});

// Focus barcode scanner (mobile quick access)
function focusBarcodeScanner() {
    // Try to find the barcode input in the current tab
    const scanners = [
        document.getElementById('barcodeInput'),
        document.getElementById('productBarcodeInput'),
        document.getElementById('tagSplitBarcodeInput'),
        document.getElementById('splitScannerInput')
    ];
    
    for (const scanner of scanners) {
        if (scanner && !scanner.closest('.hidden')) {
            scanner.focus();
            scanner.select();
            return;
        }
    }
    
    // Fallback: show billing tab and focus its scanner
    if (typeof showTab === 'function') {
        showTab('billing');
        setTimeout(() => {
            const mainScanner = document.getElementById('barcodeInput');
            if (mainScanner) {
                mainScanner.focus();
                mainScanner.select();
            }
        }, 100);
    }
}

// Make functions globally accessible
window.toggleDropdown = toggleDropdown;
window.closeAllDropdowns = closeAllDropdowns;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.focusBarcodeScanner = focusBarcodeScanner;
window.initDropdownListeners = initDropdownListeners;

// ==========================================
// USER MANAGEMENT MODULE
// ==========================================

const UserManagement = {
    // Available permission modules (fetched from API)
    modules: [],
    moduleGroups: {},
    
    // Current users list
    users: [],
    
    // Edit mode state
    editingUserId: null,
    
    // API Base
    get API_BASE() {
        return window.API_BASE_URL || 'http://localhost:3000/api';
    },

    // ==========================================
    // INITIALIZATION
    // ==========================================

    async init() {
        await this.fetchPermissionModules();
        this.setupModal();
        console.log('👥 User Management Module initialized');
    },

    async fetchPermissionModules() {
        try {
            const response = await fetch(`${this.API_BASE}/admin/permission-modules`);
            if (response.ok) {
                const data = await response.json();
                this.modules = data.modules || [];
                this.moduleGroups = data.moduleGroups || {};
            }
        } catch (error) {
            console.warn('Could not fetch permission modules, using defaults');
            this.modules = ['billing', 'products', 'customers', 'rol', 'quotations', 'salesbill', 
                           'salesreturn', 'billhistory', 'ledger', 'styles', 'pv', 'tagsplit', 
                           'tagsearch', 'floor', 'reports'];
            this.moduleGroups = {
                'Sales & Billing': ['billing', 'salesbill', 'salesreturn', 'quotations', 'billhistory'],
                'Inventory': ['products', 'pv', 'tagsplit', 'tagsearch', 'floor'],
                'CRM & Finance': ['customers', 'ledger'],
                'Management': ['rol', 'styles', 'reports']
            };
        }
    },

    // ==========================================
    // MODAL SETUP
    // ==========================================

    setupModal() {
        // Check if modal already exists
        if (document.getElementById('userPermissionsModal')) return;
        
        const modal = document.createElement('div');
        modal.id = 'userPermissionsModal';
        modal.className = 'fixed inset-0 flex items-center justify-center z-[60] hidden';
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-50" onclick="UserManagement.closeModal()"></div>
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 relative z-10 overflow-hidden max-h-[90vh] flex flex-col">
                <!-- Header -->
                <div class="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-6 py-4 flex-shrink-0">
                    <div class="flex justify-between items-center">
                        <h3 class="text-xl font-bold" id="userModalTitle">Add New User</h3>
                        <button onclick="UserManagement.closeModal()" class="text-white hover:bg-white/20 rounded p-1 transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Body - Scrollable -->
                <div class="p-6 overflow-y-auto flex-1">
                    <form id="userPermissionsForm" onsubmit="UserManagement.saveUser(event)">
                        <input type="hidden" id="editUserId" value="">
                        
                        <!-- Basic Info Section -->
                        <div class="mb-6">
                            <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                                <span class="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">1</span>
                                User Information
                            </h4>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                    <input type="email" id="userEmail" required
                                        class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="user@example.com">
                                    <p class="text-xs text-gray-500 mt-1">User will login via Google with this email</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                                    <input type="text" id="userName"
                                        class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                        placeholder="John Doe">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                                    <select id="userRole" required onchange="UserManagement.onRoleChange()"
                                        class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500">
                                        <option value="employee">Employee</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Account Status (Edit mode only) -->
                        <div id="statusSection" class="mb-6 hidden">
                            <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                                <span class="w-6 h-6 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs">2</span>
                                Account Status
                            </h4>
                            <select id="userStatus"
                                class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500">
                                <option value="active">✅ Active</option>
                                <option value="pending">⏳ Pending</option>
                                <option value="suspended">🚫 Suspended</option>
                                <option value="rejected">❌ Rejected</option>
                            </select>
                        </div>
                        
                        <!-- Permissions Section -->
                        <div class="mb-6" id="permissionsSection">
                            <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                                <span class="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs" id="permissionStepNumber">2</span>
                                Access Control
                            </h4>
                            
                            <!-- Full Access Toggle -->
                            <div class="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border-2 border-purple-200 mb-4">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" id="fullAccessToggle" onchange="UserManagement.toggleFullAccess()"
                                        class="w-5 h-5 text-purple-600 rounded focus:ring-purple-500">
                                    <div>
                                        <span class="font-bold text-gray-800">🔓 Full Access (All Modules)</span>
                                        <p class="text-xs text-gray-600">Grant access to all current and future modules</p>
                                    </div>
                                </label>
                            </div>
                            
                            <!-- Shadow Mode (Number 2) Access Toggle -->
                            <div class="bg-gradient-to-r from-gray-50 to-slate-50 p-4 rounded-lg border-2 border-gray-300 mb-4">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" id="no2AccessToggle"
                                        class="w-5 h-5 text-gray-600 rounded focus:ring-gray-500">
                                    <div>
                                        <span class="font-bold text-gray-800">🔐 Allow Internal Mode Access (Shadow Mode)</span>
                                        <p class="text-xs text-gray-600">Grant access to internal estimate mode (F11 → n → o → 2 → Enter)</p>
                                    </div>
                                </label>
                            </div>
                            
                            <!-- Module Checkboxes -->
                            <div id="moduleCheckboxes" class="space-y-4">
                                <!-- Will be populated dynamically -->
                            </div>
                        </div>
                    </form>
                </div>
                
                <!-- Footer -->
                <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t flex-shrink-0">
                    <button type="button" onclick="UserManagement.closeModal()"
                        class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition">
                        Cancel
                    </button>
                    <button type="submit" form="userPermissionsForm" id="saveUserBtn"
                        class="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-bold transition">
                        💾 Save User
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Populate module checkboxes
        this.renderModuleCheckboxes();
    },

    renderModuleCheckboxes() {
        const container = document.getElementById('moduleCheckboxes');
        if (!container) return;
        
        // Group modules with nice labels
        const moduleLabels = {
            'billing': '💳 Billing',
            'products': '📦 Products & Stock',
            'customers': '👥 Customers (CRM)',
            'rol': '📊 ROL Management',
            'quotations': '📝 Quotations',
            'salesbill': '💰 Sales Bill',
            'salesreturn': '↩️ Sales Return',
            'billhistory': '📋 Bill History',
            'ledger': '📒 Ledger',
            'styles': '🎨 Style Master',
            'pv': '📗 Stock-In (PV)',
            'tagsplit': '✂️ Tag Split/Merge',
            'tagsearch': '🔍 Tag Search',
            'floor': '🏢 Floor Management',
            'reports': '📈 Reports'
        };
        
        let html = '';
        
        for (const [groupName, modules] of Object.entries(this.moduleGroups)) {
            html += `
                <div class="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
                    <div class="bg-gray-100 px-4 py-2 flex items-center justify-between">
                        <span class="font-bold text-gray-700 text-sm">${groupName}</span>
                        <button type="button" onclick="UserManagement.toggleGroup('${groupName}')" 
                            class="text-xs text-amber-600 hover:text-amber-800 font-medium">
                            Toggle All
                        </button>
                    </div>
                    <div class="p-3 grid grid-cols-2 gap-2">
                        ${modules.map(mod => `
                            <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer transition" data-group="${groupName}">
                                <input type="checkbox" name="modules" value="${mod}"
                                    class="module-checkbox w-4 h-4 text-amber-600 rounded focus:ring-amber-500">
                                <span class="text-sm text-gray-700">${moduleLabels[mod] || mod}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    },

    // ==========================================
    // MODAL ACTIONS
    // ==========================================

    openAddModal() {
        this.editingUserId = null;
        this.resetForm();
        
        document.getElementById('userModalTitle').textContent = 'Add New User';
        document.getElementById('editUserId').value = '';
        document.getElementById('statusSection').classList.add('hidden');
        document.getElementById('permissionStepNumber').textContent = '2';
        document.getElementById('userEmail').removeAttribute('readonly');
        document.getElementById('userEmail').classList.remove('bg-gray-100');
        document.getElementById('saveUserBtn').textContent = '💾 Add User';
        
        document.getElementById('userPermissionsModal').classList.remove('hidden');
        document.getElementById('userEmail').focus();
    },

    openEditModal(user) {
        this.editingUserId = user.id;
        this.resetForm();
        
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('editUserId').value = user.id;
        document.getElementById('statusSection').classList.remove('hidden');
        document.getElementById('permissionStepNumber').textContent = '3';
        document.getElementById('saveUserBtn').textContent = '💾 Update User';
        
        // Fill form
        document.getElementById('userEmail').value = user.email || '';
        document.getElementById('userName').value = user.name || '';
        document.getElementById('userRole').value = user.role || 'employee';
        document.getElementById('userStatus').value = user.account_status || 'active';
        
        // Make email readonly for edit
        const emailInput = document.getElementById('userEmail');
        emailInput.setAttribute('readonly', 'true');
        emailInput.classList.add('bg-gray-100');
        
        // Set permissions
        const allowedTabs = user.allowed_tabs || [];
        const permissions = user.permissions || {};
        const isFullAccess = allowedTabs.includes('all');
        
        document.getElementById('fullAccessToggle').checked = isFullAccess;
        this.toggleFullAccess();
        
        // Set Shadow Mode (no2_access) checkbox
        const no2AccessToggle = document.getElementById('no2AccessToggle');
        if (no2AccessToggle) {
            no2AccessToggle.checked = permissions.no2_access === true || isFullAccess || user.role === 'admin';
        }
        
        if (!isFullAccess) {
            // Check individual modules
            document.querySelectorAll('.module-checkbox').forEach(cb => {
                cb.checked = allowedTabs.includes(cb.value);
            });
        }
        
        document.getElementById('userPermissionsModal').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('userPermissionsModal').classList.add('hidden');
        this.editingUserId = null;
        this.resetForm();
    },

    resetForm() {
        document.getElementById('userPermissionsForm').reset();
        document.getElementById('fullAccessToggle').checked = false;
        const no2AccessToggle = document.getElementById('no2AccessToggle');
        if (no2AccessToggle) {
            no2AccessToggle.checked = false;
        }
        document.querySelectorAll('.module-checkbox').forEach(cb => {
            cb.checked = false;
            cb.disabled = false;
        });
        document.getElementById('moduleCheckboxes').classList.remove('opacity-50', 'pointer-events-none');
    },

    // ==========================================
    // FORM HANDLERS
    // ==========================================

    onRoleChange() {
        const role = document.getElementById('userRole').value;
        const fullAccessToggle = document.getElementById('fullAccessToggle');
        
        if (role === 'admin') {
            fullAccessToggle.checked = true;
            this.toggleFullAccess();
        }
    },

    toggleFullAccess() {
        const isFullAccess = document.getElementById('fullAccessToggle').checked;
        const checkboxContainer = document.getElementById('moduleCheckboxes');
        
        if (isFullAccess) {
            checkboxContainer.classList.add('opacity-50', 'pointer-events-none');
            document.querySelectorAll('.module-checkbox').forEach(cb => {
                cb.checked = true;
                cb.disabled = true;
            });
        } else {
            checkboxContainer.classList.remove('opacity-50', 'pointer-events-none');
            document.querySelectorAll('.module-checkbox').forEach(cb => {
                cb.disabled = false;
            });
        }
    },

    toggleGroup(groupName) {
        const checkboxes = document.querySelectorAll(`label[data-group="${groupName}"] .module-checkbox`);
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = !allChecked;
            }
        });
    },

    async saveUser(event) {
        event.preventDefault();
        
        const userId = document.getElementById('editUserId').value;
        const email = document.getElementById('userEmail').value.trim();
        const name = document.getElementById('userName').value.trim();
        const role = document.getElementById('userRole').value;
        const status = document.getElementById('userStatus')?.value || 'active';
        const fullAccess = document.getElementById('fullAccessToggle').checked;
        const no2Access = document.getElementById('no2AccessToggle')?.checked || false;
        
        // Collect selected modules
        let allowedTabs = [];
        if (fullAccess) {
            allowedTabs = ['all'];
        } else {
            document.querySelectorAll('.module-checkbox:checked').forEach(cb => {
                allowedTabs.push(cb.value);
            });
        }
        
        // Build permissions object with no2_access
        // Save the exact checkbox value: if checked = true, if unchecked = false
        // Full access users automatically get it, otherwise use checkbox value
        const permissions = {
            no2_access: fullAccess ? true : no2Access
        };
        
        // Validate
        if (!email) {
            this.showNotification('Email is required', 'error');
            return;
        }
        
        if (allowedTabs.length === 0) {
            this.showNotification('Please select at least one module permission', 'error');
            return;
        }
        
        const saveBtn = document.getElementById('saveUserBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';
        
        try {
            let response;
            
            if (userId) {
                // Update existing user
                response = await fetch(`${this.API_BASE}/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        role,
                        account_status: status,
                        allowed_tabs: allowedTabs,
                        permissions: permissions
                    })
                });
            } else {
                // Add new user
                response = await fetch(`${this.API_BASE}/admin/add-user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email,
                        name,
                        role,
                        allowed_tabs: allowedTabs,
                        permissions: permissions
                    })
                });
            }
            
            const result = await response.json();
            
            if (response.ok && (result.success || result.user)) {
                this.showNotification(
                    userId ? `User ${email} updated successfully` : `User ${email} added successfully`,
                    'success'
                );
                this.closeModal();
                
                // Refresh user list
                if (typeof loadWhitelistedUsers === 'function') {
                    await loadWhitelistedUsers();
                }
            } else {
                // Handle 409 Conflict specifically
                if (response.status === 409) {
                    throw new Error('This email is already registered. Please search the list or restore the deleted user.');
                }
                throw new Error(result.error || 'Failed to save user');
            }
        } catch (error) {
            console.error('Save user error:', error);
            this.showNotification(error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    },

    // ==========================================
    // DELETE USER
    // ==========================================

    async deleteUser(userId, email) {
        if (!confirm(`⚠️ Remove ${email}?\n\nThey will no longer be able to login.`)) {
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE}/admin/users/${userId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showNotification(`User ${email} removed`, 'success');
                
                // Refresh user list
                if (typeof loadWhitelistedUsers === 'function') {
                    await loadWhitelistedUsers();
                }
            } else {
                throw new Error(result.error || 'Failed to delete user');
            }
        } catch (error) {
            console.error('Delete user error:', error);
            this.showNotification(error.message, 'error');
        }
    },

    // ==========================================
    // USER LIST RENDERING
    // ==========================================

    renderUserRow(user) {
        const isSuperAdmin = user.email === 'jaigaurav56789@gmail.com';
        const statusColors = {
            'active': 'bg-green-100 text-green-800',
            'pending': 'bg-yellow-100 text-yellow-800',
            'suspended': 'bg-red-100 text-red-800',
            'rejected': 'bg-gray-100 text-gray-800'
        };
        const statusIcons = {
            'active': '✅',
            'pending': '⏳',
            'suspended': '🚫',
            'rejected': '❌'
        };
        const roleColors = {
            'admin': 'bg-purple-100 text-purple-800',
            'employee': 'bg-blue-100 text-blue-800'
        };
        
        const allowedTabs = user.allowed_tabs || [];
        const permissionDisplay = allowedTabs.includes('all') 
            ? '<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">All Access</span>'
            : `<span class="text-xs text-gray-500">${allowedTabs.length} modules</span>`;
        
        return `
            <tr class="border-b hover:bg-gray-50 transition">
                <td class="p-3">
                    <div class="font-medium text-gray-900">${user.email}</div>
                    ${isSuperAdmin ? '<span class="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-bold">🔐 Super Admin</span>' : ''}
                </td>
                <td class="p-3 text-gray-600">${user.name || '-'}</td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${roleColors[user.role] || 'bg-gray-100'}">
                        ${user.role === 'admin' ? '👑 Admin' : '👤 Employee'}
                    </span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColors[user.account_status] || 'bg-gray-100'}">
                        ${statusIcons[user.account_status] || ''} ${user.account_status || 'unknown'}
                    </span>
                </td>
                <td class="p-3">${permissionDisplay}</td>
                <td class="p-3 text-center">
                    ${isSuperAdmin ? `
                        <span class="text-xs text-gray-400">Protected</span>
                    ` : `
                        <button onclick="UserManagement.openEditModal(${JSON.stringify(user).replace(/"/g, '&quot;')})"
                            class="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-sm font-medium transition">
                            ✏️ Edit
                        </button>
                        <button onclick="UserManagement.deleteUser(${user.id}, '${user.email}')"
                            class="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm font-medium transition">
                            🗑️
                        </button>
                    `}
                </td>
            </tr>
        `;
    },

    // ==========================================
    // UTILITIES
    // ==========================================

    showNotification(message, type = 'info') {
        // Use existing showDialog if available
        if (typeof showDialog === 'function') {
            showDialog(type === 'error' ? 'Error' : 'Success', message, type);
            return;
        }
        
        const colors = {
            success: 'from-green-500 to-emerald-600',
            error: 'from-red-500 to-red-600',
            warning: 'from-yellow-500 to-orange-500',
            info: 'from-blue-500 to-indigo-600'
        };
        
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-[70] px-6 py-3 bg-gradient-to-r ${colors[type]} text-white rounded-lg shadow-lg`;
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
// ENHANCED USER MANAGEMENT MODAL (Update existing)
// ==========================================

// Override the add user form in existing modal
function enhanceUserManagementModal() {
    const addUserSection = document.querySelector('#userManagementModal .bg-green-50');
    if (!addUserSection) return;
    
    // Replace simple form with button to open new modal
    const newContent = `
        <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-200">
            <div class="flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-gray-800">➕ Add New User</h4>
                    <p class="text-sm text-gray-600">Add users with granular module permissions</p>
                </div>
                <button onclick="UserManagement.openAddModal()" 
                    class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold transition">
                    ➕ Add User
                </button>
            </div>
        </div>
    `;
    
    addUserSection.outerHTML = newContent;
}

// Update the user list table header to include permissions column
function enhanceUserListTable() {
    const tableHeader = document.querySelector('#userManagementModal thead tr');
    if (!tableHeader) return;
    
    // Check if permissions column already exists
    if (tableHeader.innerHTML.includes('Permissions')) return;
    
    // Add permissions column before Actions
    const actionsHeader = tableHeader.querySelector('th:last-child');
    if (actionsHeader) {
        const permHeader = document.createElement('th');
        permHeader.className = 'p-3 font-bold text-sm';
        permHeader.textContent = 'Permissions';
        tableHeader.insertBefore(permHeader, actionsHeader);
    }
}

// Override loadWhitelistedUsers to use enhanced rendering
const originalLoadWhitelistedUsers = window.loadWhitelistedUsers;

window.loadWhitelistedUsers = async function() {
    const userListDiv = document.getElementById('userManagementList');
    const userCountEl = document.getElementById('userCount');
    const activeCountEl = document.getElementById('activeUserCount');
    const adminCountEl = document.getElementById('adminUserCount');
    const pendingCountEl = document.getElementById('pendingUserCount');
    
    if (!userListDiv) return;
    
    userListDiv.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Loading users...</td></tr>';
    
    try {
        const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
        const response = await fetch(`${API_BASE}/admin/users`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const users = await response.json();
        UserManagement.users = users;
        
        // Calculate stats
        const totalCount = users.length || 0;
        const activeCount = users.filter(u => u.account_status === 'active').length;
        const adminCount = users.filter(u => u.role === 'admin').length;
        const pendingCount = users.filter(u => u.account_status === 'pending').length;
        
        // Update all counters
        if (userCountEl) userCountEl.textContent = totalCount;
        if (activeCountEl) activeCountEl.textContent = activeCount;
        if (adminCountEl) adminCountEl.textContent = adminCount;
        if (pendingCountEl) pendingCountEl.textContent = pendingCount;
        
        if (!users || users.length === 0) {
            userListDiv.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">No users found. Add a user above.</td></tr>';
            return;
        }
        
        // Use enhanced rendering
        userListDiv.innerHTML = users.map(user => UserManagement.renderUserRow(user)).join('');
        
    } catch (error) {
        console.error('Error loading users:', error);
        userListDiv.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Failed to load users: ${error.message}</td></tr>`;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    UserManagement.init();
    
    // Enhance existing modal after a short delay (to ensure it's loaded)
    setTimeout(() => {
        enhanceUserManagementModal();
        enhanceUserListTable();
    }, 500);
});

// Export for global access
window.UserManagement = UserManagement;
