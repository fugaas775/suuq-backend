#!/bin/bash

# Admin Panel Authentication Test Script
# This script helps you test the admin authentication and endpoints

echo "🚀 Admin Panel Authentication Test"
echo "=================================="

# Configuration
API_BASE="http://localhost:3000/api"
ADMIN_EMAIL="admin@suuq.com"
ADMIN_PASSWORD="Ugas0912615526Suuq"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📝 Admin Credentials:${NC}"
echo "  Email: $ADMIN_EMAIL"
echo "  Password: $ADMIN_PASSWORD"
echo ""

echo -e "${YELLOW}🔐 Step 1: Login to get JWT token...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\"}")

if [[ $LOGIN_RESPONSE == *"accessToken"* ]]; then
  echo -e "${GREEN}✅ Login successful!${NC}"
  
  # Extract the access token
  ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  
  if [[ -n $ACCESS_TOKEN ]]; then
    echo -e "${GREEN}🎟️  JWT Token obtained${NC}"
    echo "Token (first 50 chars): ${ACCESS_TOKEN:0:50}..."
    echo ""
    
    echo -e "${YELLOW}🧪 Step 2: Testing admin endpoints...${NC}"
    
    # Test 1: Admin Stats
    echo "📊 Testing /api/admin/stats..."
    STATS_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/stats" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    if [[ $STATS_RESPONSE == *"totalUsers"* ]]; then
      echo -e "${GREEN}✅ Admin stats endpoint working${NC}"
      echo "Response: $STATS_RESPONSE" | jq . 2>/dev/null || echo "Response: $STATS_RESPONSE"
    else
      echo -e "${RED}❌ Admin stats endpoint failed${NC}"
      echo "Response: $STATS_RESPONSE"
    fi
    echo ""
    
    # Test 2: Admin Users List
    echo "👥 Testing /api/admin/users..."
    USERS_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/users?page=1&pageSize=5" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    if [[ $USERS_RESPONSE == *"users"* ]]; then
      echo -e "${GREEN}✅ Admin users endpoint working${NC}"
      echo "Found users in response"
    else
      echo -e "${RED}❌ Admin users endpoint failed${NC}"
      echo "Response: $USERS_RESPONSE"
    fi
    echo ""
    
    # Test 3: Admin Orders List
    echo "📦 Testing /api/admin/orders..."
    ORDERS_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/orders?page=1&pageSize=5" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    if [[ $ORDERS_RESPONSE == *"orders"* ]] || [[ $ORDERS_RESPONSE == "[]" ]]; then
      echo -e "${GREEN}✅ Admin orders endpoint working${NC}"
    else
      echo -e "${RED}❌ Admin orders endpoint failed${NC}"
      echo "Response: $ORDERS_RESPONSE"
    fi
    echo ""
    
    echo -e "${GREEN}🎉 Authentication test completed!${NC}"
    echo ""
    echo -e "${YELLOW}💡 To use in your frontend:${NC}"
    echo "1. Login with the admin credentials above"
    echo "2. Extract the 'accessToken' from the response"
    echo "3. Include it in headers: Authorization: Bearer <token>"
    echo ""
    echo -e "${YELLOW}📝 Example JavaScript fetch:${NC}"
    echo "fetch('${API_BASE}/admin/stats', {"
    echo "  headers: {"
    echo "    'Authorization': 'Bearer ${ACCESS_TOKEN:0:50}...',"
    echo "    'Content-Type': 'application/json'"
    echo "  }"
    echo "})"
    
  else
    echo -e "${RED}❌ Could not extract access token from response${NC}"
    echo "Response: $LOGIN_RESPONSE"
  fi
else
  echo -e "${RED}❌ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo -e "${YELLOW}🔧 Troubleshooting:${NC}"
  echo "1. Make sure the server is running: yarn start:dev"
  echo "2. Check if admin user exists: yarn seed:admin"
  echo "3. Verify database connection"
fi
