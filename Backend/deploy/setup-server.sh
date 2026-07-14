#!/bin/bash

# PAPJOY Server Setup Script
# Run this on your fresh Ubuntu VPS

set -e

echo "🚀 Starting PAPJOY server setup..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential tools
echo "🔧 Installing essential tools..."
sudo apt install -y curl wget git htop ufw software-properties-common

# Install Node.js 18+
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install nginx
echo "🌐 Installing nginx..."
sudo apt install -y nginx

# Install certbot
echo "🔒 Installing certbot for SSL..."
sudo apt install -y certbot python3-certbot-nginx

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
echo "y" | sudo ufw --force enable

# Create app directories
echo "📁 Creating application directories..."
sudo mkdir -p /var/www/papjoy/backend
sudo mkdir -p /var/www/papjoy/frontend
sudo mkdir -p /etc/papjoy

# Set permissions
sudo chown -R www-data:www-data /var/www/papjoy

echo "✅ Server setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Upload your code to /var/www/papjoy/"
echo "2. Configure /etc/papjoy/papjoy.env"
echo "3. Run the deployment commands from HOSTING-GUIDE.md"
echo ""
echo "🔗 Your server IP: $(curl -s ifconfig.me)"
echo "🌐 Point your domain DNS to this IP"