//src/app/api/dart/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') ?? `${new Date().getFullYear()}`, 10)
    const reprt = (searchParams.get('reprt') ?? '11011') as '11011'|'11012'|'11013'|'11014'
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as 'OFS'|'CFS'
    const sjDiv = (searchParams.get('sj_div') ?? 'BS') as 'BS'|'CIS'

    const { data, error } = await supabaseAdmin
      .from('dart_fnltt')
      .select('account_nm, account_id')
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .eq('sj_div', sjDiv)

    if (error) throw error

    const seen = new Set<string>()
    const list: { account_nm: string; account_id: string | null; key: string }[] = []

    for (const r of (data ?? [])) {
      const nm = (r.account_nm ?? '').trim().replace(/\s+/g, ' ')
      const id = r.account_id ?? null
      const key = `${id ?? 'NA'}|${nm}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ account_nm: nm, account_id: id, key })
    }

    list.sort((a, b) => a.account_nm.localeCompare(b.account_nm, 'ko'))
    return NextResponse.json({ ok: true, list })
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

