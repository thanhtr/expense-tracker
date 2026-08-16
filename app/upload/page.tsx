'use client';

import { useSearchParams } from 'next/navigation';
import { UploadForm } from '@/components/UploadForm';
import { Suspense } from 'react';

const BANK_LABELS: Record<string, string> = { op: 'OP Bank', amex: 'Amex', finnair: 'Finnair Visa' };

function UploadPageInner() {
  const params = useSearchParams();
  const imported = params.get('imported');
  const account = params.get('account');
  const error = params.get('error');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">Upload CSV</h1>

      {imported && (
        <div className="mb-6 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-800 dark:text-green-300">
            Imported <strong>{imported}</strong> new transaction{Number(imported) !== 1 ? 's' : ''}
            {account ? ` from ${BANK_LABELS[account] ?? account}` : ''}.{' '}
            <a href="/transactions" className="underline">View transactions →</a>
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-300">{decodeURIComponent(error)}</p>
        </div>
      )}

      <UploadForm />
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageInner />
    </Suspense>
  );
}
