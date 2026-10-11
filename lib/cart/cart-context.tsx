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
}

export type AddToCartInput = Omit<CartItem, 'quantity'>;

interface CartContextType {
  items: CartItem[];
  isLoaded: boolean;
  totalCount: number;
  subtotal: number;
  addItem: (item: AddToCartInput, quantity?: number) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
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
          setItems(parsed);
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

  // Add item to bag
  const addItem = useCallback(
    (item: AddToCartInput, quantityToAdd: number = 1) => {
      const qty = Math.max(1, quantityToAdd);
      setItems((prevItems) => {
        const existingIndex = prevItems.findIndex((i) => i.variantId === item.variantId);
        let updated: CartItem[];
        if (existingIndex > -1) {
          updated = [...prevItems];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + qty,
          };
        } else {
          updated = [...prevItems, { ...item, quantity: qty }];
        }
        try {
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updated));
          window.dispatchEvent(new Event('splender:cart-updated'));
        } catch (e) {
          console.warn('[Cart] Storage save failed:', e);
        }
        return updated;
      });
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

  // Update item quantity (0 removes the item)
  const updateQuantity = useCallback(
    (variantId: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(variantId);
        return;
      }
      setItems((prev) => {
        const updated = prev.map((item) =>
          item.variantId === variantId ? { ...item, quantity } : item
        );
        saveItems(updated);
        return updated;
      });
    },
    [removeItem, saveItems]
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
      clearCart,
    }),
    [items, isLoaded, totalCount, subtotal, addItem, removeItem, updateQuantity, clearCart]
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
