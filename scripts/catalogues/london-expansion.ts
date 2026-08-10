/**
 * Verified against the 2026 London Gallery Weekend directory and each
 * gallery's live official homepage on 2026-08-10. Homepage-only registration
 * intentionally delegates listing discovery to the gallery's own observer.
 */
export const LONDON_EXPANSION = [
  ["David Zwirner", "https://www.davidzwirner.com/", "Mayfair"],
  ["Gagosian", "https://gagosian.com/", "Mayfair"],
  ["Hauser & Wirth", "https://www.hauserwirth.com/", "Mayfair"],
  ["White Cube", "https://www.whitecube.com/", "St James's"],
  ["Lisson Gallery", "https://www.lissongallery.com/", "Marylebone"],
  ["Victoria Miro", "https://www.victoria-miro.com/", "Islington"],
  ["Pace Gallery", "https://www.pacegallery.com/", "Mayfair"],
  ["Thaddaeus Ropac", "https://ropac.net/", "Mayfair"],
  ["Sprüth Magers", "https://spruethmagers.com/", "Mayfair"],
  ["Pilar Corrias", "https://www.pilarcorrias.com/", "Mayfair"],
  ["Sadie Coles HQ", "https://www.sadiecoles.com/", "Mayfair"],
  ["Maureen Paley", "https://www.maureenpaley.com/", "Bethnal Green"],
  ["Modern Art", "https://www.modernart.net/", "Clerkenwell"],
  ["Herald St", "https://www.heraldst.com/", "Bethnal Green"],
  ["Hollybush Gardens", "https://hollybushgardens.co.uk/", "Clerkenwell"],
  ["The Approach", "https://www.theapproach.co.uk/", "Bethnal Green"],
  ["Kate MacGarry", "https://www.katemacgarry.com/", "Bethnal Green"],
  ["Union Pacific", "https://www.unionpacific.co.uk/", "Bloomsbury"],
  ["Emalin", "https://emalin.co.uk/", "Clerkenwell"],
  ["Soft Opening", "https://softopening.london/", "Bethnal Green"],
  ["Public Gallery", "https://public.gallery/", "Bethnal Green"],
  ["Seventeen", "https://www.seventeengallery.com/", "Bethnal Green"],
  ["Hales Gallery", "https://halesgallery.com/", "Shoreditch"],
  ["Goodman Gallery", "https://goodman-gallery.com/", "Mayfair"],
  ["Pippy Houldsworth Gallery", "https://www.houldsworth.co.uk/", "Mayfair"],
  ["Timothy Taylor", "https://www.timothytaylor.com/", "Mayfair"],
  ["Thomas Dane Gallery", "https://www.thomasdanegallery.com/", "St James's"],
  ["Richard Saltoun Gallery", "https://www.richardsaltoun.com/", "Mayfair"],
  ["Flowers Gallery", "https://www.flowersgallery.com/", "Mayfair"],
  ["Frith Street Gallery", "https://www.frithstreetgallery.com/", "Soho"],
  ["Copperfield", "https://www.copperfieldgallery.com/", "Southwark"],
  ["Hannah Barry Gallery", "https://hannahbarry.com/", "Peckham"],
  ["The Sunday Painter", "https://thesundaypainter.co.uk/", "Vauxhall"],
  ["Sim Smith", "https://www.sim-smith.com/", "Camberwell"],
  ["Sid Motion Gallery", "https://sidmotiongallery.co.uk/", "South London"],
  ["Drawing Room", "https://drawingroom.org.uk/", "Bermondsey"],
  ["Raven Row", "https://ravenrow.org/", "Spitalfields"],
  ["Delfina Foundation", "https://www.delfinafoundation.com/", "Victoria"],
  ["The Showroom", "https://theshowroom.org/", "Lisson Grove"],
  ["Cubitt", "https://www.cubittartists.org.uk/", "Islington"],
  ["Matt's Gallery", "https://www.mattsgallery.org/", "Bermondsey"],
  ["Project Native Informant", "https://www.projectnativeinformant.com/", "Bloomsbury"],
  ["Arcadia Missa", "https://arcadiamissa.com/", "Bermondsey"],
  ["Carlos/Ishikawa", "https://www.carlosishikawa.com/", "Whitechapel"]
] as const satisfies ReadonlyArray<
  readonly [name: string, mainUrl: `https://${string}`, area: string]
>;
