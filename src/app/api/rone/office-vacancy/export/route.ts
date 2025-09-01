// src/app/api/rone/office-vacancy/export/route.ts
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TABLE = 'rone_office_vacancy'

function qMonth(q: number): '03'|'06'|'09'|'12' {
  return ['03','06','09','12'][q-1] as '03'|'06'|'09'|'12'
}
function toDbPeriod(y: number, q: number): string {
  return `${y}${qMonth(q)}`
}
function descFromPeriod(p: string): string {
  const y = p.slice(0,4)
  const m = p.slice(4)
  const q = ({ '03':1, '06':2, '09':3, '12':4 } as const)[m as '03'|'06'|'09'|'12']
  return `${y}년 ${q}분기`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const startYear = Number(searchParams.get('startYear'))
    const startQ = Number(searchParams.get('startQ'))
    const endYear = Number(searchParams.get('endYear'))
    const endQ = Number(searchParams.get('endQ'))
    const region = (searchParams.get('region') || 'ALL').toUpperCase()

    if (!startYear || !startQ || !endYear || !endQ) {
      return new Response('Invalid query', { status: 400 })
    }

    const start = toDbPeriod(startYear, startQ)
    const end = toDbPeriod(endYear, endQ)

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY
    )

    let query = supabase
      .from(TABLE)
      .select('period, wrttime_desc, region_code, region_name, value')
      .gte('period', start)
      .lte('period', end)
      .order('period', { ascending: false })
      .order('region_code', { ascending: true })

    if (region !== 'ALL') query = query.eq('region_code', region)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const rows = (data ?? []).map((r: any) => ([
      r.wrttime_desc || descFromPeriod(r.period),
      r.period,
      r.region_code,
      r.region_name || r.region_code,
      typeof r.value === 'number' ? r.value : null,
    ]))

    const header = [['분기(설명)','시점코드','지역코드','지역명','값']]
    const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
    ws['!cols'] = [14, 10, 10, 16, 10].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '오피스_공실률')

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `office_vacancy_${start}-${end}${region !== 'ALL' ? '_' + region : ''}.xlsx`

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return new Response(`Export failed: ${e?.message || 'unknown error'}`, { status: 500 })
  }
}
