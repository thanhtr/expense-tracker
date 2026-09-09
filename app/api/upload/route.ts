import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processUpload } from '@/lib/services/upload-service';
import { columnMappingSchema } from '@/lib/validation';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  // Token auth for iOS Shortcut; session auth (via proxy.ts) for browser requests
  const token = request.headers.get('x-api-token');
  if (token && token !== process.env.API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const contentType = request.headers.get('content-type') ?? '';

    let fileContent: string;
    let accountType: string;
    let accountOwner: string;
    let isDryRun: boolean;
    let filename = 'upload.csv';
    let columnMapping: z.infer<typeof columnMappingSchema> | undefined;

    if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      // Raw body mode (used by iOS Shortcut — simpler than multipart form)
      fileContent = await request.text();
      accountType = url.searchParams.get('account_type') ?? '';
      accountOwner = url.searchParams.get('account_owner') ?? 'tung';
      isDryRun = url.searchParams.get('dry_run') === 'true';
      filename = url.searchParams.get('filename') ?? `${accountType || 'upload'}.csv`;
    } else {
      // Multipart form mode (used by the web upload UI)
      const formData = await request.formData();
      const file = formData.get('file') as File;
      accountType = (formData.get('account_type') as string) || '';
      accountOwner = (formData.get('account_owner') as string) || 'tung';
      isDryRun = formData.get('dry_run') === 'true';
      const columnMappingStr = formData.get('column_mapping') as string | null;
      if (columnMappingStr) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(columnMappingStr);
        } catch {
          return NextResponse.json({ error: 'Invalid column mapping JSON' }, { status: 400 });
        }
        const result = columnMappingSchema.safeParse(parsed);
        if (!result.success) {
          const details = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
          return NextResponse.json({ error: 'Invalid column mapping', details }, { status: 400 });
        }
        columnMapping = result.data;
      }

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      filename = file.name;

      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum allowed size is 10 MB.' },
          { status: 413 }
        );
      }

      fileContent = await file.text();
    }

    const result = await processUpload(fileContent, accountType, accountOwner, isDryRun, columnMapping);

    if (isDryRun) {
      return NextResponse.json(result);
    }

    const r = result as { created: number; skipped: number; errors: number; total: number; dateFrom?: string; dateTo?: string };

    // Log the import — non-blocking, failure must not affect the response
    prisma.csvImport.create({
      data: {
        bank: result.detectedBank,
        filename,
        owner: accountOwner,
        created: r.created,
        skipped: r.skipped,
        dateFrom: r.dateFrom ? new Date(r.dateFrom) : null,
        dateTo:   r.dateTo   ? new Date(r.dateTo)   : null,
      },
    }).catch(err => console.error('Failed to log CsvImport:', err));

    return NextResponse.json({
      created: r.created,
      skipped: r.skipped,
      errors: r.errors,
      total: r.total,
      detectedBank: result.detectedBank,
      message: r.total === 0
        ? 'No transactions found in file. Check format and column names.'
        : `Successfully processed ${r.total} transactions`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to process upload';
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      { error: errorMsg, debug: { message: 'Check server logs at /api/health for configuration issues' } },
      { status: 500 }
    );
  }
}
