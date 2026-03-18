# ??KC Jewellers app

Complete jewelry estimation and billing software for single-tenant VPS deployment.
taskkill /F /IM node.exe 
command to kill ghost
---

command to kill one drive error 
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

rm -rf /var/www/kcjewellers/public/uploads/web_products/*
command to access database 
sudo -u postgres psql -d kcjewellers
DELETE FROM web_products WHERE barcode = '100001';
ssh root@159.65.145.59
command to access terminal
---
1. Force Git to overwrite everything with your perfect GitHub code:

Bash
cd /var/www/kcjewellers
git fetch --all
git reset --hard origin/master
2. Clean up and build natively for Linux:

Bash
cd client
rm -rf .next
npm install
npm run build
## ?? Quick Start
pm2 restart kc-backend kc-frontend
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
- **Mobile OTP (SMS):** `MSG91_AUTH_KEY` or `SMS_PROVIDER_API_KEY` - For OTP delivery. Without this, OTPs are logged to console (dev only).

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
Part 2: Your Admin Masterclass
Now that the engine is running, here is what these features actually do and why they are essential for your business.

1. Manage SIP Plans (The Control Center)
This is where you invent your financial products.

Installment Amount: The exact ₹ value the customer must pay every month.

Duration: How many months they are locked in.

Jeweler Benefit %: This is your "bonus" to the customer for staying loyal. 100 means you give them 100% of one installment amount for free at the very end. 50 means you give them half an installment.

2. Payout Requests (The Ledger)
You only use this if a customer cancels their SIP early, or if your specific plan gives them cash back (which is rare).

If a user hits "Cancel & Withdraw", their money shows up here. You manually UPI/NEFT the money to their bank account, type the UPI Reference Number into the admin_remarks, and click "Mark Paid." It keeps your legal ledger clean.

3. Gold Lot Movements (Your Liability Tracker)
This is incredibly important. When 100 customers pay their ₹2,000 installment today, the database calculates how many grams of gold they just bought at today's Live Rate.

Why you need it: If gold prices skyrocket, you owe those customers that physical weight. This page tells you exactly how many total grams of gold you currently "owe" to your SIP customers so you can hedge your real-world inventory.

Part 3: The 1g 22K Gold Coin Strategy
Using a 1g 22K Gold coin is the perfect entry-level SIP. It is highly attractive to middle-class investors. Here is how you structure it and why it's a win-win.

Let's assume a 1g 22K coin costs roughly ₹7,500 today.

How to set it up in the Modal:

Name: "1g 22K Gold Saver"

Metal Type: Gold

Duration: 10 months

Installment Amount: ₹750

Jeweler Benefit %: 0 or 50 (Coins have very low margins, so you don't want to give away too much free money. A 0% benefit is fine because the customer's main benefit is protecting against price inflation).

The Advantage for the Customer (Cost Averaging):
They don't have ₹7,500 today. They pay you ₹750 a month. Because of your Live Rate engine, if gold crashes next month, their ₹750 buys more milligrams of gold. If gold spikes, they are glad they locked in earlier. It builds wealth safely.

The Advantage for YOU (Working Capital):
You get ₹750 in hard cash today. You can immediately use that capital to buy raw gold for your shop at wholesale prices. By the time month 10 rolls around, you have had 10 months of free working capital, and you just hand them a 1g coin from your inventory.

**Version:** 2.5.0 (Gold Master)  
**Last Updated:** January 2025
