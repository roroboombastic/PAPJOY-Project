#!/bin/bash

# PAPJOY Domain Connection Test Script
# Run this to verify your domain is properly connected to hosting

DOMAIN=${1:-papjoy.com}
SERVER_IP=${2}

echo "🔍 Testing PAPJOY domain connection..."
echo "Domain: $DOMAIN"
echo "Expected IP: $SERVER_IP"
echo ""

# Test DNS resolution
echo "📡 Testing DNS resolution..."
echo "papjoy.com:"
nslookup papjoy.com 2>/dev/null | grep -A 2 "Name:" || echo "❌ DNS lookup failed"

echo ""
echo "www.papjoy.com:"
nslookup www.papjoy.com 2>/dev/null | grep -A 2 "Name:" || echo "❌ DNS lookup failed"

echo ""
echo "🌐 Testing website access..."

# Test HTTP (should redirect to HTTPS)
echo "Testing HTTP redirect:"
curl -s -I http://papjoy.com | head -3

echo ""
echo "Testing HTTPS access:"
curl -s -I https://papjoy.com | head -3

echo ""
echo "Testing www redirect:"
curl -s -I https://www.papjoy.com | head -3

echo ""
echo "🔌 Testing API endpoint:"
curl -s https://papjoy.com/api/v1/products | head -2 || echo "❌ API not accessible"

echo ""
echo "✅ Domain connection test complete!"
echo ""
echo "📋 If you see errors:"
echo "- Wait 5-30 minutes for DNS propagation"
echo "- Check DNS records in your domain registrar"
echo "- Verify server IP matches DNS records"
echo "- Check server firewall and services are running"