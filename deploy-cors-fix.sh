#!/bin/bash

# Production Deployment Script for CORS Fix

echo "🚀 Deploying CORS fixes to production..."

# 1. Build the project
echo "📦 Building project..."
yarn build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# 2. Test CORS configuration locally first
echo "🔍 Testing CORS configuration locally..."

# Start the server in background
yarn start:dev &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Test preflight request
echo "🧪 Testing preflight request..."
PREFLIGHT_RESULT=$(curl -s -I -X OPTIONS http://localhost:3000/api/admin/stats \
  -H "Origin: https://suuq.ugasfuad.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization")

echo "Preflight response headers:"
echo "$PREFLIGHT_RESULT"

# Check if CORS headers are present
if echo "$PREFLIGHT_RESULT" | grep -q "Access-Control-Allow-Origin: https://suuq.ugasfuad.com"; then
    echo "✅ CORS configuration is working correctly!"
else
    echo "❌ CORS configuration issue detected!"
    echo "Expected: Access-Control-Allow-Origin: https://suuq.ugasfuad.com"
fi

# Stop local server
kill $SERVER_PID

echo ""
echo "📋 Deployment Checklist:"
echo "1. ✅ Code updated with proper CORS configuration"
echo "2. ✅ Build successful"
echo "3. 🔍 CORS tested locally"
echo ""
echo "🎯 Next steps for production deployment:"
echo "1. Upload the built files to your production server"
echo "2. Set the ALLOWED_ORIGINS environment variable:"
echo "   export ALLOWED_ORIGINS='https://suuq.ugasfuad.com,https://admin.suuq.ugasfuad.com'"
echo "3. Restart your production server"
echo "4. Test the CORS with production URLs"
echo ""
echo "🧪 Test production CORS with this command:"
echo "curl -X OPTIONS https://api.suuq.ugasfuad.com/api/admin/stats \\"
echo "  -H 'Origin: https://suuq.ugasfuad.com' \\"
echo "  -H 'Access-Control-Request-Method: GET' \\"
echo "  -H 'Access-Control-Request-Headers: Content-Type,Authorization' \\"
echo "  -v"
