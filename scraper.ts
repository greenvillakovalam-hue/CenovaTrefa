
import { Storage } from './src/lib/storage';
import { ScraperProvider } from './src/scrapers/base';
import fs from 'fs';
import path from 'path';

async function main() {
  const storage = new Storage();
  
  // Auto-discover providers
  const providersDir = path.join(process.cwd(), 'src/scrapers/providers');
  const providerFiles = fs.readdirSync(providersDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  
  const providers: ScraperProvider[] = [];

  for (const file of providerFiles) {
    try {
      const modulePath = path.resolve(providersDir, file);
      const module = await import(`file://${modulePath}`);
      
      // Look for a class that implements ScraperProvider
      let ProviderClass = module.default;
      
      if (!ProviderClass) {
        // Fallback to searching all exports
        for (const key in module) {
          const exportValue = module[key];
          if (typeof exportValue === 'function' && exportValue.prototype && 'scrape' in exportValue.prototype) {
            ProviderClass = exportValue;
            break;
          }
        }
      }

      if (ProviderClass) {
        providers.push(new ProviderClass());
      } else {
        console.warn(`No valid provider class found in ${file}`);
      }
    } catch (err) {
      console.error(`Failed to load provider from ${file}:`, err);
    }
  }

  console.log(`--- Starting full scraper run (${providers.length} providers) ---`);
  
  for (const provider of providers) {
    try {
      console.log(`\n>>> Running provider: ${provider.name}`);
      // Limit to 20 new listings per run to avoid rate limits
      await provider.scrape(storage, 20);
    } catch (err) {
      console.error(`Provider ${provider.name} failed:`, err);
    }
  }

  console.log(`\n--- All scrapers finished ---`);
  storage.updateAggregatedFile();
}

main().catch(err => {
  console.error("Critical scraper failure:", err);
  process.exit(1);
});
