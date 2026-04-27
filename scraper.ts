import fs from 'fs';
import path from 'path';

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
const MAIN_DATA_FILE = path.join(process.cwd(), 'src/data/listings.json');

async function scrapeProperties() {
  let allListings: Listing[] = [];
  if (fs.existsSync(MAIN_DATA_FILE)) {
    try {
      allListings = JSON.parse(fs.readFileSync(MAIN_DATA_FILE, 'utf-8'));
    } catch (e) {
      allListings = [];
    }
  }
  const existingIds = new Set(allListings.map(l => l.id));

  console.log(`--- Starting property update ---`);
  console.log(`Current items in DB: ${existingIds.size}`);

  let newCount = 0;
  const BATCH_LIMIT = 50; 

  for (const category of CATEGORIES) {
    if (newCount >= BATCH_LIMIT) break;
    const typeKey = category === 1 ? 'byty' : 'domy';
    for (const region of REGIONS) {
      if (newCount >= BATCH_LIMIT) break;
      for (let page = 1; page <= 10; page++) {
        if (newCount >= BATCH_LIMIT) break;
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
            if (newCount >= BATCH_LIMIT) break; 

            try {
              const rawNumId = item.hash_id || item.id;
              const formattedId = `sreality_${typeKey}_${rawNumId}`;
              
              if (existingIds.has(formattedId)) continue;

              const detailUrl = `https://www.sreality.cz/api/cs/v2/estates/${rawNumId}`;
              const detailRes = await fetch(detailUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
              });
              if (!detailRes.ok) continue;

              const detail: any = await detailRes.json();
              
              // Price parsing
              let finalPrice = 0;
              const p_czk = detail.price_czk?.value_raw || detail.price_czk?.value;
              const p_generic = detail.price?.value_raw || detail.price?.value;
              
              finalPrice = p_czk || p_generic || (typeof detail.price === 'number' ? detail.price : 0);
              
              if (finalPrice <= 1000 && detail.items) {
                const priceItem = detail.items.find((i: any) => i.name?.toLowerCase().includes('cena') || i.label?.toLowerCase().includes('cena'));
                if (priceItem) {
                  if (typeof priceItem.value === 'object' && priceItem.value?.value_raw) {
                    finalPrice = priceItem.value.value_raw;
                  } else {
                    const val = String(priceItem.value).replace(/\s/g, '').replace(/[^0-9]/g, '');
                    finalPrice = parseInt(val) || 0;
                  }
                }
              }

              if (finalPrice <= 1000) {
                const lp = item.price_czk || item.price;
                finalPrice = typeof lp === 'object' ? (lp.value_raw || lp.value || 0) : (lp || 0);
              }

              if (finalPrice <= 1000) continue;

              // Images
              let remoteImageUrls: string[] = [];
              if (detail._embedded?.images) {
                remoteImageUrls = detail._embedded.images
                  .map((img: any) => {
                    const link = img._links?.dynamic || img._links?.self || img._links?.view;
                    if (!link) return null;
                    return link.href.replace('{width}', '1280').replace('{height}', '960').replace(/\|/g, '%7C');
                  })
                  .filter((url: string | null): url is string => !!url);
              }
              
              if (remoteImageUrls.length === 0 && detail._links?.images) {
                 remoteImageUrls = detail._links.images
                   .map((img: any) => img.href?.replace('{width}', '1280').replace('{height}', '960').replace(/\|/g, '%7C'))
                   .filter((url: string | null): url is string => !!url);
              }

              if (remoteImageUrls.length < 3) continue;

              const itemsAttr = detail.items || [];
              const findValue = (title: string) => {
                const res = itemsAttr.find((i: any) => i.name === title || (i.name && i.name.startsWith(title)));
                return res?.value || '';
              };

              const listing: Listing = {
                id: formattedId,
                title: detail.name?.value || item.name || "Nemovitost",
                locality: detail.locality?.value || item.locality || "Lokalita neznámá",
                m2_size: parseInt(String(findValue('Užitná ploch'))) || parseInt(String(findValue('Plocha pozemku'))) || 0,
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
                image_urls: remoteImageUrls.slice(0, 20),
                description: detail.text?.value || detail.description?.value || "Bez popisu",
              };

              allListings.push(listing);
              console.log(`Added: ${formattedId} (${finalPrice} Kč, ${listing.image_urls.length} images)`);
              existingIds.add(formattedId);
              newCount++;
            } catch (itemErr) {
              // silent
            }
          }
        } catch (err) {
          // silent
        }
      }
    }
  }
  console.log(`--- Update complete. Added ${newCount} new records. ---`);

  try {
    fs.writeFileSync(MAIN_DATA_FILE, JSON.stringify(allListings, null, 2));
    console.log(`--- Rebuild complete. Total listings in DB: ${allListings.length} ---`);
  } catch (err) {
    console.error("Aggregation failed:", err);
  }
}

scrapeProperties().catch(err => {
  console.error("Scraper failed:", err);
});
