# nginx site config for ugasfuad.com
#
# Install / update:
#   scp deploy/nginx.conf root@164.90.195.23:/etc/nginx/sites-available/ugasfuad.com
#   ssh root@164.90.195.23 'ln -sf /etc/nginx/sites-available/ugasfuad.com /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx'
#
# ---------------------------------------------------------------------------
# DNS  (DigitalOcean, verified live)
#     A   ugasfuad.com            -> 164.90.195.23
#     A   www.ugasfuad.com        -> 164.90.195.23
#     A   api.suuq.ugasfuad.com   -> 164.90.195.23   (separate config, untouched)
#     A   suuq.ugasfuad.com       -> 164.90.195.23   (separate config, untouched)
#
# TLS
#     Certificate: /etc/letsencrypt/live/ugasfuad.com/ — covers apex + www.
#
#     Issued with the HTTP-01 webroot challenge, NOT the dns-digitalocean
#     plugin the other sites on this box use, because the API token in
#     /root/.secrets/certbot-do.ini is rejected as invalid. Renewal therefore
#     depends on the ACME location block below staying reachable over plain
#     HTTP — do not put the port 80 server behind a blanket redirect.
#
# Both hostnames serve the site. rel="canonical" on every page points search
# engines at the apex, so there is no need for a www -> apex redirect; the
# address bar simply keeps whichever host the visitor typed.
# ---------------------------------------------------------------------------

# --- port 80: ACME challenges, everything else to HTTPS ---------------------
server {
    listen 80;
    listen [::]:80;
    server_name ugasfuad.com www.ugasfuad.com;

    # Must stay on plain HTTP and ahead of the redirect, or renewals fail.
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# --- port 443: the site -----------------------------------------------------
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ugasfuad.com www.ugasfuad.com;

    ssl_certificate     /etc/letsencrypt/live/ugasfuad.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ugasfuad.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/ugasfuad.com;
    index index.html;
    charset utf-8;

    # Somali is the default language and lives at the root; /en/ holds English.

    # --- compression ----------------------------------------------------------
    gzip on;
    gzip_vary on;
    gzip_min_length 512;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml application/xml;

    # --- security headers -----------------------------------------------------
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # The site loads nothing from third parties. 'unsafe-inline' covers the one
    # inline <script> in <head> that applies the saved theme before first paint.
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;

    # --- static assets --------------------------------------------------------
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        try_files $uri =404;
    }

    location = /robots.txt { expires 1d; }
    location = /sitemap.xml { expires 1d; }

    # --- pages ----------------------------------------------------------------
    # Every page is <slug>/index.html. nginx appends the trailing slash itself
    # when $uri matches a directory, so /projects redirects to /projects/.
    location / {
        try_files $uri $uri/ =404;
        expires 10m;
        add_header Cache-Control "public, max-age=600, must-revalidate";
    }

    error_page 404 /404.html;
    location = /404.html {
        internal;
    }

    access_log /var/log/nginx/ugasfuad.com.access.log;
    error_log  /var/log/nginx/ugasfuad.com.error.log;
}
