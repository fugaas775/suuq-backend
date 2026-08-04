server {
    server_name www.suuq-s.com;

    root /var/www/suuq-s.com;

    location = /.well-known/apple-app-site-association {
        default_type application/json;
        add_header Cache-Control "no-store";
    }
    location = /.well-known/assetlinks.json {
        default_type application/json;
        add_header Cache-Control "no-store";
    }

    location / {
        return 301 https://suuq-s.com$request_uri;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.suuq-s.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.suuq-s.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}

server {
    server_name suuq-s.com;

    root /var/www/suuq-s.com;
    index index.html index.htm;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_min_length 256;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;

    location ~* ^/assets/.+\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location = /.well-known/apple-app-site-association {
        default_type application/json;
        add_header Cache-Control "no-store";
    }
    location = /.well-known/assetlinks.json {
        default_type application/json;
        add_header Cache-Control "no-store";
    }

    # Receipt verification — the page behind the QR printed on every POS
    # receipt and order slip. Proxied to the API so the answer always comes
    # from the same records the register writes to, and so a customer scanning
    # a receipt lands on a short, human URL rather than an api.* host.
    # Case-insensitive: the QR encodes the URL in upper case so it fits QR-s
    # alphanumeric mode, which is what keeps the printed square small. Schemes
    # and hosts are case-insensitive by definition; this makes the path so too.
    location ~* ^/v$ { return 302 /v/; }
    location ~* ^/v/(.*)$ {
        # $is_args$args is not optional here: once proxy_pass carries a
        # variable, nginx stops forwarding the query string on its own, and the
        # typed-code form (which submits ?code=) silently gets a blank form back.
        proxy_pass http://127.0.0.1:3000/api/public/receipts/page/$1$is_args$args;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.suuq-s.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.suuq-s.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.suuq-s.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}


server {
    if ($host = suuq-s.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    server_name suuq-s.com;
    return 404; # managed by Certbot


}server {
    if ($host = www.suuq-s.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    server_name www.suuq-s.com;
    return 404; # managed by Certbot


}