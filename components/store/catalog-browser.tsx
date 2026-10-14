'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Filter, SlidersHorizontal, Search, X, Package, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard } from '@/components/store/product-card';
import type { ProductPublic, Category } from '@/types/product';

interface CatalogBrowserProps {
  initialProducts: ProductPublic[];
  categories: Category[];
  currentCategorySlug?: string;
  categoryTitle?: string;
  categoryDescription?: string | null;
}

export function CatalogBrowser({
  initialProducts,
  categories,
  currentCategorySlug,
  categoryTitle,
  categoryDescription,
}: CatalogBrowserProps) {
  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(currentCategorySlug || 'all');
  const [selectedGender, setSelectedGender] = useState('all');
  const [selectedMaterial, setSelectedMaterial] = useState('all');
  const [sortOption, setSortOption] = useState<'newest' | 'price-asc' | 'price-desc' | 'name-asc'>('newest');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Extract available materials dynamically from products
  const availableMaterials = useMemo(() => {
    const set = new Set<string>();
    initialProducts.forEach((p) => {
      if (p.material) set.add(p.material);
    });
    return Array.from(set).sort();
  }, [initialProducts]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return initialProducts.filter((product) => {
      // Category filter
      if (selectedCategory !== 'all') {
        if (product.category?.slug !== selectedCategory) return false;
      }

      // Gender filter
      if (selectedGender !== 'all') {
        if (product.gender !== selectedGender) return false;
      }

      // Material filter
      if (selectedMaterial !== 'all') {
        if (product.material !== selectedMaterial) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = product.name.toLowerCase().includes(q);
        const matchShortDesc = product.shortDescription?.toLowerCase().includes(q) || false;
        const matchMaterial = product.material?.toLowerCase().includes(q) || false;
        if (!matchName && !matchShortDesc && !matchMaterial) return false;
      }

      return true;
    });
  }, [initialProducts, selectedCategory, selectedGender, selectedMaterial, searchTerm]);

  // Sort products
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    switch (sortOption) {
      case 'price-asc':
        return list.sort((a, b) => (a.baseDiscountPrice || a.basePrice) - (b.baseDiscountPrice || b.basePrice));
      case 'price-desc':
        return list.sort((a, b) => (b.baseDiscountPrice || b.basePrice) - (a.baseDiscountPrice || a.basePrice));
      case 'name-asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'newest':
      default:
        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [filteredProducts, sortOption]);

  function resetFilters() {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedGender('all');
    setSelectedMaterial('all');
    setSortOption('newest');
  }

  const hasActiveFilters =
    searchTerm !== '' ||
    selectedCategory !== (currentCategorySlug || 'all') ||
    selectedGender !== 'all' ||
    selectedMaterial !== 'all';

  return (
    <div className="space-y-8">
      {/* Category / Catalog Header */}
      <div className="border-b border-luxury-border pb-6 text-center max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-serif text-white mb-2">
          {categoryTitle || 'Fashion Jewellery'}
        </h1>
        <p className="text-sm sm:text-base text-neutral-400">
          {categoryDescription ||
            'Discover elegance and timeless style with Splender Jewel’s curated collections of fashion jewellery and accessories.'}
        </p>
      </div>

      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-luxury-card p-4 rounded-md border border-luxury-border">
        {/* Search */}
        <div className="relative flex-grow max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-3 text-neutral-400" />
          <Input
            placeholder="Search jewellery by name or collection..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-luxury-surface border-neutral-700 text-white text-sm"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 justify-between sm:justify-end">
          <button
            type="button"
            onClick={() => setMobileFilterOpen(true)}
            className="lg:hidden flex items-center gap-2 text-xs font-medium text-luxury-gold bg-luxury-surface border border-neutral-700 px-3 py-2 rounded"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters {hasActiveFilters && '•'}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 hidden sm:inline">Sort:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="bg-luxury-surface border border-neutral-700 text-white text-xs rounded h-9 px-2.5 focus:outline-none focus:border-luxury-gold"
            >
              <option value="newest">Newest Arrivals</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="name-asc">Alphabetical (A - Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Sidebar + Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden lg:block space-y-6 bg-luxury-card p-5 rounded-md border border-luxury-border h-fit">
          <div className="flex items-center justify-between border-b border-luxury-border pb-3">
            <h3 className="font-serif text-white font-medium flex items-center gap-2">
              <Filter className="h-4 w-4 text-luxury-gold" />
              Filter Catalog
            </h3>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-luxury-gold hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
              Category
            </h4>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-luxury-gold text-luxury-black font-semibold'
                    : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                }`}
              >
                All Pieces
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.slug)}
                  className={`w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    selectedCategory === c.slug
                      ? 'bg-luxury-gold text-luxury-black font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Gender Filter */}
          <div className="space-y-2 border-t border-luxury-border pt-4">
            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
              Collection
            </h4>
            <div className="space-y-1">
              {[
                { label: 'All Collections', value: 'all' },
                { label: 'Women', value: 'women' },
                { label: 'Men', value: 'men' },
                { label: 'Unisex', value: 'unisex' },
              ].map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setSelectedGender(g.value)}
                  className={`w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    selectedGender === g.value
                      ? 'bg-luxury-gold text-luxury-black font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Material Filter */}
          {availableMaterials.length > 0 && (
            <div className="space-y-2 border-t border-luxury-border pt-4">
              <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                Material
              </h4>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedMaterial('all')}
                  className={`w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    selectedMaterial === 'all'
                      ? 'bg-luxury-gold text-luxury-black font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                  }`}
                >
                  All Materials
                </button>
                {availableMaterials.map((mat) => (
                  <button
                    key={mat}
                    type="button"
                    onClick={() => setSelectedMaterial(mat)}
                    className={`w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                      selectedMaterial === mat
                        ? 'bg-luxury-gold text-luxury-black font-semibold'
                        : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                    }`}
                  >
                    {mat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Product Grid Area */}
        <main className="lg:col-span-3">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-4 px-1">
            <span>
              Showing <strong className="text-white">{sortedProducts.length}</strong> jewelry piece
              {sortedProducts.length === 1 ? '' : 's'}
            </span>
          </div>

          {sortedProducts.length === 0 ? (
            <div className="bg-luxury-card border border-luxury-border rounded-md p-16 text-center">
              <Package className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-lg font-serif text-white mb-2">No Matching Jewelry Found</h3>
              <p className="text-sm text-neutral-400 max-w-sm mx-auto mb-5">
                We couldn't find any pieces matching your current filter criteria.
              </p>
              {hasActiveFilters && (
                <Button variant="gold" size="sm" onClick={resetFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {sortedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Mobile Filters Drawer */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm lg:hidden">
          <div className="ml-auto w-full max-w-xs bg-luxury-card p-6 h-full overflow-y-auto border-l border-luxury-border flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-luxury-border pb-3">
                <h3 className="font-serif text-white font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4 text-luxury-gold" />
                  Filters
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                  Category
                </h4>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`w-full text-left text-xs py-1.5 px-2 rounded ${
                      selectedCategory === 'all'
                        ? 'bg-luxury-gold text-luxury-black font-semibold'
                        : 'text-neutral-300'
                    }`}
                  >
                    All Categories
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategory(c.slug)}
                      className={`w-full text-left text-xs py-1.5 px-2 rounded ${
                        selectedCategory === c.slug
                          ? 'bg-luxury-gold text-luxury-black font-semibold'
                          : 'text-neutral-300'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gender */}
              <div className="space-y-2 border-t border-luxury-border pt-4">
                <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                  Collection
                </h4>
                <div className="space-y-1">
                  {[
                    { label: 'All', value: 'all' },
                    { label: 'Women', value: 'women' },
                    { label: 'Men', value: 'men' },
                    { label: 'Unisex', value: 'unisex' },
                  ].map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setSelectedGender(g.value)}
                      className={`w-full text-left text-xs py-1.5 px-2 rounded ${
                        selectedGender === g.value
                          ? 'bg-luxury-gold text-luxury-black font-semibold'
                          : 'text-neutral-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-luxury-border flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="w-1/2"
                onClick={resetFilters}
              >
                Reset
              </Button>
              <Button
                variant="gold"
                size="sm"
                className="w-1/2"
                onClick={() => setMobileFilterOpen(false)}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
