//src/app/api/dart/compare/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { classifyToCanon } from '@/lib/accountCanonical'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type FnlttRow = {
  corp_code: string
  bsns_year: number
  reprt_code: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  account_nm_norm?: string | null
  account_id_norm?: string | null
  canon_key?: string | null
  canon_score?: number | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  dart_corp?: { corp_name?: string | null } | null
}

type CompareRow = {
  corp_code: string
  corp_name: string
  thstrm_amount: number
  frmtrm_amount: number
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const sjDiv = (searchParams.get('sj_div') ?? 'BS') as SjDiv

    const canonKey = (searchParams.get('canon_key') ?? '').trim()
    const accountNm = (searchParams.get('account_nm') ?? '').trim()
    const accountId = (searchParams.get('account_id') ?? '').trim()
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (!canonKey && !accountNm && !accountId) {
      return NextResponse.json({ ok: false, error: 'canon_key or (account_nm/account_id) is required' }, { status: 400 })
    }

    let q = supabaseAdmin
      .from('dart_fnltt')
      .select(`
        corp_code, bsns_year, reprt_code, fs_div, sj_div,
        account_nm, account_id, account_nm_norm, account_id_norm,
        canon_key, canon_score, thstrm_amount, frmtrm_amount,
        dart_corp:corp_code ( corp_name )
      `)
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .eq('sj_div', sjDiv)

    if (corpCodes.length > 0) q = q.in('corp_code', corpCodes)

    // 필터: 캐논 모드면 캐논키로 빠르게 필터
    if (canonKey) {
      q = q.eq('canon_key', canonKey)
    } else {
      if (accountId) q = q.eq('account_id', accountId)
      else q = q.eq('account_nm', accountNm)
    }

    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as FnlttRow[]

    // ── 집계
    const byCorp = new Map<string, CompareRow>()

    if (canonKey) {
      // 캐시 우선: canon_key가 이미 매겨진 행 중, 동일 회사에서 스코어 높은 1건을 대표로 선택
      const bucket = new Map<string, { corp_code: string; corp_name: string; th: number; fr: number; score: number }>()
      for (const r of rows) {
        const corp = r.corp_code
        const corpName = r.dart_corp?.corp_name ?? corp
        const th = r.thstrm_amount ?? 0
        const fr = r.frmtrm_amount ?? 0
        const score =
          (r.canon_key === canonKey && typeof r.canon_score === 'number' ? r.canon_score : 0)
          || 0

        const prev = bucket.get(corp)
        const cand = { corp_code: corp, corp_name: corpName, th, fr, score }
        if (!prev || cand.score > prev.score || (cand.score === prev.score && Math.abs(cand.th) > Math.abs(prev.th))) {
          bucket.set(corp, cand)
        }
      }

      // 캐시가 비어있거나 일부 누락된 경우: 폴백(온더플라이 분류)
      if (bucket.size === 0) {
        for (const r of rows) {
          const c = classifyToCanon(sjDiv, r.account_id, r.account_nm)
          if (!c || c.key !== (canonKey as any)) continue
          const corp = r.corp_code
          const corpName = r.dart_corp?.corp_name ?? corp
          const th = r.thstrm_amount ?? 0
          const fr = r.frmtrm_amount ?? 0
          const prev = bucket.get(corp)
          const cand = { corp_code: corp, corp_name: corpName, th, fr, score: c.score }
          if (!prev || cand.score > prev.score || (cand.score === prev.score && Math.abs(cand.th) > Math.abs(prev.th))) {
            bucket.set(corp, cand)
          }
        }
      }

      for (const v of bucket.values()) {
        byCorp.set(v.corp_code, { corp_code: v.corp_code, corp_name: v.corp_name, thstrm_amount: v.th, frmtrm_amount: v.fr })
      }
    } else {
      // 원천 기준: 같은 회사의 동일 원천계정을 합산(중복 라인 방지)
      const keyOf = (r: FnlttRow) => `${r.corp_code}|${(r.account_id ?? 'NA')}|${r.account_nm}`
      const seen = new Set<string>()
      for (const r of rows) {
        const k = keyOf(r)
        if (seen.has(k)) continue
        seen.add(k)
        const corp = r.corp_code
        const corpName = r.dart_corp?.corp_name ?? corp
        const th = r.thstrm_amount ?? 0
        const fr = r.frmtrm_amount ?? 0
        const prev = byCorp.get(corp) ?? { corp_code: corp, corp_name: corpName, thstrm_amount: 0, frmtrm_amount: 0 }
        prev.thstrm_amount += th
        prev.frmtrm_amount += fr
        byCorp.set(corp, prev)
      }
    }

    const out = Array.from(byCorp.values()).sort((a, b) => (b.thstrm_amount ?? 0) - (a.thstrm_amount ?? 0))
    return NextResponse.json({ ok: true, rows: out })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
