// src/app/api/envcheck/route.ts 
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasSr  = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const hasKosis = !!process.env.KOSIS_API_KEY
  return NextResponse.json({
    ok: hasUrl && hasAnon && hasSr && hasKosis,
    NEXT_PUBLIC_SUPABASE_URL: hasUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: hasAnon,
    SUPABASE_SERVICE_ROLE_KEY: hasSr,
    KOSIS_API_KEY: hasKosis
  })
}
