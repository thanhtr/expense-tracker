import { redirect } from 'next/navigation';

export default function KeywordsPage() {
  redirect('/settings?tab=keywords');
}
