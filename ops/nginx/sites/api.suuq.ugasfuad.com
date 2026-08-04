server {
    server_name api.suuq.ugasfuad.com;

    # Access and error logs
    access_log /var/log/nginx/api.suuq.ugasfuad.com.access.log;
    error_log /var/log/nginx/api.suuq.ugasfuad.com.error.log;

    # Static-ish API endpoints: categories, countries, settings — cache longer
    location ~* ^/api/(categories|countries|settings) {
        limit_req zone=api_high burst=300;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_cache suuq_cache;
        proxy_cache_valid 200 10m;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        add_header X-Cache-Status $upstream_cache_status;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Products: short micro-cache for hot list requests and proper CORS preflight
    location ^~ /api/products {
        # Handle CORS preflight inside a valid context
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' $http_origin always;
            add_header 'Vary' 'Origin' always;
            add_header 'Access-Control-Allow-Credentials' 'true' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            return 204;
        }

        # Micro-cache hot GETs only; disable for unsafe methods
        set $microcache_enabled 0;
        if ($request_method = 'GET') { set $microcache_enabled 1; }

        # Rate limit: generous burst to smooth SPA fan-out
        limit_req zone=api_high burst=360;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;

        # Enable micro-cache only for GET
        proxy_no_cache $http_authorization $cookie_session $arg_cache_bust;
        proxy_cache_bypass $http_authorization $cookie_session $arg_cache_bust;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_valid 200 30s;
        proxy_cache_lock on;
        add_header X-Micro-Cache $upstream_cache_status always;
        proxy_cache suuq_api_micro;
    }

    # Admin endpoints: more restrictive rate limiting, no cache
    location ^~ /api/admin/ {
        limit_req zone=api_per_path burst=80;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Large media uploads
    location = /api/media/upload {
        client_max_body_size 50M;
        proxy_request_buffering off;
        client_body_timeout 600s;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        send_timeout 600s;
    }

    # Payment initiation endpoints — need longer timeout for Ebirr push processing
    location ~* ^/api/seller/v1/workspace/branch-workspaces/initiate-payment {
        limit_req zone=api_per_path burst=10;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
        client_max_body_size 1M;
    }

    location ~* ^/api/seller/v1/workspace/ebirr/activate {
        limit_req zone=api_per_path burst=10;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
        client_max_body_size 1M;
    }

    # Image generation endpoints — must be loadable cross-origin (avatar/initials images)
    location ^~ /api/img/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Cross-Origin-Resource-Policy;
        add_header Cross-Origin-Resource-Policy "cross-origin" always;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Default proxy
    location / {
        limit_req zone=api_per_path burst=60;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;
        client_max_body_size 50M;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

    listen 443 ssl http2; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.suuq.ugasfuad.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.suuq.ugasfuad.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = api.suuq.ugasfuad.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name api.suuq.ugasfuad.com;
    return 404; # managed by Certbot
}
