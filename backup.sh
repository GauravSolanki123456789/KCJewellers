#!/bin/bash
# ================================================
# Database Backup Script for Single-Tenant
# Location: /root/backup.sh
# Usage: bash /root/backup.sh
# ================================================

# Load environment variables
if [ -f "/root/jewelry-app/.env" ]; then
    source /root/jewelry-app/.env
elif [ -f "$HOME/jewelry-app/.env" ]; then
    source $HOME/jewelry-app/.env
else
    echo "⚠️  Warning: .env file not found. Using defaults."
fi

# Configuration
DB_NAME="${DB_NAME:-jewelry_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/jewelry_db_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "================================================"
echo "💾 Database Backup Script"
echo "================================================"
echo ""
echo "Database: $DB_NAME"
echo "Backup File: $BACKUP_FILE"
echo ""

# Set PostgreSQL password from environment
export PGPASSWORD="${DB_PASSWORD:-postgres}"

# Create backup
echo "📦 Creating backup..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    # Compress backup
    echo "🗜️  Compressing backup..."
    gzip -f "$BACKUP_FILE"
    BACKUP_FILE="${BACKUP_FILE}.gz"
    
    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    
    echo ""
    echo "================================================"
    echo "✅ Backup Complete!"
    echo "================================================"
    echo ""
    echo "📁 Backup Location: $BACKUP_FILE"
    echo "📊 File Size: $FILE_SIZE"
    echo ""
    echo "📋 To restore this backup:"
    echo "   gunzip < $BACKUP_FILE | psql -h $DB_HOST -U $DB_USER -d $DB_NAME"
    echo ""
    echo "📋 To download to local machine:"
    echo "   scp root@your-server-ip:$BACKUP_FILE ./"
    echo ""
    
    # Keep only last 7 backups (cleanup old ones)
    echo "🧹 Cleaning up old backups (keeping last 7)..."
    cd "$BACKUP_DIR"
    ls -t jewelry_db_backup_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
    echo "✅ Cleanup complete"
    
else
    echo ""
    echo "❌ Backup failed!"
    echo "💡 Check database connection and credentials"
    exit 1
fi
