'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Filter, SlidersHorizontal, Search, X, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard } from '@/components/store/product-card';
import type { ProductPublic, Category } from '@/types/product';

interface CatalogBrowserProps {
  initialProducts: ProductPublic[];
  categories: Category[];
  availableMaterials?: string[];
  currentCategorySlug?: string;
  categoryTitle?: string;
  categoryDescription?: string | null;
  currentPage?: number;
  totalPages?: number;
  totalProducts?: number;
  initialSearchQuery?: string;
  baseUrl?: string;
  isOverflow?: boolean;
}

export function CatalogBrowser({
  initialProducts,
  categories,
  availableMaterials,
  currentCategorySlug,
  categoryTitle,
  categoryDescription,
  currentPage = 1,
  totalPages = 1,
  totalProducts = initialProducts.length,
  initialSearchQuery = '',
  baseUrl,
  isOverflow = false,
}: CatalogBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Search input state synchronized with URL search parameter
  const activeUrlQuery = searchParams.get('q') || initialSearchQuery || '';
  const [searchTerm, setSearchTerm] = useState(activeUrlQuery);

  // Active filters from URL search parameters (server-driven)
  const activeGender = searchParams.get('gender') || 'all';
  const activeMaterial = searchParams.get('material') || 'all';
  const activeCategory = searchParams.get('category') || currentCategorySlug || 'all';
  const activeMinPrice = searchParams.get('minPrice') || '';
  const activeMaxPrice = searchParams.get('maxPrice') || '';

  const [customMinPrice, setCustomMinPrice] = useState(activeMinPrice);
  const [customMaxPrice, setCustomMaxPrice] = useState(activeMaxPrice);

  // Sync search input & price inputs state with URL parameter on browser back/forward navigation
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    setSearchTerm(urlQuery);
    setCustomMinPrice(searchParams.get('minPrice') || '');
    setCustomMaxPrice(searchParams.get('maxPrice') || '');
  }, [searchParams]);

  // Sort state initialized from URL if present
  const urlSort = searchParams.get('sort');
  const validSorts = ['newest', 'price-asc', 'price-desc', 'name-asc'];
  const initialSort = validSorts.includes(urlSort || '')
    ? (urlSort as 'newest' | 'price-asc' | 'price-desc' | 'name-asc')
    : 'newest';
  const [sortOption, setSortOption] = useState<'newest' | 'price-asc' | 'price-desc' | 'name-asc'>(initialSort);

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // LKR Price range presets
  const pricePresets: Array<{ label: string; min: number | null; max: number | null }> = [
    { label: 'All Prices', min: null, max: null },
    { label: 'Under Rs. 2,500', min: null, max: 2500 },
    { label: 'Rs. 2,500 – Rs. 5,000', min: 2500, max: 5000 },
    { label: 'Rs. 5,000 – Rs. 10,000', min: 5000, max: 10000 },
    { label: 'Rs. 10,000 – Rs. 20,000', min: 10000, max: 20000 },
    { label: 'Above Rs. 20,000', min: 20000, max: null },
  ];

  const isPresetActive = (min: number | null, max: number | null) => {
    const curMin = activeMinPrice ? Number(activeMinPrice) : null;
    const curMax = activeMaxPrice ? Number(activeMaxPrice) : null;
    if (min === null && max === null) {
      return curMin === null && curMax === null;
    }
    return curMin === min && curMax === max;
  };

  // Available materials from server facet query or extracted fallback
  const materialsList = useMemo(() => {
    if (availableMaterials && availableMaterials.length > 0) {
      return availableMaterials;
    }
    const set = new Set<string>();
    initialProducts.forEach((p) => {
      if (p.material) set.add(p.material);
    });
    return Array.from(set).sort();
  }, [availableMaterials, initialProducts]);

  // Helper to build URL preserving active filters and resetting page
  const buildFilterUrl = (updates: {
    page?: number | null;
    gender?: string | null;
    material?: string | null;
    sort?: string | null;
    category?: string | null;
    q?: string | null;
    minPrice?: string | number | null;
    maxPrice?: string | number | null;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === undefined || val === 'all' || val === '') {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    }
    const qs = params.toString();
    return `${baseUrl || pathname}${qs ? `?${qs}` : ''}`;
  };

  // Handle custom price submission
  const handleApplyCustomPrice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let min: number | null = null;
    let max: number | null = null;

    if (customMinPrice.trim()) {
      const parsed = parseFloat(customMinPrice.trim());
      if (!isNaN(parsed) && parsed >= 0) min = parsed;
    }
    if (customMaxPrice.trim()) {
      const parsed = parseFloat(customMaxPrice.trim());
      if (!isNaN(parsed) && parsed >= 0) max = parsed;
    }

    if (min !== null && max !== null && min > max) {
      const temp = min;
      min = max;
      max = temp;
      setCustomMinPrice(String(min));
      setCustomMaxPrice(String(max));
    }

    router.push(buildFilterUrl({ minPrice: min, maxPrice: max, page: 1 }));
    setMobileFilterOpen(false);
  };

  // Handle Search Submission (fetches from server)
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchTerm.trim().slice(0, 80);
    const currentQ = (searchParams.get('q') || '').trim();

    // Avoid redundant search
    if (query === currentQ && pathname === '/search') return;

    if (query) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    } else {
      if (pathname === '/search') {
        router.push('/search');
      } else {
        router.push(baseUrl || '/shop');
      }
    }
  };

  // Handle Clear Search
  const handleClearSearch = () => {
    setSearchTerm('');
    if (searchParams.has('q')) {
      if (pathname === '/search') {
        router.push('/search');
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        params.delete('page');
        const qs = params.toString();
        router.push(`${baseUrl || pathname}${qs ? `?${qs}` : ''}`);
      }
    }
  };

  // Handle Sort Change (preserves active filters in URL)
  const handleSortChange = (newSort: 'newest' | 'price-asc' | 'price-desc' | 'name-asc') => {
    setSortOption(newSort);
    router.push(buildFilterUrl({ sort: newSort, page: 1 }));
  };

  // Reset all filters
  function resetFilters() {
    setSearchTerm('');
    if (currentCategorySlug) {
      router.push(`/category/${currentCategorySlug}`);
    } else if (pathname === '/search') {
      router.push('/search');
    } else {
      router.push('/shop');
    }
  }

  const hasActiveFilters =
    searchTerm !== '' ||
    activeCategory !== (currentCategorySlug || 'all') ||
    activeGender !== 'all' ||
    activeMaterial !== 'all' ||
    Boolean(activeMinPrice) ||
    Boolean(activeMaxPrice);

  // Sort products on current page (price sorts client-side where database lacks price column on product root)
  const sortedProducts = useMemo(() => {
    const list = [...initialProducts];
    switch (sortOption) {
      case 'price-asc':
        return list.sort((a, b) => (a.baseDiscountPrice || a.basePrice) - (b.baseDiscountPrice || b.basePrice));
      case 'price-desc':
        return list.sort((a, b) => (b.baseDiscountPrice || b.basePrice) - (a.baseDiscountPrice || a.basePrice));
      case 'name-asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'newest':
      default:
        return list;
    }
  }, [initialProducts, sortOption]);

  // Build pagination target URL preserving existing filters
  const getPageUrl = (targetPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (targetPage <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(targetPage));
    }
    const qs = params.toString();
    return `${baseUrl || pathname}${qs ? `?${qs}` : ''}`;
  };

  // Pagination page range array
  const paginationRange = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [currentPage, totalPages]);

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
        {/* Search Input with Form Submission & URL Synchronization */}
        <form onSubmit={handleSearchSubmit} className="relative flex-grow max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-3 text-neutral-400 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search jewellery by name or collection..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 bg-luxury-surface border-neutral-700 text-white text-sm"
            aria-label="Search jewelry catalog"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-2.5 p-0.5 text-neutral-400 hover:text-white transition-colors"
              aria-label="Clear search query"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

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
              onChange={(e) => handleSortChange(e.target.value as any)}
              className="bg-luxury-surface border border-neutral-700 text-white text-xs rounded h-9 px-2.5 focus:outline-none focus:border-luxury-gold"
              aria-label="Sort jewelry products"
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
              <Link
                href="/shop"
                className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                  activeCategory === 'all'
                    ? 'bg-luxury-gold text-luxury-black font-semibold'
                    : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                }`}
              >
                All Pieces
              </Link>
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/category/${c.slug}`}
                  className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    activeCategory === c.slug
                      ? 'bg-luxury-gold text-luxury-black font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                  }`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Collection / Gender Filter (Server-side execution) */}
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
                <Link
                  key={g.value}
                  href={buildFilterUrl({ gender: g.value, page: 1 })}
                  className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    activeGender === g.value
                      ? 'bg-luxury-gold text-luxury-black font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                  }`}
                >
                  {g.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Material Filter (Server-side execution with stable global materials) */}
          {materialsList.length > 0 && (
            <div className="space-y-2 border-t border-luxury-border pt-4">
              <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                Material
              </h4>
              <div className="space-y-1">
                <Link
                  href={buildFilterUrl({ material: 'all', page: 1 })}
                  className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    activeMaterial === 'all'
                      ? 'bg-luxury-gold text-luxury-black font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                  }`}
                >
                  All Materials
                </Link>
                {materialsList.map((mat) => (
                  <Link
                    key={mat}
                    href={buildFilterUrl({ material: mat, page: 1 })}
                    className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                      activeMaterial === mat
                        ? 'bg-luxury-gold text-luxury-black font-semibold'
                        : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                    }`}
                  >
                    {mat}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Price Range Filter (Server-side execution with presets & custom inputs) */}
          <div className="space-y-3 border-t border-luxury-border pt-4">
            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
              Price Range (LKR)
            </h4>
            <div className="space-y-1">
              {pricePresets.map((preset) => {
                const active = isPresetActive(preset.min, preset.max);
                return (
                  <Link
                    key={preset.label}
                    href={buildFilterUrl({
                      minPrice: preset.min,
                      maxPrice: preset.max,
                      page: 1,
                    })}
                    className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                      active
                        ? 'bg-luxury-gold text-luxury-black font-semibold'
                        : 'text-neutral-300 hover:text-white hover:bg-luxury-surface'
                    }`}
                  >
                    {preset.label}
                  </Link>
                );
              })}
            </div>

            {/* Custom Min / Max Price Inputs */}
            <form onSubmit={handleApplyCustomPrice} className="pt-2 space-y-2">
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Min"
                  value={customMinPrice}
                  onChange={(e) => setCustomMinPrice(e.target.value)}
                  className="w-1/2 bg-luxury-surface border border-neutral-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-luxury-gold"
                  aria-label="Minimum price in LKR"
                />
                <span className="text-neutral-500">–</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Max"
                  value={customMaxPrice}
                  onChange={(e) => setCustomMaxPrice(e.target.value)}
                  className="w-1/2 bg-luxury-surface border border-neutral-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-luxury-gold"
                  aria-label="Maximum price in LKR"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full text-[11px] h-7 border-neutral-700 hover:border-luxury-gold hover:text-luxury-gold"
              >
                Apply Price Filter
              </Button>
            </form>
          </div>
        </aside>

        {/* Product Grid Area */}
        <main className="lg:col-span-3">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-4 px-1">
            <span>
              {totalProducts > 0 ? (
                <>
                  Showing <strong className="text-white">{sortedProducts.length}</strong> of{' '}
                  <strong className="text-white">{totalProducts}</strong> jewelry {totalProducts === 1 ? 'piece' : 'pieces'}
                  {totalPages > 1 && (
                    <span className="text-neutral-500 ml-1">
                      (Page {currentPage} of {totalPages})
                    </span>
                  )}
                </>
              ) : (
                <>
                  Showing <strong className="text-white">0</strong> jewelry pieces
                </>
              )}
            </span>
          </div>

          {isOverflow ? (
            <div className="bg-luxury-card border border-luxury-border rounded-md p-16 text-center">
              <Package className="h-12 w-12 text-luxury-gold mx-auto mb-3" />
              <h3 className="text-lg font-serif text-white mb-2">Price Filter Matches Too Many Pieces</h3>
              <p className="text-sm text-neutral-400 max-w-md mx-auto mb-5">
                The selected price range matches more items than can be safely filtered at once. Please narrow your price range or select a specific category to view pieces.
              </p>
              {hasActiveFilters && (
                <Button variant="gold" size="sm" onClick={resetFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : currentPage > totalPages && totalPages > 0 ? (
            <div className="bg-luxury-card border border-luxury-border rounded-md p-16 text-center">
              <Package className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-lg font-serif text-white mb-2">No Products on Page {currentPage}</h3>
              <p className="text-sm text-neutral-400 max-w-sm mx-auto mb-5">
                This page does not contain any pieces. The catalog currently has {totalPages} {totalPages === 1 ? 'page' : 'pages'}.
              </p>
              <Link href={getPageUrl(1)}>
                <Button variant="gold" size="sm">
                  Return to Page 1
                </Button>
              </Link>
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="bg-luxury-card border border-luxury-border rounded-md p-16 text-center">
              <Package className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-lg font-serif text-white mb-2">No Matching Jewelry Found</h3>
              <p className="text-sm text-neutral-400 max-w-sm mx-auto mb-5">
                {searchTerm
                  ? `We couldn't find any pieces matching "${searchTerm}". Try checking your spelling or searching for broader terms like "Gold" or "Ring".`
                  : "We couldn't find any pieces matching your current filter criteria."}
              </p>
              {hasActiveFilters && (
                <Button variant="gold" size="sm" onClick={resetFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {sortedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <nav
                  className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-luxury-border pt-6 text-sm"
                  aria-label="Catalog pagination"
                >
                  <div className="text-xs text-neutral-400">
                    Page <strong className="text-white">{currentPage}</strong> of{' '}
                    <strong className="text-white">{totalPages}</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Previous Button */}
                    {currentPage > 1 ? (
                      <Link
                        href={getPageUrl(currentPage - 1)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-neutral-700 bg-luxury-surface text-xs text-neutral-200 hover:border-luxury-gold hover:text-luxury-gold transition-colors"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Previous</span>
                      </Link>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-neutral-800 bg-neutral-900/50 text-xs text-neutral-600 cursor-not-allowed"
                        aria-disabled="true"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Previous</span>
                      </span>
                    )}

                    {/* Page Numbers */}
                    {paginationRange.map((p, idx) =>
                      p === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-neutral-500">
                          ...
                        </span>
                      ) : (
                        <Link
                          key={`page-${p}`}
                          href={getPageUrl(p as number)}
                          className={`min-w-[34px] h-8 flex items-center justify-center rounded-sm text-xs font-medium transition-colors ${
                            p === currentPage
                              ? 'bg-luxury-gold text-luxury-black font-semibold'
                              : 'border border-neutral-700 bg-luxury-surface text-neutral-200 hover:border-luxury-gold hover:text-luxury-gold'
                          }`}
                          aria-current={p === currentPage ? 'page' : undefined}
                        >
                          {p}
                        </Link>
                      )
                    )}

                    {/* Next Button */}
                    {currentPage < totalPages ? (
                      <Link
                        href={getPageUrl(currentPage + 1)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-neutral-700 bg-luxury-surface text-xs text-neutral-200 hover:border-luxury-gold hover:text-luxury-gold transition-colors"
                        aria-label="Next page"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-neutral-800 bg-neutral-900/50 text-xs text-neutral-600 cursor-not-allowed"
                        aria-disabled="true"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </nav>
              )}
            </>
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
                  <Link
                    href="/shop"
                    onClick={() => setMobileFilterOpen(false)}
                    className={`block w-full text-left text-xs py-1.5 px-2 rounded ${
                      activeCategory === 'all'
                        ? 'bg-luxury-gold text-luxury-black font-semibold'
                        : 'text-neutral-300'
                    }`}
                  >
                    All Categories
                  </Link>
                  {categories.map((c) => (
                    <Link
                      key={c.id}
                      href={`/category/${c.slug}`}
                      onClick={() => setMobileFilterOpen(false)}
                      className={`block w-full text-left text-xs py-1.5 px-2 rounded ${
                        activeCategory === c.slug
                          ? 'bg-luxury-gold text-luxury-black font-semibold'
                          : 'text-neutral-300'
                      }`}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Collection */}
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
                    <Link
                      key={g.value}
                      href={buildFilterUrl({ gender: g.value, page: 1 })}
                      onClick={() => setMobileFilterOpen(false)}
                      className={`block w-full text-left text-xs py-1.5 px-2 rounded ${
                        activeGender === g.value
                          ? 'bg-luxury-gold text-luxury-black font-semibold'
                          : 'text-neutral-300'
                      }`}
                    >
                      {g.label}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Material */}
              {materialsList.length > 0 && (
                <div className="space-y-2 border-t border-luxury-border pt-4">
                  <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                    Material
                  </h4>
                  <div className="space-y-1">
                    <Link
                      href={buildFilterUrl({ material: 'all', page: 1 })}
                      onClick={() => setMobileFilterOpen(false)}
                      className={`block w-full text-left text-xs py-1.5 px-2 rounded ${
                        activeMaterial === 'all'
                          ? 'bg-luxury-gold text-luxury-black font-semibold'
                          : 'text-neutral-300'
                      }`}
                    >
                      All Materials
                    </Link>
                    {materialsList.map((mat) => (
                      <Link
                        key={mat}
                        href={buildFilterUrl({ material: mat, page: 1 })}
                        onClick={() => setMobileFilterOpen(false)}
                        className={`block w-full text-left text-xs py-1.5 px-2 rounded ${
                          activeMaterial === mat
                            ? 'bg-luxury-gold text-luxury-black font-semibold'
                            : 'text-neutral-300'
                        }`}
                      >
                        {mat}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Range */}
              <div className="space-y-3 border-t border-luxury-border pt-4">
                <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                  Price Range (LKR)
                </h4>
                <div className="space-y-1">
                  {pricePresets.map((preset) => {
                    const active = isPresetActive(preset.min, preset.max);
                    return (
                      <Link
                        key={preset.label}
                        href={buildFilterUrl({
                          minPrice: preset.min,
                          maxPrice: preset.max,
                          page: 1,
                        })}
                        onClick={() => setMobileFilterOpen(false)}
                        className={`block w-full text-left text-xs py-1.5 px-2 rounded ${
                          active
                            ? 'bg-luxury-gold text-luxury-black font-semibold'
                            : 'text-neutral-300'
                        }`}
                      >
                        {preset.label}
                      </Link>
                    );
                  })}
                </div>

                {/* Custom Min / Max Price Inputs */}
                <form onSubmit={handleApplyCustomPrice} className="pt-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Min"
                      value={customMinPrice}
                      onChange={(e) => setCustomMinPrice(e.target.value)}
                      className="w-1/2 bg-luxury-surface border border-neutral-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-luxury-gold"
                      aria-label="Minimum price in LKR"
                    />
                    <span className="text-neutral-500">–</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Max"
                      value={customMaxPrice}
                      onChange={(e) => setCustomMaxPrice(e.target.value)}
                      className="w-1/2 bg-luxury-surface border border-neutral-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-luxury-gold"
                      aria-label="Maximum price in LKR"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full text-[11px] h-7 border-neutral-700 hover:border-luxury-gold hover:text-luxury-gold"
                  >
                    Apply Price Filter
                  </Button>
                </form>
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
