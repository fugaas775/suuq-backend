import { Injectable } from '@nestjs/common';

export interface FlagRule {
  key: string; // env var key prefix, e.g., FEATURE_X
  minVersion?: string; // minimum app version to enable (semver-ish)
  percent?: number; // rollout percentage 0..100
}

function parseSemver(v: string): number[] {
  return v.split('.').map((n) => parseInt(n, 10) || 0);
}
function gteSemver(a: string, b: string): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return true;
}

@Injectable()
export class FeatureFlagsService {
  // Evaluate a flag for a given app version and optional user/device id for bucketing
  isEnabled(flagName: string, appVersion: string | undefined, bucketId?: string): boolean {
    const prefix = `FEATURE_${flagName.toUpperCase()}`;
    const enabled = (process.env[`${prefix}_ENABLED`] || 'false').toLowerCase() === 'true';
    if (!enabled) return false;

    const minVersion = process.env[`${prefix}_MIN_VERSION`];
    if (minVersion && appVersion && !gteSemver(appVersion, minVersion)) {
      return false;
    }

    const percent = Math.max(0, Math.min(100, parseInt(process.env[`${prefix}_PCT`] || '100', 10)));
    if (percent >= 100) return true;
    if (percent <= 0) return false;

    // Stable bucketing by bucketId (userId, deviceId). If not provided, randomize per-process.
    const seed = bucketId || process.env.HOSTNAME || 'default';
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const bucket = hash % 100;
    return bucket < percent;
  }
}
