import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { classifyToCanon } from '@/lib/accountCanonical'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') ?? `${new Date().getFullYear()}`, 10)
    const reprt = (searchParams.get('reprt') ?? '11011') as '11011'|'11012'|'11013'|'11014'
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as 'OFS'|'CFS'
    const sjDiv = (searchParams.get('sj_div') ?? 'BS') as 'BS'|'CIS'

    // 새 옵션: 표준 계정 키
    const canonKey = (searchParams.get('canon_key') ?? '').trim() || null

    // 기존 원천 계정 옵션(둘 다 없으면 에러)
    const accountNm = (searchParams.get('account_nm') ?? '').trim()
    const accountId = (searchParams.get('account_id') ?? '').trim() || null

    const corpCodesCSV = (searchParams.get('corp_codes') ?? '').trim()
    const corpCodes = corpCodesCSV ? corpCodesCSV.split(',').map(s=>s.trim()).filter(Boolean) : []

    if (!canonKey && !accountNm && !accountId) {
      return NextResponse.json({ ok:false, error:'canon_key or (account_nm/account_id) is required' }, { status: 400 })
    }

    // 공통 조회(필요시 회사필터)
    let query = supabaseAdmin
      .from('dart_fnltt')
      .select(`
        corp_code, bsns_year, sj_div, account_nm, account_id, currency, ord,
        thstrm_amount, frmtrm_amount,
        dart_corp:corp_code ( corp_name )
      `)
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .eq('sj_div', sjDiv)

    if (corpCodes.length > 0) query = query.in('corp_code', corpCodes)

    // 원천 계정 모드면 서버단 필터 바로 적용
    if (!canonKey) {
      if (accountId) query = query.eq('account_id', accountId)
      else query = query.eq('account_nm', accountNm)
    }

    const { data, error } = await query
    if (error) throw error

    // 표준 계정 모드: 분류 후 "회사별 최적 1행" 선택
    let rowsByCorp: Map<string, { corp_code: string; corp_name: string; thstrm_amount: number; frmtrm_amount: number }>

    if (canonKey) {
      const wanted = canonKey as any
      const bucket = new Map<string, { corp_code: string; corp_name: string; th: number; fr: number; score: number }>()

      for (const r of (data ?? [])) {
        const cls = classifyToCanon(sjDiv, r.account_id, r.account_nm)
        if (!cls || cls.key !== wanted) continue

        const corp = r.corp_code
        const name = r.dart_corp?.corp_name ?? corp
        const cand = { corp_code: corp, corp_name: name, th: r.thstrm_amount ?? 0, fr: r.frmtrm_amount ?? 0, score: cls.score }

        const prev = bucket.get(corp)
        // 더 높은 신뢰도 점수(동점이면 당기 절대값 큰 것)만 채택
        if (!prev || cand.score > prev.score || (cand.score === prev.score && Math.abs(cand.th) > Math.abs(prev.th))) {
          bucket.set(corp, cand)
        }
      }

      rowsByCorp = new Map()
      for (const v of bucket.values()) {
        rowsByCorp.set(v.corp_code, { corp_code: v.corp_code, corp_name: v.corp_name, thstrm_amount: v.th, frmtrm_amount: v.fr })
      }
    } else {
      // 원천 계정 모드: 같은 회사에서 여러 줄 나오면 합산(기존 로직)
      const m = new Map<string, { corp_code: string; corp_name: string; th: number; fr: number }>()
      for (const r of (data ?? [])) {
        const k = r.corp_code
        const prev = m.get(k) ?? { corp_code: k, corp_name: r.dart_corp?.corp_name ?? k, th: 0, fr: 0 }
        prev.th += r.thstrm_amount ?? 0
        prev.fr += r.frmtrm_amount ?? 0
        m.set(k, prev)
      }
      rowsByCorp = new Map()
      for (const v of m.values()) {
        rowsByCorp.set(v.corp_code, { corp_code: v.corp_code, corp_name: v.corp_name, thstrm_amount: v.th, frmtrm_amount: v.fr })
      }
    }

    const rows = Array.from(rowsByCorp.values()).sort((a,b) => (b.thstrm_amount ?? 0) - (a.thstrm_amount ?? 0))

    return NextResponse.json({ ok:true, year, reprt, fs_div: fsDiv, sj_div: sjDiv, canon_key: canonKey, account_nm: accountNm, account_id: accountId, rows })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message }, { status: 500 })
  }
}
