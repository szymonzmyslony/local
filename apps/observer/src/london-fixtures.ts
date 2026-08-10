import type { MarketConfig } from "@gallery-agents/shared";

export type MarketFixture = {
  id: string;
  name: string;
  mainUrl: string;
  eventsUrl: string;
  area: string;
  tier: "national" | "institution" | "independent";
  renderProfile: "static" | "hybrid" | "javascript";
  expectedMinimumItems: number;
  market: MarketConfig;
};

/**
 * Deliberately stratified London pilot: large institutions, mid-sized venues,
 * and independents with static, hybrid, and client-rendered listings.
 */
const LONDON_FIXTURE_DATA: Array<Omit<MarketFixture, "market">> = [
  {
    id: "tate-modern",
    name: "Tate Modern",
    mainUrl: "https://www.tate.org.uk/visit/tate-modern",
    eventsUrl: "https://www.tate.org.uk/whats-on?date_range=from_now&venue=497",
    area: "Bankside",
    tier: "national",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "national-gallery",
    name: "The National Gallery",
    mainUrl: "https://www.nationalgallery.org.uk/",
    eventsUrl: "https://www.nationalgallery.org.uk/whats-on?forceListing=true",
    area: "Trafalgar Square",
    tier: "national",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "national-portrait-gallery",
    name: "National Portrait Gallery",
    mainUrl: "https://www.npg.org.uk/",
    eventsUrl: "https://www.npg.org.uk/whatson/exhibitions",
    area: "St Martin's Place",
    tier: "national",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "vam",
    name: "V&A",
    mainUrl: "https://www.vam.ac.uk/",
    eventsUrl: "https://www.vam.ac.uk/whatson",
    area: "South Kensington",
    tier: "national",
    renderProfile: "javascript",
    expectedMinimumItems: 1
  },
  {
    id: "royal-academy",
    name: "Royal Academy of Arts",
    mainUrl: "https://www.royalacademy.org.uk/",
    eventsUrl: "https://www.royalacademy.org.uk/exhibitions-and-events",
    area: "Mayfair",
    tier: "national",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "whitechapel",
    name: "Whitechapel Gallery",
    mainUrl: "https://www.whitechapelgallery.org/",
    eventsUrl: "https://www.whitechapelgallery.org/exhibitions/",
    area: "Whitechapel",
    tier: "institution",
    renderProfile: "static",
    expectedMinimumItems: 1
  },
  {
    id: "serpentine",
    name: "Serpentine",
    mainUrl: "https://www.serpentinegalleries.org/",
    eventsUrl: "https://www.serpentinegalleries.org/whats-on/",
    area: "Kensington Gardens",
    tier: "institution",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "ica",
    name: "Institute of Contemporary Arts",
    mainUrl: "https://www.ica.art/",
    eventsUrl: "https://www.ica.art/",
    area: "The Mall",
    tier: "institution",
    renderProfile: "javascript",
    expectedMinimumItems: 1
  },
  {
    id: "hayward",
    name: "Hayward Gallery",
    mainUrl: "https://www.southbankcentre.co.uk/venues/hayward-gallery/",
    eventsUrl: "https://www.southbankcentre.co.uk/whats-on/?venue=hayward-gallery",
    area: "South Bank",
    tier: "institution",
    renderProfile: "javascript",
    expectedMinimumItems: 1
  },
  {
    id: "barbican-art-gallery",
    name: "Barbican Art Gallery",
    mainUrl: "https://www.barbican.org.uk/our-story/our-building",
    eventsUrl: "https://www.barbican.org.uk/whats-on/art-design",
    area: "Barbican",
    tier: "institution",
    renderProfile: "javascript",
    expectedMinimumItems: 1
  },
  {
    id: "south-london-gallery",
    name: "South London Gallery",
    mainUrl: "https://www.southlondongallery.org/",
    eventsUrl: "https://www.southlondongallery.org/whats-on/exhibitions/",
    area: "Peckham",
    tier: "institution",
    renderProfile: "static",
    expectedMinimumItems: 1
  },
  {
    id: "camden-art-centre",
    name: "Camden Art Centre",
    mainUrl: "https://camdenartcentre.org/",
    eventsUrl: "https://camdenartcentre.org/whats-on/",
    area: "Hampstead",
    tier: "institution",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "photographers-gallery",
    name: "The Photographers' Gallery",
    mainUrl: "https://thephotographersgallery.org.uk/",
    eventsUrl: "https://thephotographersgallery.org.uk/whats-on",
    area: "Soho",
    tier: "institution",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "studio-voltaire",
    name: "Studio Voltaire",
    mainUrl: "https://studiovoltaire.org/",
    eventsUrl: "https://studiovoltaire.org/whats-on/",
    area: "Clapham",
    tier: "independent",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "gasworks",
    name: "Gasworks",
    mainUrl: "https://www.gasworks.org.uk/",
    eventsUrl: "https://www.gasworks.org.uk/exhibitions/",
    area: "Vauxhall",
    tier: "independent",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "goldsmiths-cca",
    name: "Goldsmiths CCA",
    mainUrl: "https://goldsmithscca.art/",
    eventsUrl: "https://goldsmithscca.art/whats-on/",
    area: "New Cross",
    tier: "independent",
    renderProfile: "hybrid",
    expectedMinimumItems: 0
  },
  {
    id: "chisenhale",
    name: "Chisenhale Gallery",
    mainUrl: "https://chisenhale.org.uk/",
    eventsUrl: "https://chisenhale.org.uk/whats-on/",
    area: "Bow",
    tier: "independent",
    renderProfile: "static",
    expectedMinimumItems: 0
  },
  {
    id: "auto-italia",
    name: "Auto Italia",
    mainUrl: "https://autoitaliasoutheast.org/",
    eventsUrl: "https://autoitaliasoutheast.org/",
    area: "Bethnal Green",
    tier: "independent",
    renderProfile: "hybrid",
    expectedMinimumItems: 0
  },
  {
    id: "somerset-house",
    name: "Somerset House",
    mainUrl: "https://www.somersethouse.org.uk/",
    eventsUrl: "https://www.somersethouse.org.uk/whats-on",
    area: "Strand",
    tier: "institution",
    renderProfile: "hybrid",
    expectedMinimumItems: 1
  },
  {
    id: "saatchi-gallery",
    name: "Saatchi Gallery",
    mainUrl: "https://www.saatchigallery.com/",
    eventsUrl: "https://www.saatchigallery.com/whats-on/",
    area: "Chelsea",
    tier: "institution",
    renderProfile: "javascript",
    expectedMinimumItems: 1
  }
];

const LONDON_MARKET = {
  market: "ldn",
  city: "London",
  countryCode: "GB",
  timezone: "Europe/London",
  locale: "en-GB",
  language: "English"
} as const satisfies MarketConfig;

export const LONDON_EVAL_FIXTURES: MarketFixture[] = LONDON_FIXTURE_DATA.map(
  (fixture) => ({ ...fixture, market: LONDON_MARKET })
);
