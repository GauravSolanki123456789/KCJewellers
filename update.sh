#!/bin/bash
# ================================================
# Self-Update Script for Gaurav Softwares Jewelry Estimation
# This script pulls the latest code from GitHub and restarts the server
# Now with robust logging, force git reset, and proper error handling
# ================================================

# Configuration
LOG_FILE="update.log"
APP_DIR="/root/JewelryEstimation"
PM2_APP_NAME="gaurav-app"
GIT_BRANCH="master"

# Function to log with timestamp
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE"
}

log_error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERROR: $1"
    echo "$msg" >&2
    echo "$msg" >> "$LOG_FILE"
}

log_success() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE"
}

# Start logging
echo "" >> "$LOG_FILE"
log "================================================"
log "🔄 Starting Software Update..."
log "================================================"

# Store current directory and move to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || {
    log_error "Failed to change to script directory: $SCRIPT_DIR"
    exit 1
}

log "📍 Working Directory: $SCRIPT_DIR"
log "📅 Update Time: $(date)"

# Step 1: Force Git - Fetch all and reset hard to origin/master
log ""
log "⬇️ Step 1: Force Git Pull (fetch --all + reset --hard origin/$GIT_BRANCH)"

git fetch --all >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log_error "Git fetch failed!"
    # Continue anyway, might be a network issue
fi

git reset --hard origin/$GIT_BRANCH >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log_error "Git reset failed!"
    exit 1
fi
log_success "Code synced with GitHub ($GIT_BRANCH branch)"

# Step 2: Fix Permissions
log ""
log "🔐 Step 2: Fixing file ownership and permissions..."

# Fix ownership for the app directory (use script dir if APP_DIR doesn't exist)
if [ -d "$APP_DIR" ]; then
    chown -R root:root "$APP_DIR" >> "$LOG_FILE" 2>&1
    log_success "Ownership fixed for $APP_DIR"
else
    chown -R root:root "$SCRIPT_DIR" >> "$LOG_FILE" 2>&1
    log_success "Ownership fixed for $SCRIPT_DIR"
fi

# Ensure update script is executable
chmod +x "$SCRIPT_DIR/update.sh" >> "$LOG_FILE" 2>&1

# Step 3: Install/Update dependencies
log ""
log "📦 Step 3: Installing dependencies (npm install --production)..."

npm install --production >> "$LOG_FILE" 2>&1
NPM_EXIT_CODE=$?

if [ $NPM_EXIT_CODE -ne 0 ]; then
    log_error "npm install failed with exit code $NPM_EXIT_CODE"
    # Don't exit - try to restart anyway
else
    log_success "Dependencies installed successfully"
fi

# Step 4: Run database migrations if any
if [ -f "scripts/migrate.js" ]; then
    log ""
    log "🔄 Step 4: Running database migrations..."
    node scripts/migrate.js >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
        log_success "Migrations complete"
    else
        log_error "Migrations failed (non-critical, continuing...)"
    fi
fi

# Step 5: Restart the server using PM2
log ""
log "♻️ Step 5: Restarting server with PM2..."

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    # Try to restart, if fails then start fresh
    pm2 restart "$PM2_APP_NAME" >> "$LOG_FILE" 2>&1
    PM2_RESTART_CODE=$?
    
    if [ $PM2_RESTART_CODE -ne 0 ]; then
        log "⚠️ PM2 restart failed, attempting fresh start..."
        
        # Try starting with ecosystem config if exists
        if [ -f "ecosystem.config.js" ]; then
            pm2 start ecosystem.config.js >> "$LOG_FILE" 2>&1
        else
            pm2 start server.js --name "$PM2_APP_NAME" >> "$LOG_FILE" 2>&1
        fi
    fi
    
    # Save PM2 process list
    pm2 save >> "$LOG_FILE" 2>&1
    
    # Get PM2 status for the log
    log ""
    log "📊 PM2 Status:"
    pm2 status >> "$LOG_FILE" 2>&1
    pm2 status
    
    log_success "Server restarted successfully with PM2"
else
    log_error "PM2 not found! Installing PM2 globally..."
    npm install -g pm2 >> "$LOG_FILE" 2>&1
    
    if command -v pm2 &> /dev/null; then
        pm2 start server.js --name "$PM2_APP_NAME" >> "$LOG_FILE" 2>&1
        pm2 save >> "$LOG_FILE" 2>&1
        log_success "PM2 installed and server started"
    else
        log_error "PM2 installation failed. Starting with node directly..."
        
        # Kill existing node process and restart
        pkill -f "node server.js" >> "$LOG_FILE" 2>&1
        nohup node server.js >> /var/log/jewelry-app.log 2>&1 &
        
        log "✅ Server started in background (PID: $!)"
    fi
fi

# Final Status
log ""
log "================================================"
log "✅ UPDATE COMPLETE!"
log "================================================"
log ""
log "🌐 Server should be accessible at:"
log "   - Local: http://localhost:3000"
log "   - Public: Check your domain configuration"
log ""
log "📋 To check status: pm2 status"
log "📋 To view logs: pm2 logs $PM2_APP_NAME"
log "📋 Update log saved to: $LOG_FILE"
log ""

# Return success
exit 0
