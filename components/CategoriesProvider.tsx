'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type CategoriesCtx = {
  categories: string[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<CategoriesCtx>({ categories: [], loading: true, refresh: async () => {} });

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <Ctx.Provider value={{ categories, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useCategories = () => useContext(Ctx);
