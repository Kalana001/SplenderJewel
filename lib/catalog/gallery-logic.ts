import type { ProductImage } from '@/types/product';

/**
 * Pure image filtering logic for customer product gallery variations.
 * Rules:
 * 1. Prioritizes variant-specific images, followed by general product-level images (variantId is null/undefined).
 * 2. Strictly excludes images belonging to other distinct variations.
 * 3. If a variation has no specific images, falls back to general product-level images.
 * 4. If a product has only variation-specific images and this variation has none, falls back to the primary image.
 */
export function filterGalleryImages(
  images: ProductImage[],
  selectedVariantId?: string | null
): ProductImage[] {
  if (!images || images.length === 0) return [];
  if (!selectedVariantId) return images;

  const variantSpecific = images.filter((img) => img.variantId === selectedVariantId);
  const generalImages = images.filter((img) => !img.variantId);

  // 1. Variant has dedicated image(s): prioritize them, followed by general images
  if (variantSpecific.length > 0) {
    return [...variantSpecific, ...generalImages];
  }

  // 2. Variant has no dedicated image: fall back to general images
  if (generalImages.length > 0) {
    return generalImages;
  }

  // 3. Product has ONLY variant-specific images and this variant has none:
  // fall back sensibly to primary image or first available image
  const primary = images.find((img) => img.isPrimary) || images[0];
  return primary ? [primary] : [];
}

/**
 * Calculates safe index within array bounds with wrapping.
 */
export function calculateSafeIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * Advances to next index with wrapping.
 */
export function calculateNextIndex(current: number, count: number): number {
  if (count <= 1) return 0;
  return (current + 1) % count;
}

/**
 * Regresses to previous index with wrapping.
 */
export function calculatePrevIndex(current: number, count: number): number {
  if (count <= 1) return 0;
  return (current - 1 + count) % count;
}

/**
 * Determines target index when switching variants.
 * Looks for variant's dedicated image; falls back to primary image or index 0.
 */
export function getVariantTargetIndex(
  filteredImages: ProductImage[],
  selectedVariantId?: string | null
): number {
  if (filteredImages.length === 0) return 0;

  if (selectedVariantId) {
    const variantIdx = filteredImages.findIndex((img) => img.variantId === selectedVariantId);
    if (variantIdx !== -1) {
      return variantIdx;
    }
  }

  const primaryIdx = filteredImages.findIndex((img) => img.isPrimary);
  return primaryIdx !== -1 ? primaryIdx : 0;
}

/**
 * Evaluates touch gesture delta to distinguish intentional horizontal swipe from vertical page scroll.
 * Threshold: |deltaX| >= 40px and dominant horizontal movement |deltaX| > |deltaY| * 1.1.
 */
export function evaluateTouchGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): 'next' | 'prev' | 'none' {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const minSwipeDistance = 40;

  if (Math.abs(deltaX) >= minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
    return deltaX < 0 ? 'next' : 'prev';
  }
  return 'none';
}

/**
 * Simulates gallery state machine with exact lifecycle semantics as the React component:
 * - Ordinary navigation (next/prev/select) moves activeIndex without resetting.
 * - Variant changes update filteredImages and target the variant's image.
 * - Parent sync callback only fires when activeImage actually changes.
 */
export class GallerySession {
  private images: ProductImage[];
  private selectedVariantId: string | null;
  private activeIndex: number;
  private lastReportedImage: ProductImage | null = null;
  public notifyCount = 0;

  constructor(images: ProductImage[], initialVariantId: string | null = null) {
    this.images = images;
    this.selectedVariantId = initialVariantId;
    const filtered = this.getFilteredImages();
    this.activeIndex = getVariantTargetIndex(filtered, initialVariantId);
    this.syncParent();
  }

  public getFilteredImages(): ProductImage[] {
    return filterGalleryImages(this.images, this.selectedVariantId);
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  public getActiveImage(): ProductImage | null {
    const filtered = this.getFilteredImages();
    return filtered[this.activeIndex] || null;
  }

  public next(): void {
    const filtered = this.getFilteredImages();
    if (filtered.length <= 1) return;
    this.activeIndex = calculateNextIndex(this.activeIndex, filtered.length);
    this.syncParent();
  }

  public prev(): void {
    const filtered = this.getFilteredImages();
    if (filtered.length <= 1) return;
    this.activeIndex = calculatePrevIndex(this.activeIndex, filtered.length);
    this.syncParent();
  }

  public selectIndex(idx: number): void {
    const filtered = this.getFilteredImages();
    this.activeIndex = calculateSafeIndex(idx, filtered.length);
    this.syncParent();
  }

  public switchVariant(newVariantId: string | null): void {
    if (this.selectedVariantId === newVariantId) return;
    this.selectedVariantId = newVariantId;
    const filtered = this.getFilteredImages();
    this.activeIndex = getVariantTargetIndex(filtered, newVariantId);
    this.syncParent();
  }

  // Simulates parent re-render (which should NOT reset activeIndex)
  public parentRerender(): void {
    const filtered = this.getFilteredImages();
    if (this.activeIndex >= filtered.length) {
      this.activeIndex = Math.max(0, filtered.length - 1);
    }
    this.syncParent();
  }

  private syncParent(): void {
    const current = this.getActiveImage();
    if (
      !this.lastReportedImage ||
      this.lastReportedImage.id !== current?.id ||
      this.lastReportedImage.url !== current?.url
    ) {
      this.lastReportedImage = current;
      this.notifyCount++;
    }
  }
}
