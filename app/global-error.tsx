'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0e0f14', color: '#ece9e4' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '12px' }}>
          <div style={{ fontSize: '2.5rem' }}>⚠</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Something went wrong</h2>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#666', margin: 0, fontFamily: 'monospace' }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={unstable_retry}
            style={{ marginTop: '8px', padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
