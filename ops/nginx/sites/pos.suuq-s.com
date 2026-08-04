server {
    server_name pos.suuq-s.com;

    root /var/www/pos.suuq-s.com;
    index index.html index.htm;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_min_length 256;
    gzip_types text/plain text/css text/javascript application/javascript application/x-javascript application/json application/xml image/svg+xml;

    location ~* ^/assets/.+\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires 0;
        include snippets/pos-suuq-s-security.conf;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.suuq-s.com https://api.github.com https://objects.githubusercontent.com https://accounts.google.com https://www.googleapis.com https://suuq-media.ams3.digitaloceanspaces.com; frame-src 'self' https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://accounts.google.com" always;

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.suuq-s.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.suuq-s.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}
server {
    if ($host = pos.suuq-s.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    server_name pos.suuq-s.com;
    return 404; # managed by Certbot


}