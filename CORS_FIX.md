# CORS Troubleshooting Guide

## Issue Fixed: XMLHttpRequest CORS Error with Credentials

### Problem
```
Access to XMLHttpRequest at 'https://api.suuq.ugasfuad.com/api/auth/login' from origin 'http://localhost:5173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.
```

### Root Cause
The CORS was configured with default settings that don't properly handle:
1. **Credentials**: When `withCredentials: true` is used in frontend requests
2. **Specific Origins**: Using wildcard `*` doesn't work with credentials mode
3. **Preflight Requests**: OPTIONS requests weren't properly configured

### Solution Applied

#### 1. Updated CORS Configuration in `src/main.ts`
```typescript
// ✅ CORS configuration for credentials support
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5173',
      'http://localhost:3000', 
      'http://localhost:3001',
      'https://suuq.ugasfuad.com',
      'https://admin.suuq.ugasfuad.com',
    ];

app.enableCors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`🚫 CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
  ],
  credentials: true, // This is crucial for handling cookies/auth tokens
  preflightContinue: false,
  optionsSuccessStatus: 204,
});
```

#### 2. Key Changes Made:
- ✅ **`credentials: true`** - Allows credentials in cross-origin requests
- ✅ **Specific origins** - No wildcards when using credentials
- ✅ **Environment variable support** - `ALLOWED_ORIGINS` for flexibility
- ✅ **Proper preflight handling** - OPTIONS requests handled correctly
- ✅ **Detailed logging** - Shows blocked origins for debugging

#### 3. Environment Configuration
Created `.env.example` with:
```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://suuq.ugasfuad.com
```

### Frontend Requirements

#### For Axios (React/Vue)
```javascript
// Configure axios to include credentials
axios.defaults.withCredentials = true;

// Or per request
axios.post('https://api.suuq.ugasfuad.com/api/auth/login', data, {
  withCredentials: true
});
```

#### For Fetch API
```javascript
fetch('https://api.suuq.ugasfuad.com/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // This enables credentials
  body: JSON.stringify(data)
});
```

### Testing CORS Configuration

#### 1. Test Preflight Request
```bash
curl -X OPTIONS https://api.suuq.ugasfuad.com/api/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

Should return:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
```

#### 2. Test Actual Request
```bash
curl -X POST https://api.suuq.ugasfuad.com/api/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@suuq.com", "password": "AdminPass123!"}' \
  -v
```

### Deployment Checklist

#### Production Environment Variables
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://suuq.ugasfuad.com,https://admin.suuq.ugasfuad.com
```

#### Nginx Configuration (if using reverse proxy)
```nginx
location /api/ {
    proxy_pass http://localhost:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # CORS headers (if needed at proxy level)
    add_header Access-Control-Allow-Credentials true always;
}
```

### Common CORS Pitfalls to Avoid

1. **❌ Using `*` with credentials**
   ```javascript
   origin: '*', // This won't work with credentials: true
   credentials: true
   ```

2. **❌ Missing credentials in frontend**
   ```javascript
   // Without withCredentials, auth headers won't be sent
   axios.post('/api/login', data); // Missing withCredentials: true
   ```

3. **❌ Wrong origin format**
   ```javascript
   // Don't include trailing slashes in origins
   origin: ['http://localhost:5173/', 'https://example.com/']
   ```

4. **❌ Not handling OPTIONS preflight**
   ```javascript
   // Make sure OPTIONS method is included
   methods: ['GET', 'POST'] // Missing 'OPTIONS'
   ```

### Debugging Tips

1. **Check browser DevTools Network tab** for preflight OPTIONS requests
2. **Look for CORS errors in browser console** with specific details  
3. **Check server logs** for blocked origin warnings
4. **Test with curl** to isolate frontend vs backend issues
5. **Verify environment variables** are loaded correctly

### Status: ✅ RESOLVED

The CORS configuration has been updated to properly handle credentials and specific origins. The backend is now ready for frontend integration with proper authentication flow.
