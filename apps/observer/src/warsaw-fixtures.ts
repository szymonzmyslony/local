import type { MarketConfig } from "@gallery-agents/shared";
import type { MarketFixture } from "./london-fixtures";

const WARSAW_MARKET = {
  market: "waw",
  city: "Warsaw",
  countryCode: "PL",
  timezone: "Europe/Warsaw",
  locale: "pl-PL",
  language: "Polish"
} as const satisfies MarketConfig;

const WARSAW_FIXTURE_DATA: Array<Omit<MarketFixture, "market">> = [
  {
    id: "zacheta",
    name: "Zachęta – National Gallery of Art",
    mainUrl: "https://zacheta.art.pl/pl",
    eventsUrl: "https://zacheta.art.pl/pl/wystawy",
    area: "Srodmiescie",
    tier: "national",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "msn-warsaw",
    name: "Muzeum Sztuki Nowoczesnej",
    mainUrl: "https://artmuseum.pl/",
    eventsUrl: "https://artmuseum.pl/program",
    area: "Srodmiescie",
    tier: "national",
    renderProfile: "javascript",
    expectedMinimumItems: 1
  },
  {
    id: "zamek-ujazdowski",
    name: "Centrum Sztuki Współczesnej Zamek Ujazdowski",
    mainUrl: "https://u-jazdowski.pl/",
    eventsUrl: "https://u-jazdowski.pl/program/wystawy",
    area: "Srodmiescie",
    tier: "institution",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "mnw",
    name: "Muzeum Narodowe w Warszawie",
    mainUrl: "https://www.mnw.art.pl/",
    eventsUrl: "https://www.mnw.art.pl/wystawy/",
    area: "Srodmiescie",
    tier: "national",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "bwa-warszawa",
    name: "BWA Warszawa",
    mainUrl: "https://bwawarszawa.pl/",
    eventsUrl: "https://bwawarszawa.pl/exhibitions/",
    area: "Srodmiescie",
    tier: "independent",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "galeria-foksal",
    name: "Galeria Foksal",
    mainUrl: "https://www.galeriafoksal.pl/wystawy/home/",
    eventsUrl: "https://www.galeriafoksal.pl/wystawy/",
    area: "Srodmiescie",
    tier: "institution",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "foksal-gallery-foundation",
    name: "Fundacja Galerii Foksal",
    mainUrl: "https://foksalgalleryfoundation.com/",
    eventsUrl: "https://foksalgalleryfoundation.com/exhibition",
    area: "Srodmiescie",
    tier: "independent",
    renderProfile: "hybrid",
    expectedMinimumItems: 0
  },
  {
    id: "raster",
    name: "Raster Gallery",
    mainUrl: "https://en.rastergallery.com/",
    eventsUrl: "https://en.rastergallery.com/wystawy/",
    area: "Srodmiescie",
    tier: "independent",
    renderProfile: "hybrid",
    expectedMinimumItems: 0
  },
  {
    id: "lokal-30",
    name: "lokal_30",
    mainUrl: "https://lokal30.pl/",
    eventsUrl: "https://lokal30.pl/wystawy-aktualna/",
    area: "Srodmiescie",
    tier: "independent",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "wschod",
    name: "Wschód Gallery",
    mainUrl: "https://galeriawschod.com/",
    eventsUrl: "https://galeriawschod.com/exhibitions/",
    area: "Praga",
    tier: "independent",
    renderProfile: "hybrid",
    expectedMinimumItems: 0
  },
  {
    id: "faf",
    name: "Fundacja Archeologia Fotografii",
    mainUrl: "https://faf.org.pl/",
    eventsUrl: "https://faf.org.pl/category/wystawy/",
    area: "Wola",
    tier: "independent",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "turnus",
    name: "Turnus",
    mainUrl: "https://turnus.fun/",
    eventsUrl: "https://turnus.fun/exhibitions",
    area: "Wola",
    tier: "independent",
    renderProfile: "javascript",
    expectedMinimumItems: 0
  }
];

export const WARSAW_EVAL_FIXTURES: MarketFixture[] = WARSAW_FIXTURE_DATA.map(
  (fixture) => ({ ...fixture, market: WARSAW_MARKET })
);
