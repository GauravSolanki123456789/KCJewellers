# DigitalOcean VPS Deployment Guide
## Gaurav Softwares - Jewelry Estimation (Single-Tenant)

This guide walks you through deploying the Jewelry Estimation application on a fresh DigitalOcean Ubuntu VPS.

---

## Prerequisites

- DigitalOcean account with a Droplet (Ubuntu 22.04 LTS recommended)
- Domain name pointed to your Droplet's IP
- SSH access to the server

---

## Step 1: Server Initial Setup

```bash
# SSH into your server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y curl git nginx certbot python3-certbot-nginx
```

---

## Step 2: Install Node.js (v18.x)

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# Verify installation
node --version
npm --version
```

---

## Step 3: Install PostgreSQL

```bash
# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE jewelry_db;
CREATE USER jewelry_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE jewelry_db TO jewelry_user;
ALTER DATABASE jewelry_db OWNER TO jewelry_user;
\q
```

---

## Step 4: Install PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Setup PM2 to start on boot
pm2 startup systemd
```

---

## Step 5: Clone and Setup Application

```bash
# Create application directory
mkdir -p /var/www/jewelry-app
cd /var/www/jewelry-app

# Clone your repository
git clone https://github.com/YOUR_USERNAME/jewelry-app.git .

# Install dependencies
npm install --production

# Create .env file
cp .env.production.example .env
nano .env
# Update all values in .env file
```

---

## Step 6: Initialize Database

```bash
# Run database setup
psql -U jewelry_user -d jewelry_db -f setup_single_tenant.sql

# Or let the app initialize on first run
npm start
```

---

## Step 7: Configure Nginx Reverse Proxy

```bash
# Create Nginx config
nano /etc/nginx/sites-available/jewelry-app
```

Add this configuration:

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

Enable the site:

```bash
# Enable site
ln -s /etc/nginx/sites-available/jewelry-app /etc/nginx/sites-enabled/

# Test nginx config
nginx -t

# Reload nginx
systemctl reload nginx
```

---

## Step 8: Setup SSL with Let's Encrypt

```bash
# Get SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is set up automatically
```

---

## Step 9: Start Application with PM2

```bash
cd /var/www/jewelry-app

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# View logs
pm2 logs gaurav-app
```

---

## Step 10: Set Master Admin Password

```bash
# Change the default master admin password
cd /var/www/jewelry-app
node scripts/change-master-password.js
```

---

## Useful Commands

```bash
# Application Management
pm2 status                    # Check app status
pm2 logs gaurav-app           # View logs
pm2 restart gaurav-app        # Restart app
pm2 stop gaurav-app           # Stop app
pm2 delete gaurav-app         # Remove from PM2

# Manual Update
cd /var/www/jewelry-app
bash update.sh

# Database Backup
pg_dump -U jewelry_user jewelry_db > backup_$(date +%Y%m%d).sql

# View Nginx logs
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

---

## Self-Update Feature

The application includes a self-update feature accessible from the Dashboard:

1. Click the **🔄 Update S/w** button in the header
2. Confirm the update
3. The system will:
   - Pull latest code from GitHub (`git pull origin master`)
   - Install dependencies (`npm install`)
   - Restart the server (`pm2 restart gaurav-app`)
4. Page will auto-reload after update

---

## Firewall Configuration (UFW)

```bash
# Enable firewall
ufw enable

# Allow SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 'Nginx Full'

# Check status
ufw status
```

---

## Troubleshooting

### App not starting
```bash
pm2 logs gaurav-app --lines 100
```

### Database connection issues
```bash
# Check PostgreSQL status
systemctl status postgresql

# Test connection
psql -U jewelry_user -d jewelry_db -c "SELECT 1;"
```

### Nginx 502 Bad Gateway
```bash
# Check if app is running
pm2 status

# Check nginx logs
tail -f /var/log/nginx/error.log
```

### Permission issues
```bash
# Fix ownership
chown -R www-data:www-data /var/www/jewelry-app
```

---

## Security Recommendations

1. **Change default passwords** immediately after setup
2. **Enable firewall** (UFW) and only allow necessary ports
3. **Keep system updated**: `apt update && apt upgrade -y`
4. **Use strong SESSION_SECRET** in .env file
5. **Regular backups**: Set up automated database backups
6. **Monitor logs**: Check PM2 and Nginx logs regularly

---

## Support

For issues or questions, contact: support@gauravsoftwares.com
