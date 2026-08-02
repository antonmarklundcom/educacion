import { NextResponse } from 'next/server';

/** Routing skeleton only — real on-demand ISR revalidation ships alongside the admin writes it guards. */
export async function GET() {
  return NextResponse.json({ status: 'not_implemented' });
}

export async function POST() {
  return NextResponse.json({ status: 'not_implemented' });
}
