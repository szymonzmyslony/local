/**
 * WhatsApp Message Formatters
 *
 * Formats gallery and event data as WhatsApp text messages.
 * Uses WhatsApp formatting: *bold*, _italic_, ~strikethrough~
 *
 * Reference: https://faq.whatsapp.com/539178204879377
 */

import type { GallerySearchResult } from '../services/gallery-search';

/**
 * Format gallery data as a WhatsApp message
 *
 * Formats multiple galleries into a single message with proper WhatsApp formatting.
 * Example output:
 *
 * 🎨 *Gallery Name*
 * 📍 Śródmieście • ul. Example 12
 * ℹ️ About text describing the gallery...
 * 🔗 website.com
 * 📸 @instagram
 * ---
 * 🎨 *Another Gallery*
 * ...
 */
export function formatGalleryCards(galleries: GallerySearchResult[]): string {
  if (galleries.length === 0) {
    return 'No galleries found matching your criteria.';
  }

  const formattedGalleries = galleries.map((gallery, index) => {
    const lines: string[] = [];

    // Title with emoji
    lines.push(`🎨 *${gallery.name || 'Unnamed Gallery'}*`);

    // Location (district + address)
    if (gallery.district || gallery.address) {
      const locationParts: string[] = [];
      if (gallery.district) locationParts.push(gallery.district);
      if (gallery.address) locationParts.push(gallery.address);
      lines.push(`📍 ${locationParts.join(' • ')}`);
    }

    // About (truncate if too long for WhatsApp)
    if (gallery.about) {
      const maxLength = 300;
      const about = gallery.about.length > maxLength
        ? `${gallery.about.substring(0, maxLength)}...`
        : gallery.about;
      lines.push(`\nℹ️ ${about}`);
    }

    // Tags
    if (gallery.tags && gallery.tags.length > 0) {
      lines.push(`\n🏷️ ${gallery.tags.join(', ')}`);
    }

    // Links
    if (gallery.main_url) {
      // Clean URL for display (remove https://)
      const displayUrl = gallery.main_url.replace(/^https?:\/\//, '');
      lines.push(`🔗 ${displayUrl}`);
    }

    if (gallery.instagram) {
      // Format Instagram handle
      const handle = gallery.instagram.replace(/^@/, '');
      lines.push(`📸 @${handle}`);
    }

    // Add separator between galleries (except for the last one)
    if (index < galleries.length - 1) {
      lines.push('---');
    }

    return lines.join('\n');
  });

  // Add header
  const header = galleries.length === 1
    ? 'Here\'s a gallery recommendation for you:'
    : `Here are ${galleries.length} gallery recommendations for you:`;

  return `${header}\n\n${formattedGalleries.join('\n\n')}`;
}

/**
 * Format event data as a WhatsApp message
 *
 * TODO: Implement when event cards need to be sent via WhatsApp
 */
export function formatEventCards(events: unknown[]): string {
  // Placeholder for future implementation
  return `Found ${events.length} events. (Event formatting not yet implemented)`;
}
