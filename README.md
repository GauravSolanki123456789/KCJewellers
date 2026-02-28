# ??KC Jewellers app

Complete jewelry estimation and billing software for single-tenant VPS deployment.
taskkill /F /IM node.exe 
command to kill ghost
---
command to access database 
sudo -u postgres psql -d kcjewellers


## ?? Quick Start

### Production Deployment (DigitalOcean VPS)

1. **Read**: [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Complete deployment guide
2. **Setup**: Follow the step-by-step instructions
3. **Access**: Your application will be available at your domain

### Development

```bash
# Install dependencies
npm install

# Setup environment
cp env.production.example .env
# Edit .env with your settings

# Initialize database
psql -U postgres -d jewelry_db -f setup_single_tenant.sql

# Start development server
npm run dev
```

---

## ? Features

### Core Features
- ?? **Product Management** - Barcode scanning, bulk upload, inventory tracking
- ?? **Customer Management** - Complete CRM with address and GST details
- ?? **Quotation Generation** - Professional PDF quotations with GST
- ?? **Sales Billing** - GST-compliant bills (CGST/SGST or IGST)
- ?? **Ledger System** - Complete financial tracking and transactions
- ?? **Sales Returns** - Handle returns and MC changes

### Enterprise Features (v2.5)
- ?? **Style Master** - Centralized style code management with defaults
- ?? **ROL Management** - Reorder level tracking (wholesale/retail)
- ?? **Purchase Vouchers (PV)** - Smart Stock-In grid with validation
- ?? **Tag Split/Merge** - Split and merge inventory tags
- ?? **Floor Management** - Multi-floor inventory tracking
- ?? **Advanced Reports** - ROL Analysis, GST Reports, Stock Summary

### Mobile Features
- ?? **Mobile Camera Scanner** - Scan barcodes using phone camera (html5-qrcode)
- ?? **Responsive Design** - Optimized UI for mobile devices
- ?? **Mobile Settings Menu** - Easy access to admin functions on mobile

### System Features
- ?? **User Management** - Role-based access control (Admin/Employee)
- ?? **Self-Update** - Pull latest updates from GitHub via dashboard
- ?? **Tally Integration** - Sync transactions to Tally ERP
- ??? **Label Printing** - TSPL label printer support
- ? **Real-Time Sync** - Multi-device synchronization with Socket.IO

---

## ??? Architecture

- **Database**: PostgreSQL (single database per instance)
- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JavaScript (SPA)
- **Process Manager**: PM2
- **Web Server**: Nginx (reverse proxy)
- **SSL**: Let's Encrypt

---

## ?? Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete VPS deployment guide
- **[MASTER_ADMIN_GUIDE.md](./MASTER_ADMIN_GUIDE.md)** - Super Admin operations manual

---

## ?? Security

- Password hashing (bcrypt)
- Session-based authentication
- Role-based access control
- SQL injection protection (parameterized queries)
- HTTPS support (Let's Encrypt)
- Google OAuth integration

---

## ?? Self-Update Feature

The application includes a built-in self-update mechanism:

1. Click **?? Update S/w** button in the dashboard (or Settings menu on mobile)
2. System pulls latest code from GitHub
3. Installs dependencies
4. Restarts server automatically
5. Page reloads with new version

**Update Output:** The update process now displays real-time output in a modal for debugging.

**Requirements:**
- Git repository configured
- PM2 process manager running
- GitHub repository set in `.env` (`GITHUB_REPO`)

---

## ?? Admin Features

**Default Super Admin:**
- Email: `jaigaurav56789@gmail.com`
- Username: `Gaurav`

**Change Password:**
```bash
node scripts/change-master-password.js
```

---

## ?? Technology Stack

- **Runtime**: Node.js 18.x
- **Database**: PostgreSQL 14+
- **Web Framework**: Express.js
- **Authentication**: Passport.js (Google OAuth)
- **Real-Time**: Socket.IO
- **Process Manager**: PM2
- **PDF Generation**: jsPDF
- **Barcode Scanning**: html5-qrcode

---

## ?? Environment Variables

See [`env.production.example`](./env.production.example) for all required environment variables.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `PORT` - Server port (default: 3000)

**Optional:**
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - For Google OAuth login
- `GITHUB_REPO` - For self-update feature
- `DOMAIN` - Your domain name

---

## ?? Mobile Usage

### Camera Barcode Scanner
1. Tap the ?? **Camera** button next to the barcode input
2. Allow camera permission when prompted
3. Point camera at barcode - it will auto-scan
4. Product is automatically added to the quotation

### Mobile Settings
- Tap the ?? **Settings** icon in the header
- Access: User Management, Tally Config, Software Update
- Logout option available

---

## ?? What's New in v2.5.0

- ? Robust update script with logging (`update.log`)
- ? Mobile-responsive UI with hamburger menu
- ? Camera barcode scanner for mobile devices
- ? Update output modal for debugging
- ? Admin super-check for tab permissions
- ? Sticky footer for billing totals on mobile
- ? Horizontal scroll navigation on mobile

---

## ?? Support

For deployment issues, refer to [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## ?? License

Proprietary - Gaurav Softwares

---

**Version:** 2.5.0 (Gold Master)  
**Last Updated:** January 2025
