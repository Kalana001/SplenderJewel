'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  CartItem,
  AddToCartInput,
  AddToCartResult,
  UpdateQuantityResult,
} from '@/types/cart';
import { createClient } from '@/lib/supabase/client';
import {
  getAuthenticatedCartAction,
  saveAuthenticatedCartAction,
  mergeGuestCartAction,
  syncCartItemAction,
  removeCartItemAction,
  deductPurchasedCartItemsAction,
  removePurchasedCartItemsAction,
  clearCartAction,
} from './actions';
import {
  calculateStockAdjustments,
  type SyncCartStockAdjustment,
} from './validation';

export type { CartItem, AddToCartInput, AddToCartResult, UpdateQuantityResult, SyncCartStockAdjustment };
export { calculateStockAdjustments };

export interface SyncCartStockResult {
  adjustedItems: SyncCartStockAdjustment[];
}

interface CartContextType {
  items: CartItem[];
  isLoaded: boolean;
  totalCount: number;
  subtotal: number;
  syncError: string | null;
  isSyncing: boolean;
  retrySync: () => Promise<void>;
  addItem: (item: AddToCartInput, quantity?: number) => AddToCartResult;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => UpdateQuantityResult;
  updateItemStock: (variantId: string, maxStock: number) => void;
  syncCartStock: (stockMap: Record<string, number>) => SyncCartStockResult;
  clearCart: () => void;
  clearPurchasedItems: (
    purchasedItems: ({ variantId: string; quantity: number } | string)[],
    orderNumber?: string
  ) => void;
}

