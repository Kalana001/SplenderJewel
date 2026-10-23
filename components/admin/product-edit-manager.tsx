'use client';

import React, { useState, useTransition, useRef } from 'react';
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
  Plus,
  Edit2,
  Trash2,
  Star,
  ExternalLink,
  Shield,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/config/store';
import {
  updateProductAction,
  toggleProductActiveAction,
} from '@/lib/catalog/products';
import {
  createVariantAction,
  updateVariantAction,
  deleteVariantAction,
  adjustVariantStockAction,
} from '@/lib/catalog/variants';
import {
  attachProductImageAction,
  setPrimaryProductImageAction,
  deleteProductImageAction,
  updateProductImageVariantAction,
  deleteUnattachedProductImageAction,
} from '@/lib/catalog/storage';
import { uploadProductImageFile } from '@/lib/catalog/upload-client';
import type { ProductAdmin, Category, ProductVariantAdmin, ProductImage } from '@/types/product';

interface ProductEditManagerProps {
  initialProduct: ProductAdmin;
  categories: Category[];
}

export function ProductEditManager({ initialProduct, categories }: ProductEditManagerProps) {
  const [product, setProduct] = useState<ProductAdmin>(initialProduct);
  const [activeTab, setActiveTab] = useState<'details' | 'variants' | 'images' | 'inventory'>('details');
  const [isPending, startTransition] = useTransition();

  // Alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tab 1: Product details state
  const [detailsForm, setDetailsForm] = useState({
    name: product.name,
    slug: product.slug,
    productCode: product.productCode || '',
    categoryId: product.categoryId || '',
    material: product.material || '',
    gender: product.gender,
    shortDescription: product.shortDescription || '',
    description: product.description || '',
    isFeatured: product.isFeatured,
    isNewArrival: product.isNewArrival,
    isBestSeller: product.isBestSeller,
    isActive: product.isActive,
    metaTitle: product.metaTitle || '',
    metaDescription: product.metaDescription || '',
  });

  // Tab 2: Variant modal state
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({
    title: '',
    sku: '',
    price: '',
    discountPrice: '',
    purchaseCost: '',
    stockQuantity: '0',
    lowStockThreshold: '5',
    isActive: true,
  });

  // Tab 3: Uploading images state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadTargetVariantId, setUploadTargetVariantId] = useState<string>('');
  const [updatingImageId, setUpdatingImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 4: Stock adjustment modal
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockVariant, setStockVariant] = useState<ProductVariantAdmin | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState<number>(0);
  const [stockReason, setStockReason] = useState<'stock_added' | 'manual_adjustment' | 'correction'>('stock_added');
  const [stockNotes, setStockNotes] = useState('');

  // ── Handler: Update Product Details ──────────────────────────────────────
  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await updateProductAction(product.id, {
        name: detailsForm.name.trim(),
        slug: detailsForm.slug.trim(),
        productCode: detailsForm.productCode.trim() || null,
        categoryId: detailsForm.categoryId || null,
        material: detailsForm.material.trim() || null,
        gender: detailsForm.gender,
        shortDescription: detailsForm.shortDescription.trim() || null,
        description: detailsForm.description.trim() || null,
        isFeatured: detailsForm.isFeatured,
        isNewArrival: detailsForm.isNewArrival,
        isBestSeller: detailsForm.isBestSeller,
        isActive: detailsForm.isActive,
        metaTitle: detailsForm.metaTitle.trim() || null,
        metaDescription: detailsForm.metaDescription.trim() || null,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update product details.');
        return;
      }

      setProduct((prev) => ({
        ...prev,
        ...detailsForm,
        category: categories.find((c) => c.id === detailsForm.categoryId) || null,
      }));
      setSuccessMessage('Product details updated successfully.');
    });
  }

  // ── Handler: Variant Create / Edit ───────────────────────────────────────
  function handleOpenCreateVariant() {
    setEditingVariantId(null);
    setVariantForm({
      title: '',
      sku: `${product.productCode || 'SJ'}-${product.variants.length + 1}`,
      price: product.variants[0]?.price?.toString() || '4500',
      discountPrice: '',
      purchaseCost: product.variants[0]?.purchaseCost?.toString() || '0',
      stockQuantity: '0',
      lowStockThreshold: '5',
      isActive: true,
    });
    setVariantModalOpen(true);
    setErrorMessage(null);
  }

  function handleOpenEditVariant(variant: ProductVariantAdmin) {
    setEditingVariantId(variant.id);
    setVariantForm({
      title: variant.title,
      sku: variant.sku,
      price: variant.price.toString(),
      discountPrice: variant.discountPrice != null ? variant.discountPrice.toString() : '',
      purchaseCost: variant.purchaseCost.toString(),
      stockQuantity: variant.stockQuantity.toString(),
      lowStockThreshold: variant.lowStockThreshold.toString(),
      isActive: variant.isActive,
    });
    setVariantModalOpen(true);
    setErrorMessage(null);
  }

  async function handleSaveVariant(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const numPrice = Number(variantForm.price);
    if (isNaN(numPrice) || numPrice < 0) {
      setErrorMessage('Selling price must be a valid non-negative number.');
      return;
    }

    const numDiscount = variantForm.discountPrice.trim() ? Number(variantForm.discountPrice) : null;
    if (numDiscount != null && (isNaN(numDiscount) || numDiscount < 0 || numDiscount >= numPrice)) {
      setErrorMessage('Discount price must be less than regular selling price.');
      return;
    }

    const numCost = Number(variantForm.purchaseCost) || 0;
    const numThreshold = Number(variantForm.lowStockThreshold) || 5;

    startTransition(async () => {
      if (editingVariantId) {
        const res = await updateVariantAction(editingVariantId, {
          title: variantForm.title.trim(),
          sku: variantForm.sku.trim().toUpperCase(),
          price: numPrice,
          discountPrice: numDiscount,
          purchaseCost: numCost,
          lowStockThreshold: numThreshold,
          isActive: variantForm.isActive,
        });

        if (!res.success || !res.variant) {
          setErrorMessage(res.error || 'Failed to update variant.');
          return;
        }

        setProduct((prev) => ({
          ...prev,
          variants: prev.variants.map((v) => (v.id === editingVariantId ? res.variant! : v)),
        }));
        setSuccessMessage(`Variant "${variantForm.title}" updated.`);
        setVariantModalOpen(false);
      } else {
        const numStock = Number(variantForm.stockQuantity) || 0;
        const res = await createVariantAction({
          productId: product.id,
          title: variantForm.title.trim(),
          sku: variantForm.sku.trim().toUpperCase(),
          price: numPrice,
          discountPrice: numDiscount,
          purchaseCost: numCost,
          stockQuantity: numStock,
          lowStockThreshold: numThreshold,
          isActive: variantForm.isActive,
        });

        if (!res.success || !res.variant) {
          setErrorMessage(res.error || 'Failed to create variant.');
          return;
        }

        setProduct((prev) => ({
          ...prev,
          variants: [...prev.variants, res.variant!],
        }));
        setSuccessMessage(`Variant "${variantForm.title}" added successfully.`);
        setVariantModalOpen(false);
      }
    });
  }

  async function handleDeleteVariant(variantId: string) {
    if (!confirm('Are you sure you want to delete this variant?')) return;

    startTransition(async () => {
      const res = await deleteVariantAction(product.id, variantId);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to delete variant.');
        return;
      }

      setProduct((prev) => ({
        ...prev,
        variants: prev.variants.filter((v) => v.id !== variantId),
      }));
      setSuccessMessage('Variant deleted successfully.');
    });
  }

  // ── Handler: Image Upload & Management ───────────────────────────────────
  async function handleUploadImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    setErrorMessage(null);
    let uploadedCount = 0;
    const errors: string[] = [];
    const targetVariantId = uploadTargetVariantId ? uploadTargetVariantId : null;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          const uploadRes = await uploadProductImageFile(file);
          if (uploadRes.success && uploadRes.url) {
            try {
              const attachRes = await attachProductImageAction({
                productId: product.id,
                variantId: targetVariantId,
                url: uploadRes.url,
                altText: product.name,
                isPrimary: product.images.length === 0 && uploadedCount === 0,
              });

              if (attachRes.success && attachRes.image) {
                uploadedCount++;
                setProduct((prev) => ({
                  ...prev,
                  images: [...prev.images, attachRes.image!],
                }));
              } else {
                errors.push(`${file.name}: ${attachRes.error || 'Failed to attach image to product database record.'}`);
                // Best-effort cleanup of newly uploaded, unreferenced file
                await deleteUnattachedProductImageAction(uploadRes.url).catch(() => {});
              }
            } catch (attachErr: unknown) {
              errors.push(`${file.name}: ${attachErr instanceof Error ? attachErr.message : 'Database attachment error.'}`);
              await deleteUnattachedProductImageAction(uploadRes.url).catch(() => {});
            }
          } else {
            errors.push(`${file.name}: ${uploadRes.error || 'Upload failed.'}`);
          }
        } catch (fileErr: unknown) {
          errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : 'Upload failed.'}`);
        }
      }

      if (errors.length > 0) {
        setErrorMessage(errors.join(' | '));
      }

      if (uploadedCount > 0) {
        setSuccessMessage(
          `${uploadedCount} ${uploadedCount === 1 ? 'image' : 'images'} uploaded successfully.${
            errors.length > 0 ? ` (${errors.length} failed)` : ''
          }`
        );
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during image upload.');
    } finally {
      setUploadingImage(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  }

  async function handleUpdateImageVariant(imageId: string, variantId: string | null) {
    setUpdatingImageId(imageId);
    setErrorMessage(null);

    try {
      const res = await updateProductImageVariantAction(product.id, imageId, variantId);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update image variation.');
        return;
      }

      setProduct((prev) => ({
        ...prev,
        images: prev.images.map((img) =>
          img.id === imageId ? { ...img, variantId: variantId || null } : img
        ),
      }));

      const variantTitle = product.variants.find((v) => v.id === variantId)?.title;
      setSuccessMessage(
        variantId && variantTitle
          ? `Image assigned to variant "${variantTitle}".`
          : 'Image assigned to general product gallery.'
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update image variation.');
    } finally {
      setUpdatingImageId(null);
    }
  }

  async function handleSetPrimaryImage(imageId: string) {
    startTransition(async () => {
      const res = await setPrimaryProductImageAction(product.id, imageId);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to set primary image.');
        return;
      }

      setProduct((prev) => ({
        ...prev,
        images: prev.images.map((img) => ({
          ...img,
          isPrimary: img.id === imageId,
        })),
      }));
      setSuccessMessage('Primary cover image updated.');
    });
  }

  async function handleDeleteImage(imageId: string) {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) return;

    startTransition(async () => {
      const res = await deleteProductImageAction(product.id, imageId);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to delete image.');
        return;
      }

      setProduct((prev) => ({
        ...prev,
        images: prev.images.filter((img) => img.id !== imageId),
      }));
      setSuccessMessage('Image removed.');
    });
  }

  // ── Handler: Inventory Stock Adjustment ──────────────────────────────────
  function handleOpenStockModal(variant: ProductVariantAdmin) {
    setStockVariant(variant);
    setStockAdjustment(0);
    setStockReason('stock_added');
    setStockNotes('');
    setStockModalOpen(true);
  }

  async function handleSaveStockAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!stockVariant || stockAdjustment === 0) return;

    startTransition(async () => {
      const res = await adjustVariantStockAction({
        variantId: stockVariant.id,
        quantityChange: stockAdjustment,
        reason: stockReason,
        notes: stockNotes || undefined,
      });

      if (!res.success || res.newQuantity === undefined) {
        setErrorMessage(res.error || 'Failed to adjust stock.');
        return;
      }

      setProduct((prev) => ({
        ...prev,
        variants: prev.variants.map((v) =>
          v.id === stockVariant.id
            ? {
                ...v,
                stockQuantity: res.newQuantity!,
                stockStatus:
                  res.newQuantity! <= 0
                    ? 'out_of_stock'
                    : res.newQuantity! <= v.lowStockThreshold
                    ? 'low_stock'
                    : 'in_stock',
              }
            : v
        ),
      }));

      setSuccessMessage(`Stock updated for ${stockVariant.sku} to ${res.newQuantity}.`);
      setStockModalOpen(false);
    });
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-luxury-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/products">
            <Button variant="ghost" size="sm" type="button" className="text-neutral-400 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Products
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-serif text-white flex items-center gap-2">
              {product.name}
              <Badge variant={product.isActive ? 'success' : 'outline'} className="ml-2">
                {product.isActive ? 'Published' : 'Draft'}
              </Badge>
            </h1>
            <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5">
              <span>SKU: {product.productCode || 'None'}</span>
              <span>•</span>
              <span className="font-mono">/{product.slug}</span>
              <span>•</span>
              <Link href={`/products/${product.slug}`} target="_blank" className="text-luxury-gold hover:underline inline-flex items-center gap-1">
                View Storefront <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const newStatus = !product.isActive;
              startTransition(async () => {
                await toggleProductActiveAction(product.id, newStatus);
                setProduct((prev) => ({ ...prev, isActive: newStatus }));
                setDetailsForm((prev) => ({ ...prev, isActive: newStatus }));
              });
            }}
            disabled={isPending}
          >
            {product.isActive ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            {successMessage}
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-luxury-border space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('details')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'details'
              ? 'border-luxury-gold text-luxury-gold font-semibold'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Package className="h-4 w-4" />
          General Details
        </button>

        <button
          onClick={() => setActiveTab('variants')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'variants'
              ? 'border-luxury-gold text-luxury-gold font-semibold'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Layers className="h-4 w-4" />
          Variants & Pricing ({product.variants.length})
        </button>

        <button
          onClick={() => setActiveTab('images')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'images'
              ? 'border-luxury-gold text-luxury-gold font-semibold'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Image Gallery ({product.images.length})
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'inventory'
              ? 'border-luxury-gold text-luxury-gold font-semibold'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Archive className="h-4 w-4" />
          Stock Adjustments
        </button>
      </div>

      {/* TAB 1: GENERAL DETAILS */}
      {activeTab === 'details' && (
        <form onSubmit={handleSaveDetails} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-luxury-card p-6 rounded-md border border-luxury-border space-y-4">
              <h3 className="text-lg font-serif text-white border-b border-luxury-border pb-2">
                Product Information
              </h3>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Product Name <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={detailsForm.name}
                  onChange={(e) => setDetailsForm({ ...detailsForm, name: e.target.value })}
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
                    value={detailsForm.slug}
                    onChange={(e) => setDetailsForm({ ...detailsForm, slug: e.target.value })}
                    required
                    className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Product Code / Base SKU
                  </label>
                  <Input
                    value={detailsForm.productCode}
                    onChange={(e) => setDetailsForm({ ...detailsForm, productCode: e.target.value })}
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
                    value={detailsForm.categoryId}
                    onChange={(e) => setDetailsForm({ ...detailsForm, categoryId: e.target.value })}
                    className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
                  >
                    <option value="">Unassigned</option>
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
                    value={detailsForm.material}
                    onChange={(e) => setDetailsForm({ ...detailsForm, material: e.target.value })}
                    className="bg-luxury-surface border-neutral-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Gender Collection
                  </label>
                  <select
                    value={detailsForm.gender}
                    onChange={(e) => setDetailsForm({ ...detailsForm, gender: e.target.value as any })}
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
                  value={detailsForm.shortDescription}
                  onChange={(e) => setDetailsForm({ ...detailsForm, shortDescription: e.target.value })}
                  className="bg-luxury-surface border-neutral-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Full Description
                </label>
                <textarea
                  value={detailsForm.description}
                  onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
                  rows={5}
                  className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm p-3 focus:outline-none focus:border-luxury-gold/70"
                />
              </div>
            </div>

            <div className="space-y-6">
              {/* Merchandising Card */}
              <div className="bg-luxury-card p-5 rounded-md border border-luxury-border space-y-4">
                <h3 className="text-md font-serif text-white border-b border-luxury-border pb-2">
                  Merchandising Flags
                </h3>

                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detailsForm.isFeatured}
                      onChange={(e) => setDetailsForm({ ...detailsForm, isFeatured: e.target.checked })}
                      className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                    />
                    <span className="text-sm text-white">Featured Collection</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detailsForm.isNewArrival}
                      onChange={(e) => setDetailsForm({ ...detailsForm, isNewArrival: e.target.checked })}
                      className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                    />
                    <span className="text-sm text-white">New Arrival</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detailsForm.isBestSeller}
                      onChange={(e) => setDetailsForm({ ...detailsForm, isBestSeller: e.target.checked })}
                      className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                    />
                    <span className="text-sm text-white">Best Seller</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer pt-2 border-t border-neutral-800">
                    <input
                      type="checkbox"
                      checked={detailsForm.isActive}
                      onChange={(e) => setDetailsForm({ ...detailsForm, isActive: e.target.checked })}
                      className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                    />
                    <span className="text-sm text-emerald-400 font-medium">Published / Active</span>
                  </label>
                </div>
              </div>

              {/* SEO Card */}
              <div className="bg-luxury-card p-5 rounded-md border border-luxury-border space-y-3">
                <h3 className="text-md font-serif text-white border-b border-luxury-border pb-2">
                  SEO Metadata
                </h3>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Meta Title
                  </label>
                  <Input
                    value={detailsForm.metaTitle}
                    onChange={(e) => setDetailsForm({ ...detailsForm, metaTitle: e.target.value })}
                    className="bg-luxury-surface border-neutral-700 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Meta Description
                  </label>
                  <textarea
                    value={detailsForm.metaDescription}
                    onChange={(e) => setDetailsForm({ ...detailsForm, metaDescription: e.target.value })}
                    rows={3}
                    className="w-full bg-luxury-surface border border-neutral-700 text-white text-xs rounded-sm p-2.5 focus:outline-none focus:border-luxury-gold/70"
                  />
                </div>
              </div>

              <Button type="submit" variant="gold" className="w-full" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Details
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: VARIANTS & PRICING */}
      {activeTab === 'variants' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-luxury-card p-4 rounded-md border border-luxury-border">
            <div>
              <h3 className="text-md font-serif text-white">Product Variants</h3>
              <p className="text-xs text-neutral-400">
                Each product must have at least one variant. Wholesale purchase costs are strictly confidential and protected on the server.
              </p>
            </div>

            <Button variant="gold" size="sm" onClick={handleOpenCreateVariant}>
              <Plus className="h-4 w-4 mr-1" />
              Add Variant
            </Button>
          </div>

          <div className="bg-luxury-card rounded-md border border-luxury-border overflow-hidden">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-luxury-surface text-xs uppercase tracking-wider text-neutral-400 border-b border-luxury-border">
                <tr>
                  <th className="py-3 px-4">Variant</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Selling Price</th>
                  <th className="py-3 px-4 text-luxury-gold-light">
                    <span className="flex items-center gap-1">
                      <Lock className="h-3 w-3 text-luxury-gold" />
                      Purchase Cost (Admin)
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center">Stock</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-luxury-border">
                {product.variants.map((v) => (
                  <tr key={v.id} className="hover:bg-luxury-surface/50">
                    <td className="py-3 px-4 font-medium text-white">{v.title}</td>
                    <td className="py-3 px-4 font-mono text-xs text-neutral-300">{v.sku}</td>
                    <td className="py-3 px-4">
                      {v.discountPrice != null ? (
                        <div>
                          <div className="font-semibold text-luxury-gold">{formatCurrency(v.discountPrice)}</div>
                          <div className="text-xs text-neutral-500 line-through">{formatCurrency(v.price)}</div>
                        </div>
                      ) : (
                        <div className="font-medium text-white">{formatCurrency(v.price)}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-luxury-gold-light">
                      {formatCurrency(v.purchaseCost)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          v.stockQuantity <= 0
                            ? 'text-rose-400 bg-rose-950/60'
                            : v.stockQuantity <= v.lowStockThreshold
                            ? 'text-amber-400 bg-amber-950/60'
                            : 'text-emerald-400 bg-emerald-950/60'
                        }`}
                      >
                        {v.stockQuantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={v.isActive ? 'success' : 'outline'}>
                        {v.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenStockModal(v)}
                          title="Adjust Stock"
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-white"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditVariant(v)}
                          title="Edit Variant"
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-luxury-gold"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVariant(v.id)}
                          title="Delete Variant"
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: IMAGE GALLERY */}
      {activeTab === 'images' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-luxury-card p-4 rounded-md border border-luxury-border">
            <div>
              <h3 className="text-md font-serif text-white">Product Images & Gallery</h3>
              <p className="text-xs text-neutral-400">
                Uploaded images are saved securely to the Supabase Storage 'products' bucket. Images can be assigned to specific variations or displayed product-wide.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {product.variants.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                  <span className="text-[11px] text-neutral-400 hidden sm:inline">Target:</span>
                  <select
                    value={uploadTargetVariantId}
                    onChange={(e) => setUploadTargetVariantId(e.target.value)}
                    disabled={uploadingImage}
                    className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded px-2.5 py-1.5 focus:border-luxury-gold focus:outline-none"
                    title="Select variation target for new image uploads"
                  >
                    <option value="">All Variations (Product Level)</option>
                    {product.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} ({v.sku})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                id="gallery-images-upload"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadImages}
                disabled={uploadingImage}
                className="hidden"
              />
              <Button
                type="button"
                variant="gold"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="cursor-pointer font-medium flex items-center gap-1.5"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading Images...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Add Image</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Grid of gallery images */}
          {product.images.length === 0 ? (
            <div className="bg-luxury-card p-12 text-center rounded-md border border-luxury-border">
              <ImageIcon className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <div className="text-white font-medium mb-1">No images uploaded yet</div>
              <p className="text-xs text-neutral-400 mb-4">
                Upload JPEG, PNG, or WebP images under 5MB to display on the storefront.
              </p>
              <Button
                type="button"
                variant="gold"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="cursor-pointer font-medium"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    <span>Add Image / Upload Cover</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {product.images.map((img) => {
                const isUpdatingThis = updatingImageId === img.id;

                return (
                  <div
                    key={img.id}
                    className={`relative group rounded-md border bg-neutral-900 overflow-hidden flex flex-col ${
                      img.isPrimary ? 'border-luxury-gold ring-1 ring-luxury-gold' : 'border-neutral-700'
                    }`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-neutral-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.altText || product.name} className="w-full h-full object-cover" />

                      {img.isPrimary && (
                        <span className="absolute top-2 left-2 bg-luxury-gold text-luxury-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1 z-10">
                          <Star className="h-3 w-3 fill-current" /> Cover
                        </span>
                      )}

                      {/* Top right quick actions */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                        {!img.isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryImage(img.id)}
                            className="bg-black/70 hover:bg-luxury-gold hover:text-luxury-black text-neutral-300 p-1.5 rounded transition-colors"
                            title="Set as Cover Image"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          className="bg-black/70 hover:bg-rose-700 text-neutral-300 hover:text-white p-1.5 rounded transition-colors"
                          title="Delete Image"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom: Variation selector */}
                    <div className="p-2 bg-neutral-900 border-t border-neutral-800 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-neutral-400">
                        <span>Variation:</span>
                        {isUpdatingThis && <Loader2 className="h-2.5 w-2.5 animate-spin text-luxury-gold" />}
                      </div>
                      <select
                        value={img.variantId || ''}
                        disabled={isUpdatingThis}
                        onChange={(e) => handleUpdateImageVariant(img.id, e.target.value || null)}
                        className="w-full text-[11px] bg-neutral-950 text-neutral-200 border border-neutral-700 rounded px-1.5 py-1 focus:border-luxury-gold focus:outline-none truncate"
                        title="Assign to variation or product"
                      >
                        <option value="">All Variations</option>
                        {product.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INVENTORY ADJUSTMENTS */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="bg-luxury-card p-5 rounded-md border border-luxury-border">
            <h3 className="text-md font-serif text-white mb-1">Variant Inventory Status</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Review current inventory across all variants of "{product.name}". Adjust quantities with audited movement reasons.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {product.variants.map((v) => (
                <div
                  key={v.id}
                  className="bg-luxury-surface p-4 rounded border border-neutral-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{v.title}</span>
                    <span className="font-mono text-xs text-neutral-400">{v.sku}</span>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-xs text-neutral-400">Current Stock:</span>
                    <span className="text-xl font-bold font-mono text-white">{v.stockQuantity}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Low Stock Alert:</span>
                    <span>{v.lowStockThreshold} units</span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => handleOpenStockModal(v)}
                  >
                    <Archive className="h-3.5 w-3.5 mr-1 text-luxury-gold" />
                    Adjust Stock
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Variant Create / Edit */}
      {variantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-luxury-border rounded-lg max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setVariantModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-xl font-serif text-white mb-1">
              {editingVariantId ? 'Edit Variant' : 'Create Variant'}
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Set variant title, SKU, selling price, and confidential wholesale purchase cost.
            </p>

            <form onSubmit={handleSaveVariant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Title <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    value={variantForm.title}
                    onChange={(e) => setVariantForm({ ...variantForm, title: e.target.value })}
                    placeholder="e.g. Gold / 17cm"
                    required
                    className="bg-luxury-surface border-neutral-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    SKU <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    value={variantForm.sku}
                    onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                    placeholder="SJ-RNG-001-GLD"
                    required
                    className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Selling Price <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    type="number"
                    value={variantForm.price}
                    onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
                    required
                    min={0}
                    step="0.01"
                    className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Discount Price
                  </label>
                  <Input
                    type="number"
                    value={variantForm.discountPrice}
                    onChange={(e) => setVariantForm({ ...variantForm, discountPrice: e.target.value })}
                    min={0}
                    step="0.01"
                    placeholder="Optional"
                    className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-luxury-gold-light mb-1 flex items-center gap-1">
                    <Lock className="h-3 w-3 text-luxury-gold" />
                    Purchase Cost
                  </label>
                  <Input
                    type="number"
                    value={variantForm.purchaseCost}
                    onChange={(e) => setVariantForm({ ...variantForm, purchaseCost: e.target.value })}
                    min={0}
                    step="0.01"
                    className="bg-luxury-surface border-luxury-gold/40 text-luxury-gold-light font-mono text-sm"
                  />
                </div>
              </div>

              {!editingVariantId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Initial Stock Quantity
                    </label>
                    <Input
                      type="number"
                      value={variantForm.stockQuantity}
                      onChange={(e) => setVariantForm({ ...variantForm, stockQuantity: e.target.value })}
                      min={0}
                      className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Low Stock Threshold
                    </label>
                    <Input
                      type="number"
                      value={variantForm.lowStockThreshold}
                      onChange={(e) => setVariantForm({ ...variantForm, lowStockThreshold: e.target.value })}
                      min={0}
                      className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                    />
                  </div>
                </div>
              )}

              {editingVariantId && (
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Low Stock Alert Threshold
                  </label>
                  <Input
                    type="number"
                    value={variantForm.lowStockThreshold}
                    onChange={(e) => setVariantForm({ ...variantForm, lowStockThreshold: e.target.value })}
                    min={0}
                    className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                  />
                </div>
              )}

              <div className="flex items-center pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={variantForm.isActive}
                    onChange={(e) => setVariantForm({ ...variantForm, isActive: e.target.checked })}
                    className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                  />
                  <span className="text-sm text-neutral-200">Active variant</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-luxury-border">
                <Button type="button" variant="outline" onClick={() => setVariantModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gold" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingVariantId ? 'Save Variant' : 'Create Variant'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Stock Adjustment */}
      {stockModalOpen && stockVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-luxury-border rounded-lg max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setStockModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-xl font-serif text-white mb-1">Adjust Inventory Stock</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Variant: <span className="text-white font-medium">{stockVariant.title}</span> (SKU: {stockVariant.sku})
            </p>

            <form onSubmit={handleSaveStockAdjustment} className="space-y-4">
              <div className="bg-luxury-surface p-3 rounded border border-neutral-700 text-sm flex justify-between">
                <span className="text-neutral-400">Current In Stock:</span>
                <span className="font-mono font-bold text-white">{stockVariant.stockQuantity} units</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Quantity Change (+ to add, - to reduce)
                </label>
                <Input
                  type="number"
                  value={stockAdjustment}
                  onChange={(e) => setStockAdjustment(Number(e.target.value))}
                  placeholder="e.g. 10 or -2"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  New stock will be: {stockVariant.stockQuantity + stockAdjustment} units
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Reason for Movement
                </label>
                <select
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value as any)}
                  className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
                >
                  <option value="stock_added">Stock Added / New Restock</option>
                  <option value="manual_adjustment">Manual Adjustment / Count Audit</option>
                  <option value="correction">Inventory Discrepancy Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Notes / Reference ID (Optional)
                </label>
                <Input
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  placeholder="e.g. PO-8492 or Shelf recount"
                  className="bg-luxury-surface border-neutral-700 text-white text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-luxury-border">
                <Button type="button" variant="outline" onClick={() => setStockModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gold" disabled={isPending || stockAdjustment === 0}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirm Stock Change
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
