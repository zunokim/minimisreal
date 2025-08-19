// src/app/api/dart/view/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? `${new Date().getFullYear()}`, 10)

  // ✅ 단일회사(OFS) + BS/CIS
  const { data, error } = await supabaseAdmin
    .from('dart_fnltt')
    .select(`
      corp_code, bsns_year, sj_div, account_nm,
      thstrm_amount, frmtrm_amount,
      dart_corp:corp_code ( corp_name )
    `)
    .eq('bsns_year', year)
    .eq('reprt_code', '11011')
    .eq('fs_div', 'OFS')     // ✅ OFS로 필터
    .in('sj_div', ['BS','CIS'])
    .order('corp_code')
    .order('sj_div')
    .order('ord', { nullsFirst: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r:any) => ({
    corp_code: r.corp_code,
    corp_name: r.dart_corp?.corp_name ?? r.corp_code,
    bsns_year: r.bsns_year,
    sj_div: r.sj_div,
    account_nm: r.account_nm,
    thstrm_amount: r.thstrm_amount,
    frmtrm_amount: r.frmtrm_amount
  }))
  return NextResponse.json({ rows, fs_div: 'OFS' })
}
