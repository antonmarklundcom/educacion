import { NextResponse } from 'next/server';

/** Routing skeleton only — real cron jobs (search rebuild, staleness, admissions…) ship with their owning PRs. */
export async function GET(_request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  return NextResponse.json({ status: 'not_implemented', job });
}
