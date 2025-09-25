// src/app/api/kosis/unsold-after/list/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireEnv, q } from '@/lib/kosis'

export async function GET(req: NextRequest) {
  const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

  const start = q(req, 'start')
  const end = q(req, 'end')
  const region = q(req, 'region')

  let query = supabase.from('kosis_unsold_after').select('*').order('prd_de', { ascending: true })
  if (start) query = query.gte('prd_de', start)
  if (end) query = query.lte('prd_de', end)
  if (region) query = query.eq('region_code', region)

  const { data, error } = await query.limit(5000)
  if (error) return NextResponse.json({ ok: false, status: 500, message: '조회 실패', details: error }, { status: 500 })

  return NextResponse.json({ ok: true, status: 200, data })
}
