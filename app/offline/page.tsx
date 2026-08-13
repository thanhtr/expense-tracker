'use client';

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
      <div className="text-5xl">📶</div>
      <h1 className="text-2xl font-semibold text-foreground">You&apos;re offline</h1>
      <p className="text-fg-2 max-w-sm">
        Expense Tracker needs a connection to load your data. Check your internet and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
