//src/app/api/dart/compare/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { classifyToCanon } from '@/lib/accountCanonical'

type ReprtCode = '11011' | '11012' | '11013' | '11014'
type FsDiv = 'OFS' | 'CFS'
type SjDiv = 'BS' | 'CIS'

type FnlttRow = {
  corp_code: string
  bsns_year: number
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  currency?: string | null
  ord?: number | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  dart_corp?: { corp_name?: string | null } | null
}

type OutRow = { corp_code: string; corp_name: string; thstrm_amount: number; frmtrm_amount: number }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const sjDiv = (searchParams.get('sj_div') ?? 'BS') as SjDiv

    const canonKey = (searchParams.get('canon_key') ?? '').trim() || null
    const accountNm = (searchParams.get('account_nm') ?? '').trim()
    const accountId = (searchParams.get('account_id') ?? '').trim() || null

    const corpCodesCSV = (searchParams.get('corp_codes') ?? '').trim()
    const corpCodes = corpCodesCSV ? corpCodesCSV.split(',').map(s => s.trim()).filter(Boolean) : []

    if (!canonKey && !accountNm && !accountId) {
      return NextResponse.json({ ok: false, error: 'canon_key or (account_nm/account_id) is required' }, { status: 400 })
    }

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

    if (!canonKey) {
      if (accountId) query = query.eq('account_id', accountId)
      else query = query.eq('account_nm', accountNm)
    }

    const { data, error } = await query
    if (error) throw error

    const rowsByCorp = new Map<string, OutRow>()

    if (canonKey) {
      const bucket = new Map<string, { corp_code: string; corp_name: string; th: number; fr: number; score: number }>()
      for (const r of (data ?? []) as FnlttRow[]) {
        const cls = classifyToCanon(sjDiv, r.account_id ?? null, r.account_nm ?? null)
        if (!cls || cls.key !== canonKey) continue
        const corp = r.corp_code
        const corpName = r.dart_corp?.corp_name ?? corp
        const cand = {
          corp_code: corp,
          corp_name: corpName,
          th: r.thstrm_amount ?? 0,
          fr: r.frmtrm_amount ?? 0,
          score: cls.score,
        }
        const prev = bucket.get(corp)
        if (!prev || cand.score > prev.score || (cand.score === prev.score && Math.abs(cand.th) > Math.abs(prev.th))) {
          bucket.set(corp, cand)
        }
      }
      for (const v of bucket.values()) {
        rowsByCorp.set(v.corp_code, { corp_code: v.corp_code, corp_name: v.corp_name, thstrm_amount: v.th, frmtrm_amount: v.fr })
      }
    } else {
      const m = new Map<string, { corp_code: string; corp_name: string; th: number; fr: number }>()
      for (const r of (data ?? []) as FnlttRow[]) {
        const k = r.corp_code
        const prev = m.get(k) ?? { corp_code: k, corp_name: r.dart_corp?.corp_name ?? k, th: 0, fr: 0 }
        prev.th += r.thstrm_amount ?? 0
        prev.fr += r.frmtrm_amount ?? 0
        m.set(k, prev)
      }
      for (const v of m.values()) {
        rowsByCorp.set(v.corp_code, { corp_code: v.corp_code, corp_name: v.corp_name, thstrm_amount: v.th, frmtrm_amount: v.fr })
      }
    }

    const rows = Array.from(rowsByCorp.values()).sort((a, b) => (b.thstrm_amount ?? 0) - (a.thstrm_amount ?? 0))

    return NextResponse.json({ ok: true, year, reprt, fs_div: fsDiv, sj_div: sjDiv, canon_key: canonKey, account_nm: accountNm, account_id: accountId, rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
