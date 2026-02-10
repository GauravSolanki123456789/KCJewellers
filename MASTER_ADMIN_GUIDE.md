# 📘 Master Admin Guide
## Gaurav Softwares - Jewelry Estimation Software

**Version:** 2.1.0 (Single-Tenant)  
**Last Updated:** January 2025  
**For:** Super Admin Operations

---

## Table of Contents

# 1. Go to folder
cd JewelryEstimation

# 2. Force the update manually
git fetch --all
git reset --hard origin/master

# 3. Make the script executable (just in case)
chmod +x update.sh

# 4. Restart
pm2 restart gaurav-app

to update app on server

1. [Daily Operations](#daily-operations)
2. [New Client Deployment (SOP)](#new-client-deployment-sop)
3. [Disaster Recovery](#disaster-recovery)
4. [Troubleshooting](#troubleshooting)

---

## Daily Operations

### 1. Manual Database Backup

**Location:** `/root/backup.sh`

**Command:**
```bash
bash /root/backup.sh
```

**What it does:**
- Creates a compressed SQL backup of the database
- Saves to `/root/backups/jewelry_db_backup_YYYYMMDD_HHMMSS.sql.gz`
- Automatically keeps only the last 7 backups
- Shows backup file location and size

**Output Example:**
```
✅ Backup Complete!
📁 Backup Location: /root/backups/jewelry_db_backup_20250120_143022.sql.gz
📊 File Size: 2.5M
```

---

### 2. Retrieve Backup to Local Laptop

**From your local machine (Windows/Mac/Linux):**

```bash
# Download latest backup
scp root@your-server-ip:/root/backups/jewelry_db_backup_*.sql.gz ./

# Or download specific backup
scp root@your-server-ip:/root/backups/jewelry_db_backup_20250120_143022.sql.gz ./
```

**Windows PowerShell:**
```powershell
scp root@your-server-ip:/root/backups/jewelry_db_backup_*.sql.gz ./
```

**Note:** Replace `your-server-ip` with your actual server IP address.

---

### 3. Add New Employee (GUI Method)

**Steps:**
1. Login to the application dashboard
2. Click **👥 Manage Users** button (top right)
3. In the "Add User to Whitelist" form:
   - Enter **Email** (required) - e.g., `employee@company.com`
   - Enter **Name** (optional) - e.g., `John Doe`
   - Select **Role**: `Employee` or `Admin`
4. Click **➕ Add User**
5. User will receive an email confirmation (if configured)
6. User can now login via Google OAuth with that email

**Important:**
- Only whitelisted emails can login
- No passwords needed - Google OAuth only
- Super Admin (`jaigaurav56789@gmail.com`) cannot be deleted

---

### 4. Check Server Status

```bash
# Check PM2 status
pm2 status

# View application logs
pm2 logs gaurav-app

# View last 100 lines
pm2 logs gaurav-app --lines 100

# Restart application
pm2 restart gaurav-app
```

---

### 5. Update Software (Via Dashboard)

**GUI Method:**
1. Login as Admin
2. Click **🔄 Update S/w** button
3. Confirm the update
4. System will:
   - Pull latest code from GitHub
   - Install dependencies
   - Restart server
   - Reload page

**Manual Method (SSH):**
```bash
cd /root/jewelry-app
bash update.sh
```

---

## New Client Deployment (SOP)

### Prerequisites Checklist

- [ ] DigitalOcean Droplet (Ubuntu 22.04 LTS)
- [ ] Domain name pointed to server IP
- [ ] GitHub repository access
- [ ] Google OAuth credentials (for login)
- [ ] PostgreSQL database ready

---

### Step 1: Clone Repository for New Client

**On the VPS (as root):**

```bash
# Navigate to root directory
cd /root

# Clone the repository
git clone https://github.com/your-org/jewelry-estimation.git jewelry-app

# Or if using SSH key:
git clone git@github.com:your-org/jewelry-estimation.git jewelry-app

# Navigate into directory
cd jewelry-app
```

**Note:** Replace `your-org/jewelry-estimation` with your actual repository path.

---

### Step 2: VPS Setup (Node.js, PostgreSQL, Nginx)

#### 2.1 Update System

```bash
apt update && apt upgrade -y
```

#### 2.2 Install Node.js (v18.x)

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

#### 2.3 Install PostgreSQL

```bash
# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
systemctl start postgresql
systemctl enable postgresql

# Set PostgreSQL password
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your-secure-password';"

# Create database
sudo -u postgres createdb jewelry_db
```

#### 2.4 Install Nginx

```bash
# Install Nginx
apt install -y nginx

# Start Nginx
systemctl start nginx
systemctl enable nginx
```

#### 2.5 Install PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Setup PM2 to start on boot
pm2 startup systemd
# Follow the instructions shown
```

#### 2.6 Install Certbot (for SSL)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx
```

---

### Step 3: Configure Environment Variables

**Create `.env` file:**

```bash
cd /root/jewelry-app
cp env.production.example .env
nano .env
```

**Required Variables:**

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:your-secure-password@localhost:5432/jewelry_db
# OR use individual variables:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jewelry_db
DB_USER=postgres
DB_PASSWORD=your-secure-password

# Server Configuration
NODE_ENV=production
PORT=3000
DOMAIN=your-domain.com

# Session Security
SESSION_SECRET=generate-a-random-secret-key-here-min-32-chars

# Google OAuth (Required for Login)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

# Optional: GitHub (for self-update)
GITHUB_REPO=your-org/jewelry-estimation
```

**Generate Session Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

---

### Step 4: Initialize Database

```bash
cd /root/jewelry-app

# Install dependencies
npm install --production

# Setup database schema
npm run setup-db

# Verify database
sudo -u postgres psql -d jewelry_db -c "\dt"
```

**Expected Output:**
```
✅ Single Tenant Database Ready!
✅ Dummy Data Inserted
```

---

### Step 5: Configure Nginx

**Create Nginx configuration:**

```bash
nano /etc/nginx/sites-available/jewelry-app
```

**Add this configuration:**

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable site:**

```bash
# Create symlink
ln -s /etc/nginx/sites-available/jewelry-app /etc/nginx/sites-enabled/

# Remove default site (optional)
rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

**Replace `your-domain.com` with your actual domain.**

---

### Step 6: Generate SSL Certificate

```bash
# Generate SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended)
```

**Auto-renewal (already configured):**
```bash
# Test renewal
certbot renew --dry-run
```

**Note:** Certbot automatically updates Nginx configuration.

---

### Step 7: Start Application with PM2

```bash
cd /root/jewelry-app

# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Check status
pm2 status

# View logs
pm2 logs gaurav-app
```

**Verify Application:**
- Visit: `https://your-domain.com`
- Should see login page
- Test Google OAuth login

---

### Step 8: Setup Backup Script

```bash
# Copy backup script to root
cp /root/jewelry-app/backup.sh /root/backup.sh

# Make executable
chmod +x /root/backup.sh

# Test backup
bash /root/backup.sh
```

**Setup Cron for Automatic Backups (Optional):**

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /root/backup.sh >> /var/log/jewelry-backup.log 2>&1
```

---

### Step 9: Initial Admin Setup

**Login with Super Admin:**
- Email: `jaigaurav56789@gmail.com`
- Method: Google OAuth (click "Sign in with Google")

**Add First Client Admin:**
1. Login as Super Admin
2. Click **👥 Manage Users**
3. Add client admin email
4. Set role to **Admin**
5. Client admin can now login and manage their employees

---

### Step 10: Post-Deployment Checklist

- [ ] Application accessible at `https://your-domain.com`
- [ ] SSL certificate working (green padlock)
- [ ] Google OAuth login working
- [ ] Database backup script tested
- [ ] PM2 auto-start configured
- [ ] Nginx reverse proxy working
- [ ] Firewall configured (if applicable)

**Firewall Setup (Optional):**
```bash
# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

---

## Disaster Recovery

### Scenario 1: Server Crash / Complete Rebuild

**Step 1: Re-deploy Application**

Follow [New Client Deployment (SOP)](#new-client-deployment-sop) steps 1-7.

**Step 2: Restore Database from Backup**

```bash
# On the server, locate your backup file
# If backup is on local machine, upload it first:
scp ./jewelry_db_backup_20250120_143022.sql.gz root@your-server-ip:/root/

# On server, restore database
cd /root
gunzip jewelry_db_backup_20250120_143022.sql.gz

# Restore to database
sudo -u postgres psql -d jewelry_db < jewelry_db_backup_20250120_143022.sql

# Verify restoration
sudo -u postgres psql -d jewelry_db -c "\dt"
sudo -u postgres psql -d jewelry_db -c "SELECT COUNT(*) FROM users;"
```

**Step 3: Restart Application**

```bash
cd /root/jewelry-app
pm2 restart gaurav-app
pm2 logs gaurav-app
```

**Step 4: Verify**

- Login to application
- Check data integrity
- Test critical functions

---

### Scenario 2: Database Corruption

**Step 1: Stop Application**

```bash
pm2 stop gaurav-app
```

**Step 2: Restore from Latest Backup**

```bash
# Find latest backup
ls -lt /root/backups/ | head -5

# Restore (replace with actual backup filename)
cd /root/backups
gunzip jewelry_db_backup_YYYYMMDD_HHMMSS.sql.gz
sudo -u postgres psql -d jewelry_db < jewelry_db_backup_YYYYMMDD_HHMMSS.sql
```

**Step 3: Restart Application**

```bash
pm2 start gaurav-app
pm2 logs gaurav-app
```

---

### Scenario 3: Application Code Corruption

**Step 1: Pull Fresh Code**

```bash
cd /root/jewelry-app
git fetch origin
git reset --hard origin/master
npm install --production
```

**Step 2: Restart**

```bash
pm2 restart gaurav-app
```

---

### Scenario 4: SSL Certificate Expired

**Renew Certificate:**

```bash
certbot renew
systemctl reload nginx
```

**Check Expiry:**

```bash
certbot certificates
```

---

## Troubleshooting

### Application Not Starting

**Check PM2 Status:**
```bash
pm2 status
pm2 logs gaurav-app --lines 50
```

**Check Database Connection:**
```bash
sudo -u postgres psql -d jewelry_db -c "SELECT 1;"
```

**Check Port Availability:**
```bash
netstat -tulpn | grep 3000
```

**Check Environment Variables:**
```bash
cd /root/jewelry-app
cat .env | grep -v PASSWORD
```

---

### Database Connection Errors

**Test Connection:**
```bash
sudo -u postgres psql -d jewelry_db
```

**Check PostgreSQL Status:**
```bash
systemctl status postgresql
```

**Restart PostgreSQL:**
```bash
systemctl restart postgresql
```

---

### Nginx 502 Bad Gateway

**Check Application:**
```bash
pm2 status
curl http://localhost:3000
```

**Check Nginx Error Log:**
```bash
tail -f /var/log/nginx/error.log
```

**Restart Nginx:**
```bash
systemctl restart nginx
```

---

### Google OAuth Not Working

**Verify Environment Variables:**
```bash
cd /root/jewelry-app
grep GOOGLE .env
```

**Check Callback URL:**
- Must match exactly: `https://your-domain.com/auth/google/callback`
- Check Google Cloud Console → OAuth Credentials

**Test OAuth:**
- Visit: `https://your-domain.com/auth/google`
- Should redirect to Google login

---

### Backup Script Failing

**Check Permissions:**
```bash
ls -la /root/backup.sh
chmod +x /root/backup.sh
```

**Test Database Connection:**
```bash
export PGPASSWORD=your-password
psql -h localhost -U postgres -d jewelry_db -c "SELECT 1;"
```

**Check Backup Directory:**
```bash
mkdir -p /root/backups
chmod 755 /root/backups
```

---

### User Cannot Login

**Check User Whitelist:**
```bash
sudo -u postgres psql -d jewelry_db -c "SELECT email, role, account_status FROM users;"
```

**Verify Email:**
- Email must be exact match (case-insensitive)
- Account status must be `active`

**Add User Manually (if needed):**
```sql
sudo -u postgres psql -d jewelry_db
INSERT INTO users (email, name, role, account_status, allowed_tabs) 
VALUES ('user@example.com', 'User Name', 'employee', 'active', ARRAY['all']);
```

---

## Quick Reference Commands

### Application Management

```bash
# Start
pm2 start ecosystem.config.js

# Stop
pm2 stop gaurav-app

# Restart
pm2 restart gaurav-app

# View logs
pm2 logs gaurav-app

# View status
pm2 status
```

### Database Management

```bash
# Backup
bash /root/backup.sh

# Restore
gunzip < backup.sql.gz | sudo -u postgres psql -d jewelry_db

# Connect to database
sudo -u postgres psql -d jewelry_db

# List tables
sudo -u postgres psql -d jewelry_db -c "\dt"

# Count records
sudo -u postgres psql -d jewelry_db -c "SELECT COUNT(*) FROM users;"
```

### System Management

```bash
# Check disk space
df -h

# Check memory
free -h

# Check system logs
journalctl -xe

# Check Nginx status
systemctl status nginx

# Check PostgreSQL status
systemctl status postgresql
```

---

## Support & Contact

**For Technical Issues:**
- Check logs: `pm2 logs gaurav-app`
- Check database: `sudo -u postgres psql -d jewelry_db`
- Review this guide's troubleshooting section

**Emergency Contacts:**
- Super Admin Email: `jaigaurav56789@gmail.com`
- Repository: `https://github.com/your-org/jewelry-estimation`

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Maintained By:** Gaurav Softwares
