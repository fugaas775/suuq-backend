# 🚀 Production Deployment Guide - CORS Fix

## Current Issue
Your production API at `api.suuq.ugasfuad.com` is still returning `Access-Control-Allow-Origin: *`, which doesn't work with credentials (`withCredentials: true`). The CORS configuration has been fixed in the code, but needs to be deployed to production.

## ✅ What Was Fixed in Code

### Updated CORS Configuration in `src/main.ts`:
```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5173',
      'http://localhost:3000', 
      'http://localhost:3001',
      'https://suuq.ugasfuad.com',        // ← Your frontend domain
      'https://admin.suuq.ugasfuad.com',   // ← Admin panel domain
    ];

app.enableCors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`🚫 CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // ← This is crucial for auth headers/cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control', 'Pragma'],
});
```

## 🎯 Deployment Steps

### Step 1: Build the Project
```bash
yarn build
# or
npm run build
```

### Step 2: Set Environment Variables on Production Server
```bash
# SSH into your production server
ssh your-server

# Set the allowed origins
export ALLOWED_ORIGINS='https://suuq.ugasfuad.com,https://admin.suuq.ugasfuad.com'

# Or add to your .env file:
echo "ALLOWED_ORIGINS=https://suuq.ugasfuad.com,https://admin.suuq.ugasfuad.com" >> .env
```

### Step 3: Upload Updated Files
```bash
# Copy built files to production server
scp -r dist/ your-server:/path/to/your/app/
scp -r node_modules/ your-server:/path/to/your/app/
scp package.json your-server:/path/to/your/app/

# Or use your deployment method (Docker, PM2, etc.)
```

### Step 4: Restart Production Server
```bash
# SSH into production server
ssh your-server

# Restart using your process manager
pm2 restart suuq-api
# or
systemctl restart your-service
# or
docker-compose restart api
```

## 🧪 Testing Production CORS

### Test 1: Check Preflight Request
```bash
curl -X OPTIONS https://api.suuq.ugasfuad.com/api/admin/stats \
  -H "Origin: https://suuq.ugasfuad.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

**Expected Response Headers:**
```
Access-Control-Allow-Origin: https://suuq.ugasfuad.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma
```

### Test 2: Actual API Request
```bash
# First get a JWT token
TOKEN=$(curl -X POST https://api.suuq.ugasfuad.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@suuq.com", "password": "AdminPass123!"}' \
  | jq -r '.access_token')

# Test admin endpoint with credentials
curl -X GET https://api.suuq.ugasfuad.com/api/admin/stats \
  -H "Origin: https://suuq.ugasfuad.com" \
  -H "Authorization: Bearer $TOKEN" \
  -v
```

## 🔧 Alternative Quick Fixes

### If You Can't Deploy Right Now:

#### Option 1: Temporary Nginx/Apache CORS Headers
Add these headers at the web server level (Nginx/Apache):

**Nginx:**
```nginx
location /api/ {
    # Add CORS headers
    add_header Access-Control-Allow-Origin "https://suuq.ugasfuad.com" always;
    add_header Access-Control-Allow-Credentials "true" always;
    add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
    add_header Access-Control-Allow-Headers "Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma" always;
    
    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin "https://suuq.ugasfuad.com";
        add_header Access-Control-Allow-Credentials "true";
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS";
        add_header Access-Control-Allow-Headers "Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma";
        return 204;
    }
    
    proxy_pass http://localhost:3000/api/;
}
```

**Apache (.htaccess):**
```apache
Header always set Access-Control-Allow-Origin "https://suuq.ugasfuad.com"
Header always set Access-Control-Allow-Credentials "true"
Header always set Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS"
Header always set Access-Control-Allow-Headers "Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma"

# Handle preflight requests
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=204,L]
```

## 🐳 Docker Deployment

If you're using Docker:

### Update docker-compose.yml:
```yaml
services:
  api:
    build: .
    environment:
      - ALLOWED_ORIGINS=https://suuq.ugasfuad.com,https://admin.suuq.ugasfuad.com
      - NODE_ENV=production
    ports:
      - "3000:3000"
```

### Rebuild and restart:
```bash
docker-compose build api
docker-compose up -d api
```

## 📋 Deployment Checklist

- [ ] **Build project locally** (`yarn build`)
- [ ] **Set production environment variables** (`ALLOWED_ORIGINS`)
- [ ] **Upload updated files** to production server
- [ ] **Restart production server** (PM2/Docker/SystemD)
- [ ] **Test CORS with curl** (preflight + actual request)
- [ ] **Test frontend** - CORS errors should be gone
- [ ] **Check server logs** for any CORS blocked warnings

## 🚨 If Still Not Working

1. **Check server logs** for CORS messages
2. **Verify environment variables** are loaded: `console.log(process.env.ALLOWED_ORIGINS)`
3. **Test locally** with production domains in ALLOWED_ORIGINS
4. **Check if there's a reverse proxy** (Nginx/Apache) overriding headers
5. **Ensure no caching** is serving old responses

## 📞 Quick Debug Commands

```bash
# Check if server is returning correct CORS headers
curl -I https://api.suuq.ugasfuad.com/api/admin/stats -H "Origin: https://suuq.ugasfuad.com"

# Check what environment variables are set
ssh your-server "printenv | grep ALLOWED"

# Check server logs
ssh your-server "tail -f /path/to/your/logs"
```

---

## ✅ Expected Result After Deployment

Your frontend errors should disappear and you should see:
- ✅ No more CORS errors in browser console
- ✅ API requests working from `https://suuq.ugasfuad.com`
- ✅ Authentication working properly
- ✅ Admin panel fully functional

The key is deploying the updated CORS configuration to your production server! 🚀
