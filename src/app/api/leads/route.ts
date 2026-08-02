import { NextResponse } from 'next/server';

/** Routing skeleton only — real lead capture (rate limiting, consent, persistence) ships in PR-14. */
export async function GET() {
  return NextResponse.json({ status: 'not_implemented' });
}

export async function POST() {
  return NextResponse.json({ status: 'not_implemented' });
}
