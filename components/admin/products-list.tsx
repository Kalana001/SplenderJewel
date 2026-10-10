'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Package,
  Plus,
  Search,
  Filter,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Tag,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/config/store';
import {
  type AdminProductListItem,
  toggleProductActiveAction,
  deleteProductAction,
} from '@/lib/catalog/products';
import type { Category } from '@/types/product';

interface ProductsListProps {
  initialProducts: AdminProductListItem[];
  categories: Category[];
}

export function ProductsList({ initialProducts, categories }: ProductsListProps) {
  const [products, setProducts] = useState<AdminProductListItem[]>(initialProducts);
  const [isPending, startTransition] = useTransition();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSort, setSelectedSort] = useState('newest');

  // Alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Delete modal
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Filter products
  const filteredProducts = products.filter((p) => {
    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchSlug = p.slug.toLowerCase().includes(q);
      const matchSku = p.productCode ? p.productCode.toLowerCase().includes(q) : false;
      if (!matchName && !matchSlug && !matchSku) return false;
    }

    // Category
    if (selectedCategory !== 'all') {
      if (p.categoryId !== selectedCategory) return false;
    }

    // Status
    if (selectedStatus === 'active' && !p.isActive) return false;
    if (selectedStatus === 'draft' && p.isActive) return false;

    return true;
  });

  // Sort products
  filteredProducts.sort((a, b) => {
    if (selectedSort === 'name-asc') return a.name.localeCompare(b.name);
    if (selectedSort === 'name-desc') return b.name.localeCompare(a.name);
    if (selectedSort === 'price-low') return a.minPrice - b.minPrice;
    if (selectedSort === 'price-high') return b.minPrice - a.minPrice;
    if (selectedSort === 'stock-low') return a.totalStock - b.totalStock;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  async function handleToggleStatus(productId: string, currentStatus: boolean) {
    const newStatus = !currentStatus;
    startTransition(async () => {
      const res = await toggleProductActiveAction(productId, newStatus);
      if (res.success) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, isActive: newStatus } : p))
        );
        setSuccessMessage(`Product ${newStatus ? 'published' : 'unpublished'} successfully.`);
      } else {
        setErrorMessage(res.error || 'Failed to update product status.');
      }
    });
  }

  function handleOpenDelete(productId: string) {
    setDeleteId(productId);
    setDeleteConfirmOpen(true);
    setErrorMessage(null);
  }

  async function handleConfirmDelete() {
    if (!deleteId) return;

    startTransition(async () => {
      const res = await deleteProductAction(deleteId);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to delete product.');
        setDeleteConfirmOpen(false);
        return;
      }

      setProducts((prev) => prev.filter((p) => p.id !== deleteId));
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      setSuccessMessage('Product deleted successfully.');
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-luxury-card p-5 rounded-md border border-luxury-border">
        <div>
          <h2 className="text-xl font-serif text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-luxury-gold" />
            Product Catalog & Variants
          </h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Manage your fine jewelry pieces, variant matrices, pricing, inventory thresholds, and publication status.
          </p>
        </div>

        <Link href="/admin/products/new">
          <Button variant="gold" className="flex items-center gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Add New Product
          </Button>
        </Link>
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

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-luxury-card p-4 rounded-md border border-luxury-border">
        {/* Search */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-3 text-neutral-400" />
          <Input
            placeholder="Search by name, SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-luxury-surface border-neutral-700 text-white text-sm"
          />
        </div>

        {/* Category Filter */}
        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
          >
            <option value="all">All Statuses</option>
            <option value="active">Published / Active</option>
            <option value="draft">Draft / Inactive</option>
          </select>
        </div>

        {/* Sort */}
        <div>
          <select
            value={selectedSort}
            onChange={(e) => setSelectedSort(e.target.value)}
            className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
          >
            <option value="newest">Newest First</option>
            <option value="name-asc">Name (A to Z)</option>
            <option value="name-desc">Name (Z to A)</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="stock-low">Stock: Low to High</option>
          </select>
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-luxury-card rounded-md border border-luxury-border overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Package className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">No Products Match Filters</h3>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-5">
              {searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your search query or category filters.'
                : 'Start building your fine jewelry collection by creating your first product.'}
            </p>
            <Link href="/admin/products/new">
              <Button variant="gold">Create New Jewelry Product</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-luxury-surface text-xs uppercase tracking-wider text-neutral-400 border-b border-luxury-border">
                <tr>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU / Code</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Selling Price</th>
                  <th className="py-3 px-4 text-center">Variants & Stock</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-luxury-border">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-luxury-surface/50 transition-colors">
                    {/* Product & Image */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {product.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.primaryImageUrl}
                            alt={product.name}
                            className="h-11 w-11 rounded object-cover border border-neutral-700 shrink-0"
                          />
                        ) : (
                          <div className="h-11 w-11 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 text-luxury-gold/50">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white hover:text-luxury-gold transition-colors">
                            <Link href={`/admin/products/${product.id}`}>{product.name}</Link>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono text-neutral-500">/{product.slug}</span>
                            {product.isFeatured && (
                              <span className="inline-flex items-center text-[10px] bg-luxury-gold/20 text-luxury-gold px-1.5 py-0.2 rounded font-semibold">
                                Featured
                              </span>
                            )}
                            {product.isNewArrival && (
                              <span className="inline-flex items-center text-[10px] bg-sky-950 text-sky-400 border border-sky-800 px-1.5 py-0.2 rounded font-semibold">
                                New
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* SKU / Code */}
                    <td className="py-3 px-4 font-mono text-xs text-neutral-300">
                      {product.productCode || <span className="text-neutral-600 italic">None</span>}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-neutral-300">
                      {product.categoryName ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded">
                          <Tag className="h-3 w-3 text-luxury-gold" />
                          {product.categoryName}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="py-3 px-4">
                      <div>
                        {product.minDiscountPrice != null ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-luxury-gold">
                              {formatCurrency(product.minDiscountPrice)}
                            </div>
                            <div className="text-xs text-neutral-500 line-through">
                              {formatCurrency(product.minPrice)}
                            </div>
                          </div>
                        ) : (
                          <div className="font-medium text-white">
                            {product.minPrice === product.maxPrice
                              ? formatCurrency(product.minPrice)
                              : `${formatCurrency(product.minPrice)} - ${formatCurrency(product.maxPrice)}`}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Variants & Stock */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="text-xs text-neutral-400">
                          {product.variantCount} {product.variantCount === 1 ? 'variant' : 'variants'}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded mt-0.5 ${
                            product.totalStock <= 0
                              ? 'bg-rose-950/70 text-rose-400 border border-rose-800/40'
                              : product.totalStock <= 5
                              ? 'bg-amber-950/70 text-amber-400 border border-amber-800/40'
                              : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40'
                          }`}
                        >
                          {product.totalStock} in stock
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <Badge variant={product.isActive ? 'success' : 'outline'}>
                        {product.isActive ? 'Published' : 'Draft'}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(product.id, product.isActive)}
                          title={product.isActive ? 'Unpublish Product' : 'Publish Product'}
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-white"
                        >
                          {product.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>

                        <Link href={`/admin/products/${product.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit Product"
                            className="h-8 w-8 p-0 text-neutral-400 hover:text-luxury-gold"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </Link>

                        <Link href={`/products/${product.slug}`} target="_blank">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View on Storefront"
                            className="h-8 w-8 p-0 text-neutral-400 hover:text-sky-400"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDelete(product.id)}
                          title="Delete Product"
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
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-rose-500/40 rounded-lg max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-serif text-white mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              Delete Product?
            </h3>
            <p className="text-sm text-neutral-300 mb-5">
              Are you sure you want to delete this product? If any customer has previously purchased variants of this product, the system will prevent deletion to preserve order records (in which case you should unpublish it instead).
            </p>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
