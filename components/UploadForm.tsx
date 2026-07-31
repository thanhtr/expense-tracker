'use client';

import { useState, useRef } from 'react';

interface UploadFormProps {
  onSuccess?: () => void;
}

interface UploadResult {
  created: number;
  skipped: number;
  total: number;
  message: string;
}

export function UploadForm({ onSuccess }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [accountType, setAccountType] = useState('op');
  const [accountOwner, setAccountOwner] = useState('tung');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('account_type', accountType);
      formData.append('account_owner', accountOwner);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        if (onSuccess) {
          onSuccess();
        }
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Upload failed');
      }
    } catch (error) {
      setError('An error occurred during upload');
      console.error('Upload error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="op">OP Bank</option>
                <option value="amex">Amex</option>
                <option value="finnair">Finnair Visa</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Owner</label>
              <select
                value={accountOwner}
                onChange={(e) => setAccountOwner(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tung">Tung (Me)</option>
                <option value="thuy">Thuy (Wife)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">CSV File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {file && <p className="mt-2 text-sm text-gray-600">Selected: {file.name}</p>}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !file}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Uploading...' : 'Upload CSV'}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-4">Upload Result</h3>
          <div className="space-y-2 text-sm text-green-800">
            <div>✓ <strong>{result.created}</strong> transaction(s) imported</div>
            {result.skipped > 0 && (
              <div>⚠ <strong>{result.skipped}</strong> duplicate(s) skipped</div>
            )}
            <div className="text-gray-700 mt-2">Total processed: {result.total}</div>
          </div>
          <a
            href="/transactions"
            className="inline-block mt-4 px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-md hover:bg-green-800"
          >
            View transactions →
          </a>
        </div>
      )}
    </div>
  );
}
