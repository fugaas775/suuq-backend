import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

type CityRow = { city: string; alt_names?: string[]; country_code: string };

@Injectable()
export class GeoResolverService {
  private readonly logger = new Logger(GeoResolverService.name);
  private loaded = false;
  private byCity = new Map<string, string>(); // normalized city -> CC
  private containsIndex: Array<{ needle: string; cc: string }> = [];

  constructor() {
    this.tryLoad();
  }

  resolveCountryFromCity(city?: string | null): string | null {
    if (!city) return null;
    const norm = this.norm(city);
    if (!norm) return null;
    const cc = this.byCity.get(norm);
    if (cc) return cc;
    // substring fallback
    for (const row of this.containsIndex) {
      if (norm.includes(row.needle)) return row.cc;
    }
    return null;
  }

  private tryLoad() {
    if (this.loaded) return;
    const envPath = process.env.GEO_CITIES_FILE;
    const defaultPath = path.resolve(process.cwd(), 'assets/geo/ea_cities.csv');
    const filePath = envPath && fs.existsSync(envPath) ? envPath : defaultPath;
    if (!fs.existsSync(filePath)) {
      this.logger.warn(
        `Geo cities file not found at ${filePath}; using built-in minimal mapping`,
      );
      this.seedMinimal();
      this.loaded = true;
      return;
    }
    try {
      const csv = fs.readFileSync(filePath, 'utf8');
      this.loadCsv(csv);
      this.loaded = true;
      this.logger.log(`Loaded geo cities from ${filePath}`);
    } catch (e: any) {
      this.logger.warn(
        `Failed to load geo cities from ${filePath}: ${e?.message || e}`,
      );
      this.seedMinimal();
      this.loaded = true;
    }
  }

  private loadCsv(csv: string) {
    // very small CSV parser: city,alt_names,country_code; alt_names is | separated
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    // skip header if present
    const start = lines[0].toLowerCase().includes('city') ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const row = this.parseLine(lines[i]);
      if (!row) continue;
      const cc = (row.country_code || '').toUpperCase();
      if (!cc) continue;
      const names = [row.city, ...(row.alt_names || [])]
        .map((s) => this.norm(s))
        .filter(Boolean);
      for (const n of names) this.byCity.set(n, cc);
      // contains index: single-token needles for substring matches
      for (const n of names) {
        if (!n) continue;
        // prefer single word tokens like 'addis', 'djibouti'
        const token = n.split(/\s+/)[0];
        if (token && token.length >= 3)
          this.containsIndex.push({ needle: token, cc });
      }
    }
  }

  private parseLine(line: string): CityRow | null {
    // Split on commas, but allow alt_names to include pipes for multiple
    const arr = line.split(',');
    if (arr.length < 2) return null;
    const city = arr[0]?.trim();
    const altRaw = arr[1]?.trim();
    const cc = (arr[2] || arr[arr.length - 1] || '').trim();
    const alt = altRaw
      ? altRaw
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (!city || !cc) return null;
    return { city, alt_names: alt, country_code: cc };
  }

  private seedMinimal() {
    const seed: Array<CityRow> = [
      { city: 'Addis Ababa', alt_names: ['Addis'], country_code: 'ET' },
      { city: 'Jijiga', alt_names: [], country_code: 'ET' },
      { city: 'Dire Dawa', alt_names: [], country_code: 'ET' },
      { city: 'Hawassa', alt_names: [], country_code: 'ET' },
      { city: 'Mogadishu', alt_names: ['Muqdisho'], country_code: 'SO' },
      { city: 'Hargeisa', alt_names: [], country_code: 'SO' },
      { city: 'Bosaso', alt_names: [], country_code: 'SO' },
      { city: 'Nairobi', alt_names: [], country_code: 'KE' },
      { city: 'Mombasa', alt_names: [], country_code: 'KE' },
      { city: 'Djibouti', alt_names: ['Djibouti City'], country_code: 'DJ' },
    ];
    for (const row of seed) {
      const cc = row.country_code.toUpperCase();
      const names = [row.city, ...(row.alt_names || [])]
        .map((s) => this.norm(s))
        .filter(Boolean);
      for (const n of names) this.byCity.set(n, cc);
      for (const n of names) {
        const token = n.split(/\s+/)[0];
        if (token && token.length >= 3)
          this.containsIndex.push({ needle: token, cc });
      }
    }
  }

  private norm(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .trim();
  }
}
