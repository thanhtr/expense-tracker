import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { processUpload } from '@/lib/services/upload-service';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.redirect(new URL('/upload?error=no_file', request.url));
    }

    const fileContent = await file.text();
    const result = await processUpload(fileContent, 'auto', 'tung', false);
    const created = 'created' in result ? result.created : 0;

    return NextResponse.redirect(
      new URL(`/upload?imported=${created}&account=${result.detectedBank}`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.redirect(new URL(`/upload?error=${encodeURIComponent(msg)}`, request.url));
  }
}
