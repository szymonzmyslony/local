import { getMarketConfig, isMarketCode, type MarketCode } from "@shared";

export function resolveMarket(location: Pick<Location, "hostname" | "pathname" | "search">): MarketCode {
  const queryMarket = new URLSearchParams(location.search).get("market");
  if (queryMarket && isMarketCode(queryMarket)) return queryMarket;

  const firstPathSegment = location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (firstPathSegment === "warsaw" || firstPathSegment === "waw") return "waw";
  if (firstPathSegment === "london" || firstPathSegment === "ldn") return "ldn";
  return location.hostname.toLowerCase().startsWith("warsaw.") ? "waw" : "ldn";
}

export function marketHomePath(market: MarketCode): string {
  return market === "waw" ? "/warsaw" : "/";
}

export function otherMarket(market: MarketCode): MarketCode {
  return market === "ldn" ? "waw" : "ldn";
}

export function marketLabel(market: MarketCode): string {
  return getMarketConfig(market).city;
}
