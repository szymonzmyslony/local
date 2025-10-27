import FirecrawlApp from "@mendable/firecrawl-js";

export interface FirecrawlMapOptions {
  url: string;
  search?: string;
  limit?: number;
  includeSubdomains?: boolean;
}

export interface FirecrawlScrapeOptions {
  url: string;
  onlyMainContent?: boolean;
  maxAge?: number;
}

export interface FirecrawlMapResult {
  links: string[];
}

export interface FirecrawlScrapeResult {
  markdown: string;
}

export class FirecrawlError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "FirecrawlError";
  }
}

/**
 * Call Firecrawl /map endpoint to discover URLs on a site
 */
export async function firecrawlMap(
  apiKey: string,
  options: FirecrawlMapOptions,
): Promise<FirecrawlMapResult> {
  const app = new FirecrawlApp({ apiKey });

  try {
    const response = await app.map(options.url, {
      search: options.search,
      limit: options.limit ?? 50,
      includeSubdomains: options.includeSubdomains ?? false,
    });

    const links = response.links?.map((link) => link.url) ?? [];

    return { links };
  } catch (error) {
    if (error instanceof FirecrawlError) {
      throw error;
    }
    throw new FirecrawlError(
      `Firecrawl map request failed: ${(error as Error).message}`,
    );
  }
}

/**
 * Call Firecrawl /scrape endpoint to get markdown for a URL
 */
export async function firecrawlScrape(
  apiKey: string,
  options: FirecrawlScrapeOptions,
): Promise<FirecrawlScrapeResult> {
  const app = new FirecrawlApp({ apiKey });

  try {
    const response = await app.scrape(options.url, {
      formats: ["markdown"],
      onlyMainContent: options.onlyMainContent ?? false,
    });

    const markdown = response.markdown ?? "";

    if (!markdown) {
      throw new FirecrawlError("No markdown content in Firecrawl response");
    }

    return { markdown };
  } catch (error) {
    if (error instanceof FirecrawlError) {
      throw error;
    }
    throw new FirecrawlError(
      `Firecrawl scrape request failed: ${(error as Error).message}`,
    );
  }
}
