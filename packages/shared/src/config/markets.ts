export const MARKET_CODES = ["ldn", "waw"] as const;

export type MarketCode = (typeof MARKET_CODES)[number];

export type MarketConfig =
  | {
      market: "ldn";
      city: "London";
      countryCode: "GB";
      timezone: "Europe/London";
      locale: "en-GB";
      language: "English";
    }
  | {
      market: "waw";
      city: "Warsaw";
      countryCode: "PL";
      timezone: "Europe/Warsaw";
      locale: "pl-PL";
      language: "Polish";
    };

const MARKET_CONFIGS: Record<MarketCode, MarketConfig> = {
  ldn: {
    market: "ldn",
    city: "London",
    countryCode: "GB",
    timezone: "Europe/London",
    locale: "en-GB",
    language: "English"
  },
  waw: {
    market: "waw",
    city: "Warsaw",
    countryCode: "PL",
    timezone: "Europe/Warsaw",
    locale: "pl-PL",
    language: "Polish"
  }
};

export function isMarketCode(value: string): value is MarketCode {
  return MARKET_CODES.some((market) => market === value);
}

export function getMarketConfig(market: MarketCode): MarketConfig {
  return MARKET_CONFIGS[market];
}

export function marketFromAgentName(name: string): MarketCode {
  return name.startsWith("waw-") ? "waw" : "ldn";
}
