'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function CacheControls() {
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/cache/revalidate', { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('Cache cleared — dashboard, FIRE, goals, and forecast will recompute on next load');
    } catch {
      toast.error('Failed to clear cache');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-border-soft">
      <h2 className="text-sm font-semibold text-foreground">Cache</h2>
      <p className="mt-1 text-xs text-fg-3">
        Dashboard, FIRE, forecast, and goal calculations are cached nearly indefinitely and
        normally invalidate themselves automatically on an upload, a reading, or a settings
        change. Use this only if something looks stale and you suspect a change bypassed the
        app (e.g. a direct database edit or migration).
      </p>
      <button
        type="button"
        onClick={handleClear}
        disabled={clearing}
        className="mt-3 px-4 py-2 text-sm bg-surface-2 text-fg-2 rounded hover:bg-[var(--border)] disabled:opacity-50"
      >
        {clearing ? 'Clearing…' : 'Clear cache'}
      </button>
    </div>
  );
}
