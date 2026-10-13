'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  imageUrl?: string | null;
  slug: string;
  quantity: number;
  maxStock?: number;
}

export type AddToCartInput = Omit<CartItem, 'quantity'>;

export interface AddToCartResult {
  success: boolean;
  addedQuantity: number;
  totalQuantity: number;
  error?: string;
}

export interface UpdateQuantityResult {
  success: boolean;
  updatedQuantity: number;
  error?: string;
}

import {
  calculateStockAdjustments,
  type SyncCartStockAdjustment,
} from './validation';

export type { SyncCartStockAdjustment };
export { calculateStockAdjustments };

export interface SyncCartStockResult {
  adjustedItems: SyncCartStockAdjustment[];
}

interface CartContextType {
  items: CartItem[];
  isLoaded: boolean;
  totalCount: number;
  subtotal: number;
  addItem: (item: AddToCartInput, quantity?: number) => AddToCartResult;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => UpdateQuantityResult;
  updateItemStock: (variantId: string, maxStock: number) => void;
  syncCartStock: (stockMap: Record<string, number>) => SyncCartStockResult;
  clearCart: () => void;
}

const CART_STORAGE_KEY = 'splender_cart_v1';

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const itemsRef = React.useRef<CartItem[]>(items);

  // Keep itemsRef synchronized with current items state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Sanitize hydrated items: positive integers only
          const sanitized = parsed.filter(
            (i: any) =>
              i &&
              typeof i.variantId === 'string' &&
              Number.isInteger(Number(i.quantity)) &&
              Number(i.quantity) > 0
          );
          itemsRef.current = sanitized;
          setItems(sanitized);
        }
      }
    } catch (e) {
      console.warn('[Cart] Failed to restore cart from localStorage:', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Multi-tab synchronization
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === CART_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.filter(
              (i: any) =>
                i &&
                typeof i.variantId === 'string' &&
                Number.isInteger(Number(i.quantity)) &&
                Number(i.quantity) > 0
            );
            itemsRef.current = sanitized;
            setItems(sanitized);
          }
        } catch {}
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Atomically persist cart to React state and localStorage
  const persistItems = useCallback((newItems: CartItem[]) => {
    itemsRef.current = newItems;
    setItems(newItems);
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newItems));
      window.dispatchEvent(new Event('splender:cart-updated'));
    } catch (e) {
      console.warn('[Cart] Failed to persist cart to localStorage:', e);
    }
  }, []);

  // Add item to bag with stock bounds & duplicate accumulation validation
  const addItem = useCallback(
    (item: AddToCartInput, quantityToAdd: number = 1): AddToCartResult => {
      const rawQty = Number(quantityToAdd);

      // Validate quantity is a positive whole integer
      if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 999999) {
        return {
          success: false,
          addedQuantity: 0,
          totalQuantity: 0,
          error: 'Quantity must be a positive whole number.',
        };
      }

      const currentItems = itemsRef.current;
      const existingIndex = currentItems.findIndex((i) => i.variantId === item.variantId);
      let updated: CartItem[];
      let opResult: AddToCartResult;

      if (existingIndex > -1) {
        const existing = currentItems[existingIndex];
        const currentQty = existing.quantity;
        const effectiveMaxStock =
          item.maxStock !== undefined ? item.maxStock : existing.maxStock;

        if (effectiveMaxStock !== undefined) {
          const maxAllowed = Math.max(0, effectiveMaxStock);

          if (maxAllowed === 0) {
            return {
              success: false,
              addedQuantity: 0,
              totalQuantity: currentQty,
              error: 'This item is currently out of stock.',
            };
          }

          if (currentQty >= maxAllowed) {
            return {
              success: false,
              addedQuantity: 0,
              totalQuantity: currentQty,
              error: `All ${maxAllowed} available units are already in your bag.`,
            };
          }

          const combined = currentQty + rawQty;
          if (combined > maxAllowed) {
            const canAdd = Math.max(0, maxAllowed - currentQty);
            return {
              success: false,
              addedQuantity: 0,
              totalQuantity: currentQty,
              error: `Cannot add ${rawQty} units. Only ${canAdd} more available in stock (${currentQty} already in your bag).`,
            };
          }
        }

        const newTotal = currentQty + rawQty;
        updated = [...currentItems];
        updated[existingIndex] = {
          ...existing,
          ...item,
          quantity: newTotal,
          maxStock: effectiveMaxStock,
        };
        opResult = {
          success: true,
          addedQuantity: rawQty,
          totalQuantity: newTotal,
        };
      } else {
        // New item to cart
        if (item.maxStock !== undefined) {
          const maxAllowed = Math.max(0, item.maxStock);
          if (maxAllowed === 0) {
            return {
              success: false,
              addedQuantity: 0,
              totalQuantity: 0,
              error: 'This item is currently out of stock.',
            };
          }
          if (rawQty > maxAllowed) {
            return {
              success: false,
              addedQuantity: 0,
              totalQuantity: 0,
              error: `Requested quantity (${rawQty}) exceeds available stock (${maxAllowed}).`,
            };
          }
        }

        updated = [...currentItems, { ...item, quantity: rawQty }];
        opResult = {
          success: true,
          addedQuantity: rawQty,
          totalQuantity: rawQty,
        };
      }

      persistItems(updated);
      return opResult;
    },
    [persistItems]
  );

  // Remove item from bag
  const removeItem = useCallback(
    (variantId: string) => {
      const updated = itemsRef.current.filter((i) => i.variantId !== variantId);
      persistItems(updated);
    },
    [persistItems]
  );

  // Update item quantity (0 removes the item) with bounds checking
  const updateQuantity = useCallback(
    (variantId: string, quantity: number): UpdateQuantityResult => {
      const rawQty = Number(quantity);

      if (rawQty === 0) {
        removeItem(variantId);
        return { success: true, updatedQuantity: 0 };
      }

      if (!Number.isInteger(rawQty) || rawQty < 0 || rawQty > 999999) {
        return {
          success: false,
          updatedQuantity: 0,
          error: 'Quantity must be a positive whole number.',
        };
      }

      const currentItems = itemsRef.current;
      const existing = currentItems.find((i) => i.variantId === variantId);
      if (!existing) {
        return {
          success: false,
          updatedQuantity: 0,
          error: 'Item not found in bag.',
        };
      }

      if (existing.maxStock !== undefined) {
        const maxAllowed = Math.max(0, existing.maxStock);
        if (maxAllowed === 0) {
          return {
            success: false,
            updatedQuantity: existing.quantity,
            error: 'This item is currently out of stock. Please remove it from your bag.',
          };
        }
        if (rawQty > maxAllowed) {
          return {
            success: false,
            updatedQuantity: existing.quantity,
            error: `All ${maxAllowed} available units are already in your bag.`,
          };
        }
      }

      const updated = currentItems.map((item) =>
        item.variantId === variantId ? { ...item, quantity: rawQty } : item
      );
      persistItems(updated);

      return {
        success: true,
        updatedQuantity: rawQty,
      };
    },
    [removeItem, persistItems]
  );

  // Update item known stock ceiling
  const updateItemStock = useCallback(
    (variantId: string, maxStock: number) => {
      const updated = itemsRef.current.map((item) =>
        item.variantId === variantId ? { ...item, maxStock } : item
      );
      persistItems(updated);
    },
    [persistItems]
  );

  // Synchronize cart with verified server inventory (clamps stale quantities synchronously)
  const syncCartStock = useCallback(
    (stockMap: Record<string, number>): SyncCartStockResult => {
      const current = itemsRef.current;
      const { updatedItems, adjustedItems, hasChanges } = calculateStockAdjustments(
        current,
        stockMap
      );

      if (hasChanges) {
        persistItems(updatedItems);
      }

      return { adjustedItems };
    },
    [persistItems]
  );

  // Clear entire cart (e.g., after order checkout completes)
  const clearCart = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      window.dispatchEvent(new Event('splender:cart-updated'));
    } catch (e) {
      console.warn('[Cart] Failed to clear localStorage cart:', e);
    }
  }, []);

  // Calculate metrics
  const totalCount = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const effectivePrice =
        item.discountPrice != null && item.discountPrice > 0
          ? item.discountPrice
          : item.price;
      return sum + effectivePrice * item.quantity;
    }, 0);
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      isLoaded,
      totalCount,
      subtotal,
      addItem,
      removeItem,
      updateQuantity,
      updateItemStock,
      syncCartStock,
      clearCart,
    }),
    [items, isLoaded, totalCount, subtotal, addItem, removeItem, updateQuantity, updateItemStock, syncCartStock, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
