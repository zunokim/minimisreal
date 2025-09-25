// src/app/api/kosis/hcsi/list/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}
function q(req: NextRequest, name: string): string | undefined {
  const v = req.nextUrl.searchParams.get(name)
  return v ? v.trim() : undefined
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const start = q(req, 'start')
    const end = q(req, 'end')
    const region = q(req, 'region')

    let query = supabase.from('kosis_hcsi').select('prd_de, region_code, region_name, itm_id, itm_name, unit, value').order('prd_de', { ascending: true })
    if (start) query = query.gte('prd_de', start)
    if (end) query = query.lte('prd_de', end)
    if (region) query = query.eq('region_code', region)

    const { data, error } = await query.limit(5000)
    if (error) return NextResponse.json({ ok: false, status: 500, message: 'select failed', details: error }, { status: 500 })
    return NextResponse.json({ ok: true, status: 200, data })
  } catch (e) {
    return NextResponse.json({ ok: false, status: 500, message: String(e) }, { status: 500 })
  }
}
