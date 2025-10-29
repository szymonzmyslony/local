import Firecrawl from '@mendable/firecrawl-js';

export function getFirecrawl(apiKey: string): Firecrawl {
    return new Firecrawl({ apiKey });
}