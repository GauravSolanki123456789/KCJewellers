#!/bin/bash
# Setup Automated Cloud Backups
# Run this script to configure automatic daily backups

echo "🔧 Setting up automated cloud backups..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Create backup directory
mkdir -p backups

# Install AWS CLI (for S3/Spaces upload)
if ! command -v aws &> /dev/null; then
    echo "📦 Installing AWS CLI..."
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
    rm -rf aws awscliv2.zip
fi

# Setup cron job for daily backups at 2 AM
CRON_JOB="0 2 * * * cd $(pwd) && /usr/bin/node scripts/cloud-backup.js >> logs/backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "cloud-backup.js"; then
    echo "⚠️ Backup cron job already exists"
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Daily backup cron job added (runs at 2 AM)"
fi

# Create logs directory
mkdir -p logs

echo ""
echo "✅ Cloud backup setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Configure cloud storage in .env file:"
echo "   CLOUD_STORAGE=s3|spaces|dropbox|local"
echo ""
echo "2. For AWS S3, add to .env:"
echo "   AWS_ACCESS_KEY_ID=your_key"
echo "   AWS_SECRET_ACCESS_KEY=your_secret"
echo "   S3_BUCKET_NAME=your_bucket"
echo "   S3_REGION=us-east-1"
echo ""
echo "3. For DigitalOcean Spaces, add to .env:"
echo "   SPACES_ACCESS_KEY=your_key"
echo "   SPACES_SECRET_KEY=your_secret"
echo "   SPACES_BUCKET_NAME=your_bucket"
echo "   SPACES_REGION=nyc3"
echo ""
echo "4. Test backup manually:"
echo "   node scripts/cloud-backup.js"
echo ""
echo "5. View cron jobs:"
echo "   crontab -l"

