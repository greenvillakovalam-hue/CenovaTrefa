
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { Property } from '../types/property';

export class Storage {
  private listingsDir: string;
  private imagesBaseDir: string;
  private aggregatedFile: string;

  constructor() {
    this.listingsDir = path.join(process.cwd(), 'src/data/listings');
    this.imagesBaseDir = path.join(process.cwd(), 'public/images/listings');
    this.aggregatedFile = path.join(process.cwd(), 'src/data/listings.json');

    this.ensureDirs();
  }

  private ensureDirs() {
    [this.listingsDir, this.imagesBaseDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async downloadImage(url: string, relativePath: string): Promise<string | null> {
    const destPath = path.join(process.cwd(), 'public', relativePath);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return null;

      const fileStream = fs.createWriteStream(destPath);
      await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
      return relativePath;
    } catch (err) {
      console.error(`Failed to download image ${url}:`, err);
      return null;
    }
  }

  saveListing(listing: Property) {
    const filePath = path.join(this.listingsDir, `${listing.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(listing, null, 2));
  }

  getExistingIds(): Set<string> {
    if (!fs.existsSync(this.listingsDir)) return new Set();
    const files = fs.readdirSync(this.listingsDir);
    return new Set(files.map(f => f.replace('.json', '')));
  }

  /**
   * Aggregates all individual JSON files into a single listings.json for the frontend.
   */
  updateAggregatedFile() {
    const files = fs.readdirSync(this.listingsDir);
    const listings = files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.listingsDir, f), 'utf-8'));
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    fs.writeFileSync(this.aggregatedFile, JSON.stringify(listings, null, 2));
    console.log(`Updated aggregated file with ${listings.length} listings.`);
  }
}
