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

export interface SyncCartStockResult {
  adjustedItems: { variantId: string; oldQty: number; newQty: number }[];
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
          setItems(sanitized);
        }
      }
    } catch (e) {
      console.warn('[Cart] Failed to restore cart from localStorage:', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage when items update
  const saveItems = useCallback((newItems: CartItem[]) => {
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

      let opResult: AddToCartResult = {
        success: true,
        addedQuantity: rawQty,
        totalQuantity: rawQty,
      };

      setItems((prevItems) => {
        const existingIndex = prevItems.findIndex((i) => i.variantId === item.variantId);
        let updated: CartItem[];

        if (existingIndex > -1) {
          const existing = prevItems[existingIndex];
          const currentQty = existing.quantity;
          const effectiveMaxStock =
            item.maxStock !== undefined ? item.maxStock : existing.maxStock;

          if (effectiveMaxStock !== undefined) {
            const maxAllowed = Math.max(0, effectiveMaxStock);

            if (currentQty >= maxAllowed) {
              opResult = {
                success: false,
                addedQuantity: 0,
                totalQuantity: currentQty,
                error: `You already have the maximum available stock (${maxAllowed}) in your shopping bag.`,
              };
              return prevItems;
            }

            const combined = currentQty + rawQty;
            if (combined > maxAllowed) {
              const canAdd = Math.max(0, maxAllowed - currentQty);
              opResult = {
                success: false,
                addedQuantity: 0,
                totalQuantity: currentQty,
                error: `Cannot add ${rawQty} units. Only ${canAdd} more available in stock (${currentQty} already in your bag).`,
              };
              return prevItems;
            }
          }

          const newTotal = currentQty + rawQty;
          updated = [...prevItems];
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
            if (rawQty > maxAllowed) {
              opResult = {
                success: false,
                addedQuantity: 0,
                totalQuantity: 0,
                error: `Requested quantity (${rawQty}) exceeds available stock (${maxAllowed}).`,
              };
              return prevItems;
            }
          }

          updated = [...prevItems, { ...item, quantity: rawQty }];
          opResult = {
            success: true,
            addedQuantity: rawQty,
            totalQuantity: rawQty,
          };
        }

        try {
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updated));
          window.dispatchEvent(new Event('splender:cart-updated'));
        } catch (e) {
          console.warn('[Cart] Storage save failed:', e);
        }
        return updated;
      });

      return opResult;
    },
    []
  );

  // Remove item from bag
  const removeItem = useCallback(
    (variantId: string) => {
      setItems((prev) => {
        const updated = prev.filter((i) => i.variantId !== variantId);
        saveItems(updated);
        return updated;
      });
    },
    [saveItems]
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

      let opResult: UpdateQuantityResult = {
        success: true,
        updatedQuantity: rawQty,
      };

      setItems((prev) => {
        const existing = prev.find((i) => i.variantId === variantId);
        if (!existing) {
          opResult = {
            success: false,
            updatedQuantity: 0,
            error: 'Item not found in bag.',
          };
          return prev;
        }

        if (existing.maxStock !== undefined) {
          const maxAllowed = Math.max(0, existing.maxStock);
          if (rawQty > maxAllowed) {
            opResult = {
              success: false,
              updatedQuantity: existing.quantity,
              error: `Only ${maxAllowed} units available in stock for ${existing.productName}.`,
            };
            return prev;
          }
        }

        const updated = prev.map((item) =>
          item.variantId === variantId ? { ...item, quantity: rawQty } : item
        );
        saveItems(updated);
        opResult = {
          success: true,
          updatedQuantity: rawQty,
        };
        return updated;
      });

      return opResult;
    },
    [removeItem, saveItems]
  );

  // Update item known stock ceiling
  const updateItemStock = useCallback(
    (variantId: string, maxStock: number) => {
      setItems((prev) => {
        const updated = prev.map((item) =>
          item.variantId === variantId ? { ...item, maxStock } : item
        );
        saveItems(updated);
        return updated;
      });
    },
    [saveItems]
  );

  // Synchronize cart with verified server inventory (clamps stale quantities)
  const syncCartStock = useCallback(
    (stockMap: Record<string, number>): SyncCartStockResult => {
      const adjustedItems: { variantId: string; oldQty: number; newQty: number }[] = [];
      setItems((prev) => {
        let changed = false;
        const updated = prev.map((item) => {
          if (item.variantId in stockMap) {
            const available = Math.max(0, stockMap[item.variantId]);
            const needClamp = item.quantity > available;
            const stockChanged = item.maxStock !== available;
            if (needClamp) {
              adjustedItems.push({
                variantId: item.variantId,
                oldQty: item.quantity,
                newQty: available,
              });
              changed = true;
              return { ...item, quantity: available, maxStock: available };
            }
            if (stockChanged) {
              changed = true;
              return { ...item, maxStock: available };
            }
          }
          return item;
        });
        if (changed) {
          saveItems(updated);
        }
        return updated;
      });
      return { adjustedItems };
    },
    [saveItems]
  );

  // Clear entire cart (e.g., after order checkout completes)
  const clearCart = useCallback(() => {
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
