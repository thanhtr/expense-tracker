'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center gap-4">
      <div className="text-4xl">⚠</div>
      <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
      {error.digest && (
        <p className="text-xs text-fg-3 font-mono">Error ID: {error.digest}</p>
      )}
      <button
        onClick={unstable_retry}
        className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
