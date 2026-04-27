
import { Property } from '../types/property';
import { Storage } from '../lib/storage';

export interface ScraperProvider {
  name: string;
  scrape(storage: Storage, limit: number): Promise<void>;
}
