
import { ScraperProvider } from '../base';
import { Storage } from '../../lib/storage';
import { Property } from '../../types/property';

export default class SrealityProvider implements ScraperProvider {
  name = 'sreality';
  private categories = [1, 2]; // 1: apartments, 2: houses
  private regions = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];

  async scrape(storage: Storage, limit: number): Promise<void> {
    const existingIds = storage.getExistingIds();
    let newCount = 0;

    for (const category of this.categories) {
      const typeKey = category === 1 ? 'byty' : 'domy';
      const typeLabel = category === 1 ? 'apartment' : 'house';
      
      for (const region of this.regions) {
        if (newCount >= limit) break;

        for (let page = 1; page <= 3; page++) {
          if (newCount >= limit) break;

          try {
            console.log(`[Sreality] Scraping ${typeKey} in region ${region} (page ${page})...`);
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
              if (newCount >= limit) break;

              try {
                const rawNumId = item.hash_id || item.id;
                const formattedId = `sreality_${typeKey}_${rawNumId}`;
                
                if (existingIds.has(formattedId)) continue;

                const detailUrl = `https://www.sreality.cz/api/cs/v2/estates/${rawNumId}`;
                const detailRes = await fetch(detailUrl);
                if (!detailRes.ok) continue;

                const detail: any = await detailRes.json();
                
                // Price logic
                let finalPrice = detail.price_czk?.value_raw || detail.price?.value || detail.price || 0;
                if (!finalPrice && detail.items) {
                  const priceItem = detail.items.find((i: any) => i.name?.toLowerCase().includes('cena') || i.label?.toLowerCase().includes('cena'));
                  if (priceItem) {
                    const val = String(priceItem.value).replace(/\s/g, '').replace(/[^0-9]/g, '');
                    finalPrice = parseInt(val) || 0;
                  }
                }
                if (!finalPrice || finalPrice <= 0) finalPrice = item.price_czk || 0;
                if (!finalPrice || finalPrice <= 0) continue;

                // Image logic
                let remoteImageUrls: string[] = [];
                if (detail._embedded?.images) {
                  remoteImageUrls = detail._embedded.images
                    .map((img: any) => (img._links?.dynamic || img._links?.self)?.href?.replace('{width}', '1280').replace('{height}', '960'))
                    .filter(Boolean);
                }

                if (remoteImageUrls.length < 3) continue;

                const localImagePaths: string[] = [];
                const maxImages = Math.min(remoteImageUrls.length, 12);
                for (let i = 0; i < maxImages; i++) {
                  const relativePath = `/images/listings/${formattedId}/img_${i}.jpg`;
                  const savedPath = await storage.downloadImage(remoteImageUrls[i], relativePath);
                  if (savedPath) localImagePaths.push(savedPath);
                }

                if (localImagePaths.length < 3) continue;

                const itemsAttr = detail.items || [];
                const findValue = (title: string) => itemsAttr.find((i: any) => i.name === title)?.value || '';

                const listing: Property = {
                  id: formattedId,
                  source: 'sreality',
                  externalId: String(rawNumId),
                  title: detail.name?.value || item.name || "Nemovitost",
                  description: detail.text?.value || detail.description?.value || "Bez popisu",
                  price_czk: finalPrice,
                  locality: detail.locality?.value || item.locality || "Lokalita neznámá",
                  m2_size: parseInt(findValue('Užitná plocha') as string) || parseInt(findValue('Plocha pozemku') as string) || 0,
                  type: typeKey,
                  coordinates: { 
                    lat: detail.map?.lat || item.gps?.lat || 0, 
                    lng: detail.map?.lon || item.gps?.lon || 0 
                  },
                  original_url: `https://www.sreality.cz/detail/prodej/${typeKey}/vse/${rawNumId}`,
                  image_urls: localImagePaths,
                  specs: {
                    stavi: String(findValue('Stav objektu') || 'Neznámo'),
                    vlastnictvi: String(findValue('Vlastnictví') || 'Osobní'),
                    podlazi: String(findValue('Podlaží') || 'Neznámo'),
                    energeticka_narocnost: String(findValue('Energetická náročnost budovy') || 'G'),
                    vytah: findValue('Výtah') ? 'Ano' : 'Ne',
                  },
                  scrapedAt: new Date().toISOString()
                };

                storage.saveListing(listing);
                console.log(`[Sreality] Saved ${formattedId}`);
                newCount++;

              } catch (itemErr) {
                console.error(`Error on Sreality item ${item.id}:`, itemErr);
              }
            }
          } catch (err) {
            console.error(`Error on Sreality page ${page}:`, err);
          }
        }
      }
    }
  }
}
