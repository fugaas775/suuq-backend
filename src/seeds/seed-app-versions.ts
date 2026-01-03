import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SettingsService } from '../settings/settings.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const uiSettingRepo = app.get<Repository<UiSetting>>(
    getRepositoryToken(UiSetting),
  );

  const siteUrl = process.env.SITE_URL || 'https://suuq.ugasfuad.com';

  const settings = [
    {
      key: 'app_version_android_min',
      value: '1.0.0',
      description: 'Minimum supported Android version (force update if lower)',
    },
    {
      key: 'app_version_android_latest',
      value: '1.0.1',
      description: 'Latest available Android version (soft update prompt)',
    },
    {
      key: 'app_version_ios_min',
      value: '1.0.0',
      description: 'Minimum supported iOS version (force update if lower)',
    },
    {
      key: 'app_version_ios_latest',
      value: '1.0.1',
      description: 'Latest available iOS version (soft update prompt)',
    },
    {
      key: 'app_update_message',
      value:
        'A new version of Suuq is available with improved performance and new features. Please update to continue.',
      description: 'Message to display in the update dialog',
    },
    {
      key: 'app_store_url_android',
      value: `${siteUrl}/download/android`,
      description: 'Link to Google Play Store',
    },
    {
      key: 'app_store_url_ios',
      value: `${siteUrl}/download/ios`,
      description: 'Link to Apple App Store',
    },
    {
      key: 'app_force_update_global',
      value: false,
      description: 'Emergency switch to force update for everyone',
    },
  ];

  for (const s of settings) {
    const existing = await uiSettingRepo.findOne({ where: { key: s.key } });
    if (existing) {
      console.log(`Setting ${s.key} already exists. Skipping.`);
    } else {
      await uiSettingRepo.save(uiSettingRepo.create(s));
      console.log(`Created setting ${s.key}`);
    }
  }

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
