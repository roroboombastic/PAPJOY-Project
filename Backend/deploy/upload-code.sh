#!/bin/bash

# PAPJOY Code Upload Script
# Run this from your LOCAL machine (not on the server)

SERVER_IP=$1
SSH_KEY_PATH=${2:-~/.ssh/id_rsa}

if [ -z "$SERVER_IP" ]; then
    echo "Usage: $0 <server-ip> [ssh-key-path]"
    echo "Example: $0 123.456.789.0"
    exit 1
fi

echo "🚀 Uploading PAPJOY code to $SERVER_IP..."

# Upload backend
echo "📦 Uploading backend..."
scp -i "$SSH_KEY_PATH" -r "./Backend/*" "root@$SERVER_IP:/var/www/papjoy/backend/"

# Upload frontend
echo "📦 Uploading frontend..."
scp -i "$SSH_KEY_PATH" -r "./frontend/*" "root@$SERVER_IP:/var/www/papjoy/"

# Set permissions
echo "🔧 Setting permissions..."
ssh -i "$SSH_KEY_PATH" "root@$SERVER_IP" "sudo chown -R www-data:www-data /var/www/papjoy"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
ssh -i "$SSH_KEY_PATH" "root@$SERVER_IP" "cd /var/www/papjoy/backend && npm install"

echo "✅ Upload complete!"
echo ""
echo "📋 Next steps on server:"
echo "1. Configure /etc/papjoy/papjoy.env"
echo "2. Run: sudo systemctl restart papjoy"
echo "3. Test: curl https://papjoy.com/api/v1/products"
