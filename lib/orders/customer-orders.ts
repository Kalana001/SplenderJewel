/**
 * Customer Order History pagination & range utilities.
 * Ensures older orders remain accessible via explicit page navigation without
 * arbitrary truncation, and can be executed directly in Node unit tests.
 */

export const CUSTOMER_ORDERS_PAGE_SIZE = 10;

export interface OrdersPaginationRange {
  page: number;
  pageSize: number;
  from: number;
  to: number;
}

export interface OrdersPaginationMeta {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startItem: number;
  endItem: number;
}

/**
 * Safely parses the `?page=` query parameter into a positive integer >= 1.
 */
export function parseOrdersPageParam(rawPage?: string | string[] | null): number {
  const value = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  if (typeof value !== 'string' || !value.trim()) {
    return 1;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

/**
 * Computes the zero-based inclusive PostgREST `.range(from, to)` bounds for a given page.
 */
export function calculateOrdersPaginationRange(
  page: number,
  pageSize: number = CUSTOMER_ORDERS_PAGE_SIZE
): OrdersPaginationRange {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : CUSTOMER_ORDERS_PAGE_SIZE;
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  return {
    page: safePage,
    pageSize: safePageSize,
    from,
    to,
  };
}

/**
 * Builds pagination metadata for rendering accessible Previous / Next controls
 * and clamping out-of-range page numbers when totalCount is known.
 */
export function buildOrdersPaginationMeta(
  totalCount: number | null | undefined,
  requestedPage: number,
  pageSize: number = CUSTOMER_ORDERS_PAGE_SIZE
): OrdersPaginationMeta {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : CUSTOMER_ORDERS_PAGE_SIZE;
  const safeTotal = typeof totalCount === 'number' && Number.isFinite(totalCount) && totalCount > 0
    ? Math.floor(totalCount)
    : 0;

  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / safePageSize) : 1;
  const currentPage = Math.min(Math.max(1, Math.floor(requestedPage || 1)), totalPages);

  const startItem = safeTotal === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const endItem = safeTotal === 0 ? 0 : Math.min(currentPage * safePageSize, safeTotal);

  return {
    totalCount: safeTotal,
    totalPages,
    currentPage,
    pageSize: safePageSize,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
    startItem,
    endItem,
  };
}
