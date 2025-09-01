// src/app/api/rone/office-index/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const year = url.searchParams.get('year') // 예: 2024
    const from = url.searchParams.get('from') // 예: 202401
    const to = url.searchParams.get('to')     // 예: 202412
    const limit = Number(url.searchParams.get('limit') ?? '48')

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    let q = supabase.from('office_rent_index').select('*').order('period', { ascending: true }).order('region_code', { ascending: true })

    if (year) {
      q = q.gte('period', `${year}01`).lte('period', `${year}12`)
    } else if (from && to) {
      q = q.gte('period', from).lte('period', to)
    } else {
      // 기본: 최근 8개 분기 정도를 커버하도록 최근 24개월 범위
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const yyyymm = `${y}${m}`
      const y2 = y - 2
      q = q.gte('period', `${y2}01`).lte('period', yyyymm)
    }

    const { data, error } = await q.limit(limit)
    if (error) throw error
    return NextResponse.json({ count: data?.length ?? 0, rows: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
