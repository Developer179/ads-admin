// Helpers to extract the *visible creative* from an ad regardless of where it lives:
// plain imageURL, super-menu tiles, or CUSTOM_WIDGET customWidgetData (titleImage + imageUrls[]).

import { AdsDTO } from './types';

export interface WidgetImages {
  titleImage?: string;
  images: { image?: string; url?: string; clickAction?: string }[];
}

/** Parse a CUSTOM_WIDGET's customWidgetData into its renderable images. Null when not an image widget. */
export function parseWidgetImages(customWidgetData?: string | null): WidgetImages | null {
  if (!customWidgetData) return null;
  try {
    const parsed = JSON.parse(customWidgetData);
    if (Array.isArray(parsed?.tiles)) return null; // tile menus are handled by TileGrid
    const images = Array.isArray(parsed?.imageUrls) ? parsed.imageUrls : [];
    const titleImage = typeof parsed?.titleImage === 'string' && parsed.titleImage ? parsed.titleImage : undefined;
    if (!titleImage && images.length === 0) return null;
    return { titleImage, images };
  } catch {
    return null;
  }
}

/** Best single thumbnail for an ad, wherever its creative lives. */
export function adThumbnail(ad: AdsDTO): string | undefined {
  if (ad.imageURL) return ad.imageURL;
  const w = parseWidgetImages(ad.customWidgetData);
  return w?.titleImage ?? w?.images?.[0]?.image;
}
