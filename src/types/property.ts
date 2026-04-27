
export interface Property {
  id: string;
  source: string;
  externalId: string;
  title: string;
  description: string;
  price_czk: number;
  locality: string;
  m2_size: number;
  type: string; // e.g. "byty", "domy"
  coordinates: {
    lat: number;
    lng: number;
  };
  image_urls: string[]; // local paths
  original_url: string;
  specs: {
    stavi: string;
    vlastnictvi: string;
    podlazi: string;
    energeticka_narocnost: string;
    vytah: string;
    [key: string]: string | number | boolean;
  };
  attributes?: Record<string, any>; // For source-specific extra data
  scrapedAt: string;
}

export type PropertyListing = Property;
