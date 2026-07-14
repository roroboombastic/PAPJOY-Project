#!/bin/bash

# PAPJOY DNS Setup Checker
# This script helps diagnose DNS configuration issues

DOMAIN=${1:-papjoy.com}

echo "🔍 PAPJOY DNS Configuration Checker"
echo "Domain: $DOMAIN"
echo "=================================="

# Check current DNS records
echo ""
echo "📡 Current DNS Records:"
echo "A records for $DOMAIN:"
dig A $DOMAIN +short

echo ""
echo "A records for www.$DOMAIN:"
dig A www.$DOMAIN +short

# Check nameservers
echo ""
echo "🖥️  Nameservers:"
dig NS $DOMAIN +short

# Check if domain resolves
echo ""
echo "🌐 Domain Resolution Test:"
if nslookup $DOMAIN >/dev/null 2>&1; then
    echo "✅ Domain resolves successfully"
else
    echo "❌ Domain does not resolve"
fi

# Check website accessibility
echo ""
echo "🔗 Website Accessibility:"
if curl -s --max-time 10 https://$DOMAIN >/dev/null; then
    echo "✅ HTTPS accessible"
else
    echo "❌ HTTPS not accessible"
fi

if curl -s --max-time 10 https://www.$DOMAIN >/dev/null; then
    echo "✅ WWW HTTPS accessible"
else
    echo "❌ WWW HTTPS not accessible"
fi

# Check HTTP to HTTPS redirect
echo ""
echo "🔄 HTTP Redirect Test:"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN)
if [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    echo "✅ HTTP redirects to HTTPS"
else
    echo "❌ HTTP does not redirect properly (status: $HTTP_STATUS)"
fi

echo ""
echo "📋 Next Steps:"
echo "1. If DNS shows wrong IP: Update A records in domain registrar"
echo "2. If domain doesn't resolve: Wait for DNS propagation (5-30 min)"
echo "3. If HTTPS not accessible: Check server and SSL certificate"
echo "4. If redirect not working: Check nginx configuration"

echo ""
echo "🔧 Quick fixes:"
echo "- Clear DNS cache: ipconfig /flushdns (Windows)"
echo "- Test again in 10 minutes if DNS was just updated"