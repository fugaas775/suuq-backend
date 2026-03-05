import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
} from '@nestjs/common';

type AppleAppSiteAssociation = {
  applinks: {
    apps: [];
    details: Array<{
      appID: string;
      paths: string[];
    }>;
  };
};

type AndroidAssetLink = {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

@Controller('linking')
export class LinkingController {
  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json; charset=utf-8')
  getAppleAppSiteAssociation(): AppleAppSiteAssociation {
    const appId =
      process.env.IOS_APP_ID ||
      this.buildIosAppId(
        process.env.IOS_TEAM_ID || '',
        process.env.IOS_BUNDLE_ID || '',
      );

    const paths = this.getIosAssociatedPaths();

    return {
      applinks: {
        apps: [],
        details: appId
          ? [
              {
                appID: appId,
                paths,
              },
            ]
          : [],
      },
    };
  }

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  getAndroidAssetLinks(): AndroidAssetLink[] {
    const packageName = process.env.ANDROID_PACKAGE_NAME || '';
    const fingerprints = this.getAndroidFingerprints();

    if (!packageName || fingerprints.length === 0) {
      return [];
    }

    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
  }

  @Get('product-share-landing')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getProductShareLanding(@Query('id') id: string): string {
    const productId = (id || '').trim();
    if (!productId) {
      throw new BadRequestException('Product id is required');
    }

    return this.renderLandingHtml({
      appRoute: 'product-detail',
      id: productId,
      webFallbackUrl: this.getWebProductUrl(productId),
    });
  }

  @Get('product-share/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getProductShareLandingByPath(@Param('id') id: string): string {
    const productId = (id || '').trim();
    if (!productId) {
      throw new BadRequestException('Product id is required');
    }

    return this.renderLandingHtml({
      appRoute: 'product-detail',
      id: productId,
      webFallbackUrl: this.getWebProductUrl(productId),
    });
  }

  @Get('request-share-landing')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRequestShareLanding(@Query('id') id: string): string {
    const requestId = (id || '').trim();
    if (!requestId) {
      throw new BadRequestException('Request id is required');
    }

    return this.renderLandingHtml({
      appRoute: 'request-detail',
      id: requestId,
      webFallbackUrl: this.getWebRequestUrl(requestId),
    });
  }

  @Get('request-share/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRequestShareLandingByPath(@Param('id') id: string): string {
    const requestId = (id || '').trim();
    if (!requestId) {
      throw new BadRequestException('Request id is required');
    }

    return this.renderLandingHtml({
      appRoute: 'request-detail',
      id: requestId,
      webFallbackUrl: this.getWebRequestUrl(requestId),
    });
  }

  private getIosAssociatedPaths(): string[] {
    const raw = process.env.IOS_ASSOCIATED_PATHS;
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((path) => path.trim())
        .filter(Boolean);
    }

    return ['/product-detail*'];
  }

  private getAndroidFingerprints(): string[] {
    const raw = process.env.ANDROID_SHA256_FINGERPRINTS || '';

    return raw
      .split(',')
      .map((fingerprint) => fingerprint.trim())
      .filter(Boolean);
  }

  private buildIosAppId(teamId: string, bundleId: string): string {
    if (!teamId || !bundleId) return '';
    return `${teamId}.${bundleId}`;
  }

  private getIosStoreUrl(): string {
    return (
      process.env.APP_STORE_URL_IOS ||
      process.env.IOS_STORE_URL ||
      'https://apps.apple.com/'
    );
  }

  private getAndroidStoreUrl(): string {
    const explicit =
      process.env.APP_STORE_URL_ANDROID || process.env.ANDROID_STORE_URL;
    if (explicit) return explicit;

    const pkg = process.env.ANDROID_PACKAGE_NAME || '';
    if (pkg) {
      return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
    }

    return 'https://play.google.com/store/apps';
  }

  private getWebProductUrl(productId: string): string {
    const webBase = process.env.SITE_URL || 'https://suuq.ugasfuad.com';
    return `${webBase}/product-detail?id=${encodeURIComponent(productId)}`;
  }

  private getWebRequestUrl(requestId: string): string {
    const webBase = process.env.SITE_URL || 'https://suuq.ugasfuad.com';
    return `${webBase}/request-detail?id=${encodeURIComponent(requestId)}`;
  }

  private renderLandingHtml(params: {
    appRoute: string;
    id: string;
    webFallbackUrl: string;
  }): string {
    const appScheme = process.env.APP_SCHEME || 'suuq://';
    const deepLink = `${this.normalizeScheme(appScheme)}${params.appRoute}?id=${encodeURIComponent(params.id)}`;
    const iosStoreUrl = this.getIosStoreUrl();
    const androidStoreUrl = this.getAndroidStoreUrl();
    const webFallbackUrl = params.webFallbackUrl;

    const safeDeepLink = this.escapeHtml(deepLink);
    const safeIosStoreUrl = this.escapeHtml(iosStoreUrl);
    const safeAndroidStoreUrl = this.escapeHtml(androidStoreUrl);
    const safeWebFallbackUrl = this.escapeHtml(webFallbackUrl);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open in Suuq</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; line-height: 1.5;">
    <h2 style="margin: 0 0 8px;">Opening Suuq…</h2>
    <p style="margin: 0 0 16px;">If the app is not installed, you will be redirected to the app store.</p>
    <p style="margin: 0;">
      <a href="${safeIosStoreUrl}">Open App Store</a>
      &nbsp;|&nbsp;
      <a href="${safeAndroidStoreUrl}">Open Play Store</a>
      &nbsp;|&nbsp;
      <a href="${safeWebFallbackUrl}">Continue on Web</a>
    </p>
    <script>
      (function() {
        var deepLink = '${safeDeepLink}';
        var iosStore = '${safeIosStoreUrl}';
        var androidStore = '${safeAndroidStoreUrl}';
        var webFallback = '${safeWebFallbackUrl}';
        var ua = navigator.userAgent || '';
        var isAndroid = /Android/i.test(ua);
        var isIOS = /iPhone|iPad|iPod/i.test(ua);
        var fallback = isIOS ? iosStore : (isAndroid ? androidStore : webFallback);
        var start = Date.now();

        setTimeout(function() {
          if (Date.now() - start < 2200) {
            window.location.replace(fallback);
          }
        }, 1400);

        window.location.replace(deepLink);
      })();
    </script>
  </body>
</html>`;
  }

  private normalizeScheme(scheme: string): string {
    if (scheme.endsWith('://')) return scheme;
    if (scheme.endsWith(':')) return `${scheme}//`;
    return `${scheme}://`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
