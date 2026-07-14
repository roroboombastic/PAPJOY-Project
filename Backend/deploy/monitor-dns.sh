#!/bin/bash

# PAPJOY DNS Propagation Monitor
# Run this to check when DNS changes take effect

TARGET_IP=$1

if [ -z "$TARGET_IP" ]; then
    echo "Usage: $0 <your-server-ip>"
    echo "Example: $0 123.456.789.0"
    exit 1
fi

echo "🔍 Monitoring PAPJOY DNS propagation..."
echo "Target IP: $TARGET_IP"
echo "Press Ctrl+C to stop monitoring"
echo ""

while true; do
    echo "$(date '+%H:%M:%S') - Checking DNS..."

    # Check papjoy.com
    CURRENT_IP=$(dig A papjoy.com +short | head -1)
    if [ "$CURRENT_IP" = "$TARGET_IP" ]; then
        echo "✅ papjoy.com: $CURRENT_IP (CORRECT!)"
    else
        echo "❌ papjoy.com: $CURRENT_IP (should be $TARGET_IP)"
    fi

    # Check www.papjoy.com
    WWW_IP=$(dig A www.papjoy.com +short | head -1)
    if [ "$WWW_IP" = "$TARGET_IP" ]; then
        echo "✅ www.papjoy.com: $WWW_IP (CORRECT!)"
    else
        echo "❌ www.papjoy.com: $WWW_IP (should be $TARGET_IP)"
    fi

    echo ""

    # Test website if DNS is correct
    if [ "$CURRENT_IP" = "$TARGET_IP" ]; then
        echo "🌐 Testing website access..."
        if curl -s --max-time 5 https://papjoy.com >/dev/null; then
            echo "✅ Website is accessible!"
            echo "🎉 PAPJOY.COM IS LIVE!"
            exit 0
        else
            echo "⚠️  DNS correct but website not responding"
            echo "   Check: server running, nginx config, SSL certificate"
        fi
        echo ""
    fi

    sleep 30
done