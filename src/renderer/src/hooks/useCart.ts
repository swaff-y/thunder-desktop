import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import React from "react";
import type { ContentRecord } from "../types";

const MAX_CART_SIZE = 4;
const STORAGE_KEY = "thunder_cart";

interface CartContextValue {
  items: ContentRecord[];
  add: (record: ContentRecord) => void;
  remove: (recordId: string) => void;
  clear: () => void;
  has: (recordId: string) => boolean;
  isFull: boolean;
  canWatch: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): ContentRecord[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ContentRecord[]>(loadCart);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = useCallback((record: ContentRecord) => {
    setItems((prev) => {
      if (prev.length >= MAX_CART_SIZE) return prev;
      if (prev.some((r) => r.id === record.id)) return prev;
      return [...prev, record];
    });
  }, []);

  const remove = useCallback((recordId: string) => {
    setItems((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const has = useCallback(
    (recordId: string) => items.some((r) => r.id === recordId),
    [items]
  );

  return React.createElement(
    CartContext.Provider,
    {
      value: {
        items,
        add,
        remove,
        clear,
        has,
        isFull: items.length >= MAX_CART_SIZE,
        canWatch: items.length >= 2,
      },
    },
    children
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
