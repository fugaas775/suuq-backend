# Flutter Force Update Implementation Guide

This guide provides the exact code snippets to implement the force update strategy in your Flutter app, integrating with the NestJS backend endpoints we just created.

## 1. Shorebird Integration (OTA Updates)

Shorebird allows you to push Dart code updates instantly without going through the app stores.

**Setup:**

1. Install Shorebird CLI: `curl --proto '=https' --tlsv1.2 -sSf https://setup.shorebird.dev | bash`
2. Initialize in your Flutter project: `shorebird init`
3. Build your release: `shorebird release android` / `shorebird release ios`
4. Push a patch: `shorebird patch android` / `shorebird patch ios`

**Code Integration (Optional but recommended to check for patches on startup):**

```dart
import 'package:shorebird_code_push/shorebird_code_push.dart';

final shorebirdCodePush = ShorebirdCodePush();

Future<void> checkForOtaUpdates() async {
  final isUpdateAvailable = await shorebirdCodePush.isNewPatchAvailableForDownload();
  if (isUpdateAvailable) {
    await shorebirdCodePush.downloadUpdateIfAvailable();
    // Optionally prompt the user to restart the app
  }
}
```

## 2. Backend-Driven Force Update (Native Changes)

We created the `GET /api/settings/app-versions` endpoint. Here is how to consume it in Flutter.

**Dependencies:**

```yaml
dependencies:
  package_info_plus: ^8.0.0
  url_launcher: ^6.3.0
  dio: ^5.5.0
```

**Version Check Logic (Run this on your Splash Screen):**

```dart
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class VersionCheckService {
  final Dio _dio = Dio();

  Future<void> checkVersion(BuildContext context) async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;
      final platform = Platform.isIOS ? 'ios' : 'android';

      final response = await _dio.get('https://api.suuq.ugasfuad.com/api/settings/app-versions');
      final versions = response.data[platform];

      final minVersion = versions['min_version'];
      final latestVersion = versions['latest_version'];

      if (_isVersionOlder(currentVersion, minVersion)) {
        // Force Update Required
        _showUpdateDialog(context, force: true);
      } else if (_isVersionOlder(currentVersion, latestVersion)) {
        // Soft Update Available
        _showUpdateDialog(context, force: false);
      }
    } catch (e) {
      // Handle error, maybe allow them to proceed if API fails
      print('Failed to check version: $e');
    }
  }

  bool _isVersionOlder(String current, String target) {
    final currentParts = current.split('.').map(int.parse).toList();
    final targetParts = target.split('.').map(int.parse).toList();

    for (int i = 0; i < targetParts.length; i++) {
      final c = i < currentParts.length ? currentParts[i] : 0;
      final t = targetParts[i];
      if (c < t) return true;
      if (c > t) return false;
    }
    return false;
  }

  void _showUpdateDialog(BuildContext context, {required bool force}) {
    showDialog(
      context: context,
      barrierDismissible: !force,
      builder: (context) => WillPopScope(
        onWillPop: () async => !force,
        child: AlertDialog(
          title: Text(force ? 'Update Required' : 'Update Available'),
          content: Text(
            force
              ? 'A critical update is required to continue using the app.'
              : 'A new version of the app is available. Would you like to update now?'
          ),
          actions: [
            if (!force)
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Later'),
              ),
            ElevatedButton(
              onPressed: () {
                final url = Platform.isIOS
                  ? 'https://apps.apple.com/app/idYOUR_APP_ID'
                  : 'https://play.google.com/store/apps/details?id=YOUR_PACKAGE_NAME';
                launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
              },
              child: const Text('Update Now'),
            ),
          ],
        ),
      ),
    );
  }
}
```

## 3. HTTP 426 Interceptor (The Safety Net)

We added a middleware in NestJS that returns `426 Upgrade Required` if the `x-app-version` header is too old.

**Flutter Dio Interceptor:**

```dart
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:package_info_plus/package_info_plus.dart';

class AppVersionInterceptor extends Interceptor {
  final Function() onUpgradeRequired;

  AppVersionInterceptor({required this.onUpgradeRequired});

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final packageInfo = await PackageInfo.fromPlatform();
    options.headers['x-app-version'] = packageInfo.version;
    options.headers['x-platform'] = Platform.isIOS ? 'ios' : 'android';
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 426) {
      // Trigger the force update screen globally
      onUpgradeRequired();
    }
    handler.next(err);
  }
}

// Usage:
// dio.interceptors.add(AppVersionInterceptor(
//   onUpgradeRequired: () {
//     // Navigate to Force Update Screen
//     navigatorKey.currentState?.pushReplacementNamed('/force-update');
//   },
// ));
```

## 4. Native In-App Updates (Android Only)

For a smoother Android experience, use the `in_app_update` package.

**Dependencies:**

```yaml
dependencies:
  in_app_update: ^4.1.0
```

**Code:**

```dart
import 'package:in_app_update/in_app_update.dart';

Future<void> performAndroidInAppUpdate() async {
  if (!Platform.isAndroid) return;

  try {
    final info = await InAppUpdate.checkForUpdate();
    if (info.updateAvailability == UpdateAvailability.updateAvailable) {
      if (info.immediateUpdateAllowed) {
        await InAppUpdate.performImmediateUpdate();
      } else if (info.flexibleUpdateAllowed) {
        await InAppUpdate.startFlexibleUpdate();
        await InAppUpdate.completeFlexibleUpdate();
      }
    }
  } catch (e) {
    print('In-app update failed: $e');
  }
}
```
