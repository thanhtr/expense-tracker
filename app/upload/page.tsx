'use client';

import { UploadForm } from '@/components/UploadForm';

export default function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload CSV</h1>

      <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          Upload CSV files from your banks. Transactions are automatically deduplicated and categorized.
        </p>
      </div>

      <UploadForm />
    </div>
  );
}
