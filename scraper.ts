import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

interface Listing {
  id: string;
  title: string;
  locality: string;
  m2_size: number;
  type: string;
  price_czk: number;
  coordinates: { lat: number; lng: number };
  original_url: string;
  specs: {
    stavi: string;
    vlastnictvi: string;
    podlazi: string;
    energeticka_narocnost: string;
    vytah: string;
    parkovani?: string;
    sklep?: string;
    balkon?: string;
    terasa?: string;
    zahrada?: string;
    garaz?: string;
  };
  image_urls: string[];
  description: string;
}

const CATEGORIES = [1, 2]; 
const REGIONS = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];

const LISTINGS_DIR = path.join(process.cwd(), 'src/data/listings');
const IMAGES_BASE_DIR = path.join(process.cwd(), 'public/images/listings');

// Ensure directories exist
if (!fs.existsSync(LISTINGS_DIR)) fs.mkdirSync(LISTINGS_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_BASE_DIR)) fs.mkdirSync(IMAGES_BASE_DIR, { recursive: true });

async function downloadImage(url: string, destPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(destPath);
  await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
}

async function scrapeProperties() {
  // Get already processed IDs from the directory
  const existingFiles = fs.readdirSync(LISTINGS_DIR);
  const existingIds = new Set(existingFiles.map(f => f.replace('.json', '')));

  console.log(`--- Starting property update ---`);
  console.log(`Current items in DB: ${existingIds.size}`);

  let newCount = 0;
  const BATCH_LIMIT = 100; // Increased from 50

  for (const category of CATEGORIES) {
    const typeKey = category === 1 ? 'byty' : 'domy';
    for (const region of REGIONS) {
      for (let page = 1; page <= 5; page++) { // Increased from 3
        try {
          console.log(`Scraping ${typeKey} in region ${region} (page ${page})...`);
          
          const listUrl = `https://www.sreality.cz/api/cs/v2/estates?category_main_cb=${category}&category_type_cb=1&region_entity_id=${region}&region_entity_type=region&per_page=60&page=${page}`;
          
          const response = await fetch(listUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

        if (!response.ok) continue;

        const data: any = await response.json();
        const listItems = data._embedded?.estates || [];

        for (const item of listItems) {
          if (newCount >= BATCH_LIMIT) return; // Stop if batch limit reached

          try {
            const rawNumId = item.hash_id || item.id;
            const formattedId = `sreality_${typeKey}_${rawNumId}`;
            
            if (existingIds.has(formattedId)) continue;

            console.log(`Processing listing: ${formattedId}`);

            const detailUrl = `https://www.sreality.cz/api/cs/v2/estates/${rawNumId}`;
            const detailRes = await fetch(detailUrl);
            if (!detailRes.ok) {
              console.log(`Detail fetch failed for ${formattedId}: ${detailRes.status}`);
              continue;
            }

            const detail: any = await detailRes.json();
            
            // Try to find price in detail items if not at top level
            let finalPrice = detail.price_czk?.value_raw || detail.price?.value || detail.price || 0;
            if (!finalPrice && detail.items) {
              const priceItem = detail.items.find((i: any) => i.name?.toLowerCase().includes('cena') || i.label?.toLowerCase().includes('cena'));
              if (priceItem) {
                const val = String(priceItem.value).replace(/\s/g, '').replace(/[^0-9]/g, '');
                finalPrice = parseInt(val) || 0;
              }
            }

            // Fallback to list item price
            if (!finalPrice || finalPrice <= 0) {
              finalPrice = item.price_czk || 0;
            }

            if (!finalPrice || finalPrice <= 0) {
              console.log(`Invalid price (${finalPrice}) for ${formattedId}`);
              continue;
            }
            
            // Extract images more robustly
            let remoteImageUrls: string[] = [];
            
            // Try _embedded.images (Standard for Sreality API)
            if (detail._embedded?.images) {
              remoteImageUrls = detail._embedded.images
                .map((img: any) => {
                  const link = img._links?.dynamic || img._links?.self;
                  if (!link) return null;
                  return link.href.replace('{width}', '1280').replace('{height}', '960');
                })
                .filter((url: string | null): url is string => !!url);
            }
            
            // Fallback to _links.images if _embedded is missing
            if (remoteImageUrls.length === 0 && detail._links?.images) {
               remoteImageUrls = detail._links.images
                 .map((img: any) => img.href?.replace('{width}', '1280').replace('{height}', '960'))
                 .filter((url: string | null): url is string => !!url);
            }

            if (remoteImageUrls.length < 3) {
              console.log(`Not enough images (${remoteImageUrls.length}) for ${formattedId}`);
              continue;
            }

            // Create local image folder
            const localImagesDir = path.join(IMAGES_BASE_DIR, formattedId);
            if (!fs.existsSync(localImagesDir)) fs.mkdirSync(localImagesDir, { recursive: true });

            const localImagePaths: string[] = [];
            
            // Download images (up to 20)
            const maxImages = Math.min(remoteImageUrls.length, 20);
            for (let i = 0; i < maxImages; i++) {
              const fileName = `img_${i}.jpg`;
              const destPath = path.join(localImagesDir, fileName);
              try {
                await downloadImage(remoteImageUrls[i], destPath);
                localImagePaths.push(`/images/listings/${formattedId}/${fileName}`);
              } catch (err) {
                // Skip failed image
              }
            }

            if (localImagePaths.length < 3) {
              console.log(`Failed to download enough images for ${formattedId}`);
              continue;
            }

            const itemsAttr = detail.items || [];
            const findValue = (title: string) => itemsAttr.find((i: any) => i.name === title)?.value || '';

            const listing: Listing = {
              id: formattedId,
              title: detail.name?.value || item.name || "Nemovitost",
              locality: detail.locality?.value || item.locality || "Lokalita neznámá",
              m2_size: parseInt(findValue('Užitná plocha') as string) || parseInt(findValue('Plocha pozemku') as string) || 0,
              type: typeKey,
              price_czk: finalPrice,
              coordinates: { 
                lat: detail.map?.lat || item.gps?.lat || 0, 
                lng: detail.map?.lon || item.gps?.lon || 0 
              },
              original_url: `https://www.sreality.cz/detail/prodej/${typeKey}/vse/${rawNumId}`,
              specs: {
                stavi: String(findValue('Stav objektu') || 'Neznámo'),
                vlastnictvi: String(findValue('Vlastnictví') || 'Osobní'),
                podlazi: String(findValue('Podlaží') || 'Neznámo'),
                energeticka_narocnost: String(findValue('Energetická náročnost budovy') || 'G'),
                vytah: findValue('Výtah') ? 'Ano' : 'Ne',
                parkovani: String(findValue('Parkování') || ''),
                sklep: String(findValue('Sklep') || ''),
                balkon: String(findValue('Balkón') || ''),
                terasa: String(findValue('Terasa') || ''),
                zahrada: String(findValue('Zahrada') || ''),
                garaz: String(findValue('Garáž') || ''),
              },
              image_urls: localImagePaths,
              description: detail.text?.value || detail.description?.value || "Bez popisu",
            };

            const listingFilePath = path.join(LISTINGS_DIR, `${formattedId}.json`);
            fs.writeFileSync(listingFilePath, JSON.stringify(listing, null, 2));
            console.log(`Saved: ${formattedId} (${finalPrice} Kč, ${localImagePaths.length} images)`);

            existingIds.add(formattedId);
            newCount++;
          } catch (itemErr) {
            console.error(`Error on item ${item.hash_id || item.id}:`, itemErr);
          }
        }
      } catch (err) {
        console.error(`Error on page ${page}, region ${region}:`, err);
      }
      }
    }
  }
  console.log(`--- Update complete. Added ${newCount} new records. ---`);

  // Aggregation: Rebuild the main listings.json
  console.log(`--- Rebuilding main listings.json ---`);
  const allListingFiles = fs.readdirSync(LISTINGS_DIR).filter(f => f.endsWith('.json'));
  const allListings: Listing[] = [];

  for (const file of allListingFiles) {
    try {
      const content = fs.readFileSync(path.join(LISTINGS_DIR, file), 'utf-8');
      allListings.push(JSON.parse(content));
    } catch (err) {
      console.error(`Failed to read/parse ${file}:`, err);
    }
  }

  const mainFilePath = path.join(process.cwd(), 'src/data/listings.json');
  fs.writeFileSync(mainFilePath, JSON.stringify(allListings, null, 2));
  console.log(`--- Rebuild complete. Total listings in DB: ${allListings.length} ---`);
}

scrapeProperties().catch(err => {
  console.error("Scraper failed:", err);
});
