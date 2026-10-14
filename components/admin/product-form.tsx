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
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProductAction, generateProductSlug } from '@/lib/catalog/products';
import { uploadProductImageAction, deleteUnattachedProductImageAction } from '@/lib/catalog/storage';
import type { Category } from '@/types/product';

export interface FormVariantItem {
  id: string;
  title: string;
  sku: string;
  price: string;
  discountPrice: string;
  purchaseCost: string;
  stockQuantity: string;
  lowStockThreshold: string;
  attributes: Array<{ key: string; value: string }>;
  imageUrls: string[];
}

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

  // Variations list state (multi-variation support)
  const [variants, setVariants] = useState<FormVariantItem[]>([
    {
      id: 'var-1',
      title: 'Default',
      sku: '',
      price: '4500',
      discountPrice: '',
      purchaseCost: '1800',
      stockQuantity: '10',
      lowStockThreshold: '5',
      attributes: [],
      imageUrls: [],
    },
  ]);

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
      const skuPrefix = val.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
      if (skuPrefix) {
        setVariants((prev) =>
          prev.map((v, idx) => {
            if (idx === 0 && (!v.sku || v.sku.startsWith('SJ-'))) {
              return { ...v, sku: `SJ-${skuPrefix || 'JWL'}-001` };
            }
            return v;
          })
        );
      }
    }
  }

  function handleAddVariant() {
    const skuPrefix = (
      productCode.trim() ||
      name.replace(/[^A-Za-z0-9]/g, '').substring(0, 4) ||
      'JWL'
    ).toUpperCase();
    const nextIdx = variants.length + 1;
    const nextSku = `SJ-${skuPrefix}-${String(nextIdx).padStart(3, '0')}`;
    const basePrice = variants[0]?.price || '4500';
    const baseCost = variants[0]?.purchaseCost || '1800';
    const baseThreshold = variants[0]?.lowStockThreshold || '5';

    setVariants((prev) => [
      ...prev,
      {
        id: `var-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: `Variant ${nextIdx}`,
        sku: nextSku,
        price: basePrice,
        discountPrice: '',
        purchaseCost: baseCost,
        stockQuantity: '0',
        lowStockThreshold: baseThreshold,
        attributes: [],
        imageUrls: [],
      },
    ]);
  }

  function handleDuplicateVariant(index: number) {
    const target = variants[index];
    if (!target) return;
    const skuPrefix = (
      productCode.trim() ||
      name.replace(/[^A-Za-z0-9]/g, '').substring(0, 4) ||
      'JWL'
    ).toUpperCase();
    const nextIdx = variants.length + 1;
    const nextSku = `SJ-${skuPrefix}-${String(nextIdx).padStart(3, '0')}`;

    const duplicate: FormVariantItem = {
      ...target,
      id: `var-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: `${target.title} (Copy)`,
      sku: nextSku,
      attributes: target.attributes.map((a) => ({ ...a })),
      imageUrls: [...target.imageUrls],
    };

    setVariants((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, duplicate);
      return copy;
    });
  }

  function handleRemoveVariant(index: number) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleMoveVariant(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= variants.length) return;
    setVariants((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  }

  function handleUpdateVariant<K extends keyof FormVariantItem>(
    index: number,
    field: K,
    val: FormVariantItem[K]
  ) {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  }

  function handleAddAttribute(variantIndex: number) {
    setVariants((prev) => {
      const copy = [...prev];
      const v = copy[variantIndex];
      copy[variantIndex] = {
        ...v,
        attributes: [...v.attributes, { key: '', value: '' }],
      };
      return copy;
    });
  }

  function handleUpdateAttribute(
    variantIndex: number,
    attrIndex: number,
    field: 'key' | 'value',
    val: string
  ) {
    setVariants((prev) => {
      const copy = [...prev];
      const v = copy[variantIndex];
      const updatedAttrs = [...v.attributes];
      updatedAttrs[attrIndex] = { ...updatedAttrs[attrIndex], [field]: val };
      copy[variantIndex] = { ...v, attributes: updatedAttrs };
      return copy;
    });
  }

  function handleRemoveAttribute(variantIndex: number, attrIndex: number) {
    setVariants((prev) => {
      const copy = [...prev];
      const v = copy[variantIndex];
      copy[variantIndex] = {
        ...v,
        attributes: v.attributes.filter((_, idx) => idx !== attrIndex),
      };
      return copy;
    });
  }

  async function handleVariantImageUpload(variantIndex: number, e: React.ChangeEvent<HTMLInputElement>) {
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
        const uploadedUrl = res.url;
        setVariants((prev) => {
          const copy = [...prev];
          const v = copy[variantIndex];
          copy[variantIndex] = { ...v, imageUrls: [...v.imageUrls, uploadedUrl] };
          return copy;
        });
      } else {
        setErrorMessage(res.error || `Failed to upload image for variation`);
      }
    }

    setUploadingImage(false);
    e.target.value = '';
  }

  function handleRemoveVariantImage(variantIndex: number, imgIndex: number) {
    setVariants((prev) => {
      const copy = [...prev];
      const v = copy[variantIndex];
      copy[variantIndex] = {
        ...v,
        imageUrls: v.imageUrls.filter((_, idx) => idx !== imgIndex),
      };
      return copy;
    });
  }

  function handleToggleGalleryImageForVariant(variantIndex: number, url: string) {
    setVariants((prev) => {
      const copy = [...prev];
      const v = copy[variantIndex];
      const alreadyHas = v.imageUrls.includes(url);
      copy[variantIndex] = {
        ...v,
        imageUrls: alreadyHas ? v.imageUrls.filter((u) => u !== url) : [...v.imageUrls, url],
      };
      return copy;
    });
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

    if (variants.length === 0) {
      setErrorMessage('At least one product variation is required.');
      return;
    }

    // Validate each variation
    const seenSkus = new Set<string>();
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const sku = v.sku.trim().toUpperCase();
      if (!sku) {
        setErrorMessage(`Variation #${i + 1} (${v.title || 'Untitled'}) requires a SKU.`);
        return;
      }
      if (seenSkus.has(sku)) {
        setErrorMessage(`Duplicate SKU "${sku}" found across variations. Each variation must have a unique SKU.`);
        return;
      }
      seenSkus.add(sku);

      const numPrice = Number(v.price);
      if (isNaN(numPrice) || numPrice < 0) {
        setErrorMessage(`Selling price for variation "${sku}" must be a valid non-negative number.`);
        return;
      }

      const numDiscount = v.discountPrice.trim() ? Number(v.discountPrice) : null;
      if (numDiscount != null && (isNaN(numDiscount) || numDiscount < 0 || numDiscount >= numPrice)) {
        setErrorMessage(`Discount price for variation "${sku}" must be less than the regular price.`);
        return;
      }
    }

    startTransition(async () => {
      const primaryVariant = variants[0];
      const result = await createProductAction({
        name: name.trim(),
        slug: slug.trim(),
        productCode: productCode.trim() || primaryVariant.sku.trim(),
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
        variants: variants.map((v) => ({
          title: v.title.trim() || 'Default',
          sku: v.sku.trim().toUpperCase(),
          price: Number(v.price),
          discountPrice: v.discountPrice.trim() ? Number(v.discountPrice) : null,
          purchaseCost: v.purchaseCost.trim() ? Number(v.purchaseCost) : 0,
          stockQuantity: Number(v.stockQuantity) || 0,
          lowStockThreshold: Number(v.lowStockThreshold) || 5,
          attributes: v.attributes.reduce((acc, curr) => {
            if (curr.key.trim()) acc[curr.key.trim()] = curr.value.trim();
            return acc;
          }, {} as Record<string, string>),
          imageUrls: v.imageUrls,
        })),
        initialVariant: {
          title: primaryVariant.title.trim() || 'Default',
          sku: primaryVariant.sku.trim().toUpperCase(),
          price: Number(primaryVariant.price),
          discountPrice: primaryVariant.discountPrice.trim() ? Number(primaryVariant.discountPrice) : null,
          purchaseCost: primaryVariant.purchaseCost.trim() ? Number(primaryVariant.purchaseCost) : 0,
          stockQuantity: Number(primaryVariant.stockQuantity) || 0,
          lowStockThreshold: Number(primaryVariant.lowStockThreshold) || 5,
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

          {/* Card: Product Variations & Pricing */}
          <div className="bg-luxury-card p-6 rounded-md border border-luxury-border space-y-6">
            <div className="border-b border-luxury-border pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-serif text-white flex items-center gap-2">
                  <Layers className="h-4 w-4 text-luxury-gold" />
                  Product Variations & Pricing
                  <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
                    {variants.length} {variants.length === 1 ? 'variation' : 'variations'}
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Configure multiple sizes, materials, or color options with independent SKUs, pricing, initial inventory, and images.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddVariant}
                className="border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold/10 hover:border-luxury-gold shrink-0 self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Variation
              </Button>
            </div>

            {/* List of Variations */}
            <div className="space-y-5">
              {variants.map((v, index) => (
                <div
                  key={v.id}
                  className="bg-neutral-900/60 rounded-md border border-neutral-800 p-4 sm:p-5 space-y-4 hover:border-neutral-700 transition-colors"
                >
                  {/* Variation Header */}
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-luxury-gold bg-luxury-gold/10 px-2 py-0.5 rounded border border-luxury-gold/20">
                        #{index + 1}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {v.title || `Variant ${index + 1}`}
                      </span>
                      {v.sku && (
                        <span className="text-xs font-mono text-neutral-400 hidden sm:inline">
                          ({v.sku})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => handleMoveVariant(index, 'up')}
                        title="Move variation up"
                        className="h-7 w-7 p-0 text-neutral-400 hover:text-white"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === variants.length - 1}
                        onClick={() => handleMoveVariant(index, 'down')}
                        title="Move variation down"
                        className="h-7 w-7 p-0 text-neutral-400 hover:text-white"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDuplicateVariant(index)}
                        title="Duplicate this variation"
                        className="h-7 w-7 p-0 text-neutral-400 hover:text-luxury-gold"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={variants.length <= 1}
                        onClick={() => handleRemoveVariant(index)}
                        title="Delete variation"
                        className="h-7 w-7 p-0 text-neutral-400 hover:text-rose-400 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Core variation fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1">
                        Variation Title <span className="text-rose-400">*</span>
                      </label>
                      <Input
                        value={v.title}
                        onChange={(e) => handleUpdateVariant(index, 'title', e.target.value)}
                        placeholder="e.g. Size 7 / Yellow Gold, Standard"
                        required
                        className="bg-luxury-surface border-neutral-700 text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1">
                        Variant SKU <span className="text-rose-400">*</span>
                      </label>
                      <Input
                        value={v.sku}
                        onChange={(e) => handleUpdateVariant(index, 'sku', e.target.value.toUpperCase())}
                        placeholder="e.g. SJ-RNG-001-SZ7"
                        required
                        className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Pricing row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1">
                        Selling Price (LKR) <span className="text-rose-400">*</span>
                      </label>
                      <Input
                        type="number"
                        value={v.price}
                        onChange={(e) => handleUpdateVariant(index, 'price', e.target.value)}
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
                        value={v.discountPrice}
                        onChange={(e) => handleUpdateVariant(index, 'discountPrice', e.target.value)}
                        min={0}
                        step={10}
                        placeholder="Optional promo price"
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
                        value={v.purchaseCost}
                        onChange={(e) => handleUpdateVariant(index, 'purchaseCost', e.target.value)}
                        min={0}
                        step={10}
                        className="bg-luxury-surface border-luxury-gold/40 text-luxury-gold-light font-mono text-sm"
                      />
                      <span className="text-[10px] text-neutral-500 mt-1 block">
                        Confidential wholesale cost.
                      </span>
                    </div>
                  </div>

                  {/* Stock & Threshold */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1">
                        Initial Stock Quantity
                      </label>
                      <Input
                        type="number"
                        value={v.stockQuantity}
                        onChange={(e) => handleUpdateVariant(index, 'stockQuantity', e.target.value)}
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
                        value={v.lowStockThreshold}
                        onChange={(e) => handleUpdateVariant(index, 'lowStockThreshold', e.target.value)}
                        min={0}
                        className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Attributes Section */}
                  <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                        <Tag className="h-3 w-3 text-luxury-gold" />
                        Attributes (e.g. Size, Metal, Color)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddAttribute(index)}
                        className="text-[11px] text-luxury-gold hover:text-luxury-gold-light font-medium"
                      >
                        + Add Attribute
                      </button>
                    </div>

                    {v.attributes.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {v.attributes.map((attr, aIdx) => (
                          <div key={aIdx} className="flex items-center gap-1.5">
                            <Input
                              value={attr.key}
                              onChange={(e) =>
                                handleUpdateAttribute(index, aIdx, 'key', e.target.value)
                              }
                              placeholder="Name (e.g. Size)"
                              className="bg-luxury-surface border-neutral-700 text-white text-xs h-8"
                            />
                            <Input
                              value={attr.value}
                              onChange={(e) =>
                                handleUpdateAttribute(index, aIdx, 'value', e.target.value)
                              }
                              placeholder="Value (e.g. 7, Rose Gold)"
                              className="bg-luxury-surface border-neutral-700 text-white text-xs h-8"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveAttribute(index, aIdx)}
                              className="text-neutral-500 hover:text-rose-400 p-1"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Variant-Specific Images */}
                  <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                        <ImageIcon className="h-3 w-3 text-luxury-gold" />
                        Variation-Specific Images
                      </span>
                      <label className="text-[11px] text-luxury-gold hover:text-luxury-gold-light cursor-pointer font-medium">
                        <span>+ Upload Variant Photo</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleVariantImageUpload(index, e)}
                          className="hidden"
                          disabled={uploadingImage}
                        />
                      </label>
                    </div>

                    {/* Quick selection from uploaded gallery images */}
                    {imageUrls.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] text-neutral-500">Pick from gallery:</span>
                        {imageUrls.map((url, gIdx) => {
                          const isSelected = v.imageUrls.includes(url);
                          return (
                            <button
                              key={gIdx}
                              type="button"
                              onClick={() => handleToggleGalleryImageForVariant(index, url)}
                              className={`relative rounded border overflow-hidden h-7 w-7 shrink-0 transition-all ${
                                isSelected
                                  ? 'border-luxury-gold ring-1 ring-luxury-gold'
                                  : 'border-neutral-700 opacity-60 hover:opacity-100'
                              }`}
                              title={isSelected ? 'Remove from this variant' : 'Attach to this variant'}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Gallery ${gIdx}`} className="h-full w-full object-cover" />
                              {isSelected && (
                                <div className="absolute inset-0 bg-luxury-gold/30 flex items-center justify-center">
                                  <CheckCircle2 className="h-3 w-3 text-luxury-black font-bold" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Variant images list */}
                    {v.imageUrls.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        {v.imageUrls.map((url, imgIdx) => (
                          <div
                            key={imgIdx}
                            className="relative group rounded border border-neutral-700 bg-neutral-900 overflow-hidden h-14 w-14"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Variant" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveVariantImage(index, imgIdx)}
                              className="absolute top-0.5 right-0.5 bg-black/80 text-white hover:text-rose-400 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Add Variation Button */}
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddVariant}
                className="w-full border-dashed border-neutral-700 text-neutral-300 hover:text-white hover:border-luxury-gold/60"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Another Variation
              </Button>
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
