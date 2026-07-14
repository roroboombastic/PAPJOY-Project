#!/bin/bash

# PAPJOY File Upload to Namecheap Shared Hosting
# This uploads your frontend files to shared hosting

# Configuration - Update these!
CPANEL_USERNAME="your-cpanel-username"
DOMAIN="papjoy.com"

echo "🚀 PAPJOY Frontend Upload to Namecheap Shared Hosting"
echo "Domain: $DOMAIN"
echo "cPanel User: $CPANEL_USERNAME"
echo ""

# Check if files exist
if [ ! -d "../frontend" ]; then
    echo "❌ Error: ../frontend directory not found"
    echo "Run this script from Backend/deploy/ directory"
    exit 1
fi

echo "📦 Preparing files for upload..."

# Create temporary directory for upload
TEMP_DIR="/tmp/papjoy-upload"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy frontend files
cp -r ../frontend/* "$TEMP_DIR/"

# Remove any .git or unwanted files
find "$TEMP_DIR" -name ".git*" -type f -delete
find "$TEMP_DIR" -name "*.log" -type f -delete

echo "📁 Files to upload:"
find "$TEMP_DIR" -type f | head -10
echo "..."

echo ""
echo "🔐 Upload Methods:"
echo ""
echo "Method 1 - cPanel File Manager (Recommended):"
echo "1. Go to: https://$DOMAIN/cpanel"
echo "2. Login with your credentials"
echo "3. Click 'File Manager'"
echo "4. Go to 'public_html' folder"
echo "5. Click 'Upload' and select files from ../frontend/"
echo ""
echo "Method 2 - FTP (if enabled):"
echo "Host: ftp.$DOMAIN"
echo "Username: $CPANEL_USERNAME"
echo "Password: your-cpanel-password"
echo "Upload to: public_html/"
echo ""
echo "Method 3 - SCP (if SSH enabled):"
echo "scp -r ../frontend/* $CPANEL_USERNAME@$DOMAIN:public_html/"
echo ""

echo "✅ After upload, visit: http://$DOMAIN"
echo ""
echo "📞 Need help? Contact Namecheap support or provide your cPanel details for assistance."

# Cleanup
rm -rf "$TEMP_DIR"