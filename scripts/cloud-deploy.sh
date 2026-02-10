#!/bin/bash
# Cloud Deployment Script
# Run this on your cloud server after initial setup

echo "🚀 Starting Cloud Deployment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file with cloud database credentials"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Setup database
echo "🗄️ Setting up database..."
npm run setup-db

# Start with PM2
echo "▶️ Starting application with PM2..."
pm2 start server.js --name jewelry-app

# Save PM2 configuration
pm2 save

echo "✅ Deployment complete!"
echo "Check status with: pm2 status"
echo "View logs with: pm2 logs jewelry-app"

