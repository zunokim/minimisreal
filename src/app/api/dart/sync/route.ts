// src/app/api/dart/sync/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchFnlttAll, fetchWithBackoff } from '@/lib/dart'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const yearsParam = searchParams.get('years')
    const reprt = (searchParams.get('reprt') ?? '11011') as '11011'|'11012'|'11013'|'11014'

    const years = (yearsParam ?? new Date().getFullYear().toString())
      .split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)

    const { data: corps, error: corpErr } = await supabaseAdmin
      .from('dart_corp').select('corp_code, corp_name').order('corp_name')
    if (corpErr) throw corpErr

    let inserted = 0, failed: any[] = []
    for (const corp of corps!) {
      for (const y of years) {
        try {
          // ✅ OFS(단일회사)로 수집
          const list = await fetchWithBackoff(() => fetchFnlttAll({
            corp_code: corp.corp_code, bsns_year: y, reprt_code: reprt, fs_div: 'OFS'
          }))

          if (list.length === 0) continue

          const rows = list.map(r => ({
            corp_code: r.corp_code,
            bsns_year: parseInt(String(r.bsns_year || y), 10) || y,
            reprt_code: r.reprt_code || reprt,
            fs_div: 'OFS',                 // ✅ 저장도 OFS
            sj_div: r.sj_div,
            sj_nm: r.sj_nm ?? null,
            account_id: r.account_id ?? null,
            account_nm: r.account_nm,
            thstrm_amount: (r as any).thstrm_amount ?? null,
            thstrm_add_amount: (r as any).thstrm_add_amount ?? null,
            frmtrm_amount: (r as any).frmtrm_amount ?? null,
            frmtrm_q_amount: (r as any).frmtrm_q_amount ?? null,
            frmtrm_add_amount: (r as any).frmtrm_add_amount ?? null,
            bfefrmtrm_amount: (r as any).bfefrmtrm_amount ?? null,
            currency: r.currency ?? null,
            rcept_no: r.rcept_no ?? null,
            ord: (r as any).ord ?? null,
            raw: r as any
          }))

          const { error: upErr, count } = await supabaseAdmin
            .from('dart_fnltt')
            .upsert(rows, {
              onConflict: 'corp_code,bsns_year,reprt_code,fs_div,sj_div,account_id,account_nm,ord',
              ignoreDuplicates: false
            })
            .select('*', { count: 'exact', head: true })

          if (upErr) throw upErr
          inserted += (count ?? 0)
          await new Promise(res => setTimeout(res, 150))
        } catch (e:any) {
          failed.push({ corp: corp.corp_code, year: y, error: e.message })
        }
      }
    }

    return NextResponse.json({ ok:true, inserted, failed, years, reprt, fs_div:'OFS' })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message }, { status: 500 })
  }
}
