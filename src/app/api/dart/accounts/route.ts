//src/app/api/dart/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type Row = { account_nm: string | null; account_id: string | null; account_nm_norm?: string | null }

type AccountItem = { account_nm: string; account_id: string | null; key: string }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const sjDiv = (searchParams.get('sj_div') ?? 'BS') as SjDiv

    const { data, error } = await supabaseAdmin
      .from('dart_fnltt')
      .select('account_nm, account_id, account_nm_norm')
      .eq('bsns_year', year).eq('reprt_code', reprt).eq('fs_div', fsDiv).eq('sj_div', sjDiv)

    if (error) throw error

    const uniq = new Map<string, AccountItem>()
    for (const r of (data ?? []) as Row[]) {
      const nm = (r.account_nm ?? '').trim()
      if (!nm) continue
      const id = r.account_id
      const key = `${id ?? 'NA'}|${nm}`
      if (!uniq.has(key)) uniq.set(key, { account_nm: nm, account_id: id, key })
    }

    const list = Array.from(uniq.values()).sort((a, b) => {
      const an = (a.account_nm || '').toString()
      const bn = (b.account_nm || '').toString()
      return an.localeCompare(bn, 'ko')
    })

    return NextResponse.json({ ok: true, list })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