const CART_STORAGE_KEY = 'splender_cart_v1';
const GUEST_CART_FLAG = 'splender_guest_cart_active';
const GUEST_MERGE_TOKEN = 'splender_guest_merge_token';

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const itemsRef = useRef<CartItem[]>(items);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isAuthenticatedRef = useRef(false);

  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const mutationQueueRef = useRef<Promise<any>>(Promise.resolve());

  // Keep itemsRef synchronized with current items state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  // Enqueue server mutations to guarantee strict sequential FIFO execution (no out-of-order writes)
  const queueMutation = useCallback((mutationFn: () => Promise<{ success: boolean; error?: string }>) => {
    if (!isAuthenticatedRef.current) return;
    setIsSyncing(true);
    mutationQueueRef.current = mutationQueueRef.current
      .then(async () => {
        let attempts = 0;
        while (attempts < 2) {
          try {
            const res = await mutationFn();
            if (res.success) {
              setSyncError(null);
              return;
            }
            attempts++;
            if (attempts >= 2) {
              setSyncError(res.error || 'Failed to sync bag changes to your account. Your items are saved locally.');
            } else {
              await new Promise((r) => setTimeout(r, 500));
            }
          } catch (err: any) {
            attempts++;
            if (attempts >= 2) {
              setSyncError('Network connection issue. Your bag items are saved locally.');
            } else {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
      })
      .finally(() => {
        setIsSyncing(false);
      });
  }, []);

  // Explicit retry of cart state to server
  const retrySync = useCallback(async () => {
    if (!isAuthenticatedRef.current) return;
    setSyncError(null);
    setIsSyncing(true);
    try {
      const hasActiveGuestBag = typeof window !== 'undefined' && localStorage.getItem(GUEST_CART_FLAG) === 'true';
      if (hasActiveGuestBag && itemsRef.current.length > 0) {
        // Retry pending guest merge using persistent token
        let mergeToken = localStorage.getItem(GUEST_MERGE_TOKEN);
        if (!mergeToken) {
          mergeToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `merge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          localStorage.setItem(GUEST_MERGE_TOKEN, mergeToken);
        }
        const res = await mergeGuestCartAction(itemsRef.current, { mergeToken });
        if (res.success && res.items) {
          localStorage.removeItem(GUEST_CART_FLAG);
          localStorage.removeItem(GUEST_MERGE_TOKEN);
          setSyncError(null);
          itemsRef.current = res.items;
          setItems(res.items);
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(res.items));
          window.dispatchEvent(new Event('splender:cart-updated'));
          return;
        } else {
          setSyncError(res.error || 'Failed to merge your guest shopping bag with your account. Your items are saved locally.');
          return;
        }
      }

      // Standard sync retry
      const res = await saveAuthenticatedCartAction(itemsRef.current);
      if (res.success) {
        setSyncError(null);
      } else {
        setSyncError(res.error || 'Unable to sync shopping bag with your account.');
      }
    } catch {
      setSyncError('Network connection issue. Your items are saved locally.');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Atomically persist cart to React state and localStorage
  const persistItems = useCallback(
    (newItems: CartItem[]) => {
      itemsRef.current = newItems;
      setItems(newItems);
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newItems));
        if (!isAuthenticatedRef.current && newItems.length > 0) {
          localStorage.setItem(GUEST_CART_FLAG, 'true');
        }
        window.dispatchEvent(new Event('splender:cart-updated'));
      } catch (e) {
        console.warn('[Cart] Failed to persist cart to localStorage:', e);
      }
    },
    []
  );

  // Hydrate from localStorage on client mount, then initialize authenticated state
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

  // Cross-device & authentication synchronization
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let isMounted = true;

    const handleAuthenticatedSession = async () => {
      isAuthenticatedRef.current = true;
      setIsAuthenticated(true);
      try {
        const local = itemsRef.current;
        const hasActiveGuestBag = typeof window !== 'undefined' && localStorage.getItem(GUEST_CART_FLAG) === 'true';

        if (hasActiveGuestBag && local && local.length > 0) {
          // Attempt guest merge: persist unique mergeToken across retries until confirmed success
          let mergeToken = localStorage.getItem(GUEST_MERGE_TOKEN);
          if (!mergeToken) {
            mergeToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `merge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            localStorage.setItem(GUEST_MERGE_TOKEN, mergeToken);
          }
          const res = await mergeGuestCartAction(local, { mergeToken });
          if (isMounted && res.success && res.items) {
            localStorage.removeItem(GUEST_CART_FLAG);
            localStorage.removeItem(GUEST_MERGE_TOKEN);
            setSyncError(null);
            itemsRef.current = res.items;
            setItems(res.items);
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(res.items));
            window.dispatchEvent(new Event('splender:cart-updated'));
          } else if (isMounted) {
            // Preservation on merge failure: keep GUEST_CART_FLAG and local items intact; display actionable error
            setSyncError(res.error || 'Failed to merge your guest shopping bag with your account. Your items are saved locally.');
          }
        } else {
          // Normal hydration / already logged in: load authoritative server cart directly (never duplicate quantities)
          const res = await getAuthenticatedCartAction();
          if (isMounted && res.success && res.items) {
            itemsRef.current = res.items;
            setItems(res.items);
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(res.items));
            window.dispatchEvent(new Event('splender:cart-updated'));
          }
        }
      } catch (err) {
        console.warn('[Cart] Failed to initialize authenticated cart:', err);
        if (isMounted) {
          setSyncError('Network connection issue while syncing shopping bag. Your items are saved locally.');
        }
      }
    };

    const handleUnauthenticatedSession = () => {
      isAuthenticatedRef.current = false;
      setIsAuthenticated(false);
    };

    // 1. Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        handleAuthenticatedSession();
      } else {
        handleUnauthenticatedSession();
      }
    });

    // 2. Listen for auth changes (SIGNED_IN, SIGNED_OUT, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.user) {
          await handleAuthenticatedSession();
        }
      } else if (event === 'SIGNED_OUT') {
        handleUnauthenticatedSession();
        // On logout: cancel queue, wipe in-memory state and localStorage to prevent cross-account leak
        mutationQueueRef.current = Promise.resolve();
        itemsRef.current = [];
        setItems([]);
        setSyncError(null);
        try {
          localStorage.removeItem(CART_STORAGE_KEY);
          localStorage.removeItem(GUEST_CART_FLAG);
          localStorage.removeItem(GUEST_MERGE_TOKEN);
          window.dispatchEvent(new Event('splender:cart-updated'));
        } catch {}
      }
    });

    // 3. Listen for custom sign-out event from SignOutButton
    const handleCustomSignOut = () => {
      handleUnauthenticatedSession();
      mutationQueueRef.current = Promise.resolve();
      itemsRef.current = [];
      setItems([]);
      setSyncError(null);
      try {
        localStorage.removeItem(CART_STORAGE_KEY);
        localStorage.removeItem(GUEST_CART_FLAG);
        localStorage.removeItem(GUEST_MERGE_TOKEN);
        window.dispatchEvent(new Event('splender:cart-updated'));
      } catch {}
    };
    window.addEventListener('splender:auth-signed-out', handleCustomSignOut);

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      window.removeEventListener('splender:auth-signed-out', handleCustomSignOut);
    };
  }, []);

  // Cross-device synchronization on already-open tabs/windows (visibilitychange & focus)
  useEffect(() => {
    const handleTabFocus = async () => {
      if (document.visibilityState === 'visible' && isAuthenticatedRef.current) {
        try {
          const res = await getAuthenticatedCartAction();
          if (res.success && res.items) {
            itemsRef.current = res.items;
            setItems(res.items);
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(res.items));
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleTabFocus);
    window.addEventListener('focus', handleTabFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleTabFocus);
      window.removeEventListener('focus', handleTabFocus);
    };
  }, []);

  // Multi-tab synchronization on same device (localStorage storage event)
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
      queueMutation(() => syncCartItemAction(item.variantId, opResult.totalQuantity));
      return opResult;
    },
    [persistItems, queueMutation]
  );

  // Remove item from bag
  const removeItem = useCallback(
    (variantId: string) => {
      const updated = itemsRef.current.filter((i) => i.variantId !== variantId);
      persistItems(updated);
      queueMutation(() => removeCartItemAction(variantId));
    },
    [persistItems, queueMutation]
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
      queueMutation(() => syncCartItemAction(variantId, rawQty));

      return {
        success: true,
        updatedQuantity: rawQty,
      };
    },
    [removeItem, persistItems, queueMutation]
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

  // Clear entire cart (e.g., when customer explicitly empties shopping bag)
  const clearCart = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(GUEST_CART_FLAG);
      window.dispatchEvent(new Event('splender:cart-updated'));
    } catch (e) {
      console.warn('[Cart] Failed to clear localStorage cart:', e);
    }
    queueMutation(() => clearCartAction());
  }, [queueMutation]);

  // Deduct purchased items upon checkout success (protects newly added items of same or different variants from other devices)
  const lastDeductedOrderRef = useRef<string | null>(null);

  const clearPurchasedItems = useCallback(
    (purchasedInput: ({ variantId: string; quantity: number } | string)[], orderNumber?: string) => {
      if (!purchasedInput || purchasedInput.length === 0) return;

      // Idempotency: skip if already deducted for this orderNumber on this client
      if (orderNumber && lastDeductedOrderRef.current === orderNumber) {
        return;
      }
      if (orderNumber) {
        lastDeductedOrderRef.current = orderNumber;
      }

      // Normalize input
      const normalizedItems: { variantId: string; quantity: number }[] = purchasedInput.map((p) => {
        if (typeof p === 'string') {
          return { variantId: p, quantity: 999999 };
        }
        return { variantId: p.variantId, quantity: Number(p.quantity) || 1 };
      });

      const purchasedMap = new Map<string, number>();
      for (const item of normalizedItems) {
        const cur = purchasedMap.get(item.variantId) || 0;
        purchasedMap.set(item.variantId, cur + item.quantity);
      }

      // Locally deduct purchased quantities, preserving any surplus/newer quantities (e.g. from Device B)
      const remaining: CartItem[] = [];
      for (const item of itemsRef.current) {
        const pQty = purchasedMap.get(item.variantId) || 0;
        if (pQty === 0) {
          remaining.push(item);
        } else if (item.quantity > pQty) {
          remaining.push({
            ...item,
            quantity: item.quantity - pQty,
          });
        }
      }

      itemsRef.current = remaining;
      setItems(remaining);
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(remaining));
        if (remaining.length === 0) {
          localStorage.removeItem(GUEST_CART_FLAG);
        }
        window.dispatchEvent(new Event('splender:cart-updated'));
      } catch (e) {
        console.warn('[Cart] Failed to update localStorage cart:', e);
      }

      queueMutation(() => deductPurchasedCartItemsAction(normalizedItems, orderNumber));
    },
    [queueMutation]
  );

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
      syncError,
      isSyncing,
      retrySync,
      addItem,
      removeItem,
      updateQuantity,
      updateItemStock,
      syncCartStock,
      clearCart,
      clearPurchasedItems,
    }),
    [
      items,
      isLoaded,
      totalCount,
      subtotal,
      syncError,
      isSyncing,
      retrySync,
      addItem,
      removeItem,
      updateQuantity,
      updateItemStock,
      syncCartStock,
      clearCart,
      clearPurchasedItems,
    ]
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
