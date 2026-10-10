'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Layers,
  DollarSign,
  Lock,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProductAction, generateProductSlug } from '@/lib/catalog/products';
import { uploadProductImageAction, deleteUnattachedProductImageAction } from '@/lib/catalog/storage';
import type { Category } from '@/types/product';

interface ProductFormProps {
  categories: Category[];
}

export function ProductForm({ categories }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // General fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [productCode, setProductCode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [material, setMaterial] = useState('18K Gold Plated');
  const [gender, setGender] = useState<'women' | 'men' | 'unisex'>('women');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');

  // Primary variant
  const [variantTitle, setVariantTitle] = useState('Default');
  const [variantSku, setVariantSku] = useState('');
  const [price, setPrice] = useState<string>('4500');
  const [discountPrice, setDiscountPrice] = useState<string>('');
  const [purchaseCost, setPurchaseCost] = useState<string>('1800');
  const [stockQuantity, setStockQuantity] = useState<string>('10');
  const [lowStockThreshold, setLowStockThreshold] = useState<string>('5');

  // Merchandising flags
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNewArrival, setIsNewArrival] = useState(true);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // SEO fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  // Images state
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Feedback alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleNameChange(val: string) {
    setName(val);
    if (!slugManual) {
      const generated = await generateProductSlug(val);
      setSlug(generated);
      if (!variantSku && val) {
        // Auto-suggest initial SKU
        const skuPrefix = val.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
        setVariantSku(`SJ-${skuPrefix || 'JWL'}-001`);
      }
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    setErrorMessage(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      const res = await uploadProductImageAction(formData);
      if (res.success && res.url) {
        setImageUrls((prev) => [...prev, res.url!]);
      } else {
        setErrorMessage(res.error || `Failed to upload ${file.name}`);
      }
    }

    setUploadingImage(false);
    e.target.value = '';
  }

  function handleRemoveImage(index: number) {
    const urlToRemove = imageUrls[index];
    setImageUrls((prev) => prev.filter((_, idx) => idx !== index));
    if (urlToRemove) {
      deleteUnattachedProductImageAction(urlToRemove).catch(() => {});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // Basic validation
    if (!name.trim()) {
      setErrorMessage('Product title is required.');
      return;
    }

    if (!variantSku.trim()) {
      setErrorMessage('A variant SKU is required.');
      return;
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setErrorMessage('Selling price must be a valid non-negative number.');
      return;
    }

    const numDiscount = discountPrice.trim() ? Number(discountPrice) : null;
    if (numDiscount != null && (isNaN(numDiscount) || numDiscount < 0 || numDiscount >= numPrice)) {
      setErrorMessage('Discount price must be less than the regular price.');
      return;
    }

    const numCost = purchaseCost.trim() ? Number(purchaseCost) : 0;
    const numStock = Number(stockQuantity) || 0;
    const numLowStock = Number(lowStockThreshold) || 5;

    startTransition(async () => {
      const result = await createProductAction({
        name: name.trim(),
        slug: slug.trim(),
        productCode: productCode.trim() || variantSku.trim(),
        shortDescription: shortDescription.trim() || null,
        description: description.trim() || null,
        material: material.trim() || null,
        gender,
        categoryId: categoryId || null,
        isFeatured,
        isNewArrival,
        isBestSeller,
        isActive,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        initialVariant: {
          title: variantTitle.trim() || 'Default',
          sku: variantSku.trim().toUpperCase(),
          price: numPrice,
          discountPrice: numDiscount,
          purchaseCost: numCost,
          stockQuantity: numStock,
          lowStockThreshold: numLowStock,
        },
        imageUrls,
      });

      if (!result.success || !result.productId) {
        setErrorMessage(result.error || 'Failed to create product.');
        return;
      }

      router.push(`/admin/products/${result.productId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl mx-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 border-b border-luxury-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/products">
            <Button variant="ghost" size="sm" type="button" className="text-neutral-400 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Catalog
            </Button>
          </Link>
          <h1 className="text-2xl font-serif text-white">Create Jewelry Product</h1>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/admin/products">
            <Button variant="outline" type="button" disabled={isPending}>
              Cancel
            </Button>
          </Link>
          <Button variant="gold" type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & Publish
          </Button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 p-4 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 Cols): Core Product Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Basic Info */}
          <div className="bg-luxury-card p-6 rounded-md border border-luxury-border space-y-4">
            <h3 className="text-lg font-serif text-white border-b border-luxury-border pb-2 flex items-center gap-2">
              <Package className="h-4 w-4 text-luxury-gold" />
              Product Identification
            </h3>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Product Title <span className="text-rose-400">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Royal Crown 18K Gold Solitaire Ring"
                required
                className="bg-luxury-surface border-neutral-700 text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  URL Slug <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="royal-crown-18k-gold-solitaire-ring"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">/products/{slug || '...'}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Product Code / Base SKU
                </label>
                <Input
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="e.g. SJ-RNG-001"
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
                >
                  <option value="">Select Category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Material
                </label>
                <Input
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  placeholder="e.g. 18K Gold Plated, Stainless Steel"
                  className="bg-luxury-surface border-neutral-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Gender Collection
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
                >
                  <option value="women">Women</option>
                  <option value="men">Men</option>
                  <option value="unisex">Unisex</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Short Description
              </label>
              <Input
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="A concise, enticing highlight shown in catalog cards..."
                className="bg-luxury-surface border-neutral-700 text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Detailed Product Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Full jewelry specifications, craftsmanship details, care instructions, and stone attributes..."
                rows={5}
                className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm p-3 focus:outline-none focus:border-luxury-gold/70"
              />
            </div>
          </div>

          {/* Card: Primary Variant & Pricing */}
          <div className="bg-luxury-card p-6 rounded-md border border-luxury-border space-y-4">
            <h3 className="text-lg font-serif text-white border-b border-luxury-border pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-luxury-gold" />
                Primary Variant & Pricing
              </span>
              <span className="text-xs text-neutral-400 font-sans">
                You can add more variants after creating the product.
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Variant Title <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={variantTitle}
                  onChange={(e) => setVariantTitle(e.target.value)}
                  placeholder="e.g. Standard, Gold / Size 7"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Variant SKU <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={variantSku}
                  onChange={(e) => setVariantSku(e.target.value)}
                  placeholder="e.g. SJ-RNG-001-GLD"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Selling Price (LKR) <span className="text-rose-400">*</span>
                </label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min={0}
                  step={10}
                  required
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Discount Price (LKR)
                </label>
                <Input
                  type="number"
                  value={discountPrice}
                  onChange={(e) => setDiscountPrice(e.target.value)}
                  min={0}
                  step={10}
                  placeholder="Optional promotional price"
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
              </div>

              {/* Purchase Cost (Confidential) */}
              <div>
                <label className="block text-xs font-medium text-luxury-gold-light mb-1 flex items-center gap-1">
                  <Lock className="h-3 w-3 text-luxury-gold" />
                  Purchase Cost (LKR)
                </label>
                <Input
                  type="number"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  min={0}
                  step={10}
                  className="bg-luxury-surface border-luxury-gold/40 text-luxury-gold-light font-mono text-sm"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Confidential back-office wholesale cost. Never exposed to customers.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Initial Stock Quantity
                </label>
                <Input
                  type="number"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  min={0}
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Low Stock Alert Threshold
                </label>
                <Input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  min={0}
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Card: Images Uploader */}
          <div className="bg-luxury-card p-6 rounded-md border border-luxury-border space-y-4">
            <h3 className="text-lg font-serif text-white border-b border-luxury-border pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-luxury-gold" />
                Product Imagery
              </span>
              <span className="text-xs text-neutral-400 font-sans">
                Max 5MB per image (JPEG, PNG, WebP)
              </span>
            </h3>

            {/* Upload Zone */}
            <div className="border-2 border-dashed border-neutral-700 hover:border-luxury-gold/50 rounded-md p-6 text-center transition-colors">
              <input
                type="file"
                id="product-images-input"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="hidden"
              />
              <label
                htmlFor="product-images-input"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2"
              >
                {uploadingImage ? (
                  <Loader2 className="h-8 w-8 text-luxury-gold animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 text-neutral-400 hover:text-luxury-gold transition-colors" />
                )}
                <div className="text-sm text-neutral-200">
                  {uploadingImage ? 'Uploading image to secure storage...' : 'Click to upload images from your device'}
                </div>
                <div className="text-xs text-neutral-500">
                  First image uploaded will act as the primary cover photo
                </div>
              </label>
            </div>

            {/* Image Preview Grid */}
            {imageUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {imageUrls.map((url, index) => (
                  <div
                    key={url}
                    className="relative group rounded border border-neutral-700 bg-neutral-900 overflow-hidden aspect-square"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                    {index === 0 && (
                      <span className="absolute top-1 left-1 bg-luxury-gold text-luxury-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 bg-black/80 text-white hover:text-rose-400 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Merchandising & SEO */}
        <div className="space-y-6">
          {/* Publishing & Visibility */}
          <div className="bg-luxury-card p-5 rounded-md border border-luxury-border space-y-4">
            <h3 className="text-md font-serif text-white border-b border-luxury-border pb-2">
              Visibility & Publishing
            </h3>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                />
                <div>
                  <div className="text-sm text-white font-medium">Published / Active</div>
                  <div className="text-[11px] text-neutral-400">Instantly visible in customer catalog</div>
                </div>
              </label>
            </div>
          </div>

          {/* Merchandising Badges */}
          <div className="bg-luxury-card p-5 rounded-md border border-luxury-border space-y-4">
            <h3 className="text-md font-serif text-white border-b border-luxury-border pb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-luxury-gold" />
              Store Merchandising
            </h3>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                />
                <div>
                  <div className="text-sm text-white">Featured Collection</div>
                  <div className="text-[11px] text-neutral-400">Highlighted on store homepage & top filters</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNewArrival}
                  onChange={(e) => setIsNewArrival(e.target.checked)}
                  className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                />
                <div>
                  <div className="text-sm text-white">New Arrival</div>
                  <div className="text-[11px] text-neutral-400">Renders golden 'New' badge on product card</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBestSeller}
                  onChange={(e) => setIsBestSeller(e.target.checked)}
                  className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                />
                <div>
                  <div className="text-sm text-white">Best Seller</div>
                  <div className="text-[11px] text-neutral-400">Flagged as a top trending fine jewelry piece</div>
                </div>
              </label>
            </div>
          </div>

          {/* SEO Metadata */}
          <div className="bg-luxury-card p-5 rounded-md border border-luxury-border space-y-4">
            <h3 className="text-md font-serif text-white border-b border-luxury-border pb-2">
              Search Engine Optimization
            </h3>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Meta Title
              </label>
              <Input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Defaults to product title"
                className="bg-luxury-surface border-neutral-700 text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Meta Description
              </label>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Google search summary snippet..."
                rows={3}
                className="w-full bg-luxury-surface border border-neutral-700 text-white text-xs rounded-sm p-2.5 focus:outline-none focus:border-luxury-gold/70"
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
