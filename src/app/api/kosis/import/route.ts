// src/app/api/kosis/import/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}
function incMonth(yyyymm: string): string {
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4))
  const d = new Date(y, m - 1 + 1, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(start: string, end: string): string[] {
  if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) return []
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = incMonth(cur)
  }
  return out
}

/** 행 단위로 C2/C1 중 존재하는 지역코드/이름을 안전하게 선택 */
function pickRegion(r: Record<string, any>, prefer: 'C1' | 'C2'): { code: string; name: string | null } {
  const order = prefer === 'C2' ? (['C2', 'C1'] as const) : (['C1', 'C2'] as const)
  for (const key of order) {
    const code = r[key]
    const name = r[`${key}_NM`]
    if (code != null && code !== '') {
      return { code: String(code), name: name != null ? String(name) : null }
    }
  }
  return { code: '000', name: null }
}

type DatasetKey = 'hcsi' | 'unsold' | 'unsold_after'

const DEFAULTS = {
  hcsi: { orgId: '390', tblId: 'DT_39002_02', prdSe: 'M', itmId: 'ALL', objL1: 'ALL', regionKey: 'C1' as const },
  unsold: { orgId: '101', tblId: 'DT_1YL202004E', prdSe: 'M', itmId: 'ALL', objL1: 'ALL', objL2: 'ALL', regionKey: 'C2' as const },
  unsold_after: { orgId: '116', tblId: 'DT_MLTM_5328', prdSe: 'M', regionKey: 'C2' as const },
}

export async function GET(req: NextRequest) {
  try {
    // 보호 헤더
    const need = requireEnv('NEWS_CRON_SECRET')
    const got = req.headers.get('x-job-secret') || req.headers.get('X-Job-Secret')
    if (got !== need) {
      return NextResponse.json({ ok: false, status: 401, message: 'Unauthorized' }, { status: 401 })
    }

    const sp = req.nextUrl.searchParams
    const dataset = (sp.get('dataset') as DatasetKey) || 'hcsi'
    if (!['hcsi', 'unsold', 'unsold_after'].includes(dataset)) {
      return NextResponse.json({ ok: false, status: 400, message: 'invalid dataset' }, { status: 400 })
    }

    const def = DEFAULTS[dataset]
    const orgId = sp.get('orgId') || def.orgId
    const tblId = sp.get('tblId') || def.tblId
    const prdSe = sp.get('prdSe') || def.prdSe
    const startPrdDe = sp.get('startPrdDe') || undefined
    const endPrdDe = sp.get('endPrdDe') || startPrdDe
    const itmId = sp.get('itmId') || (def as any).itmId || undefined
    const objL1 = sp.get('objL1') || (def as any).objL1 || undefined
    const objL2 = sp.get('objL2') || (def as any).objL2 || undefined
    const objL3 = sp.get('objL3') || undefined
    const objL4 = sp.get('objL4') || undefined
    const regionKeyPref = (sp.get('regionKey') as 'C1' | 'C2' | null) || def.regionKey

    if (!startPrdDe) {
      return NextResponse.json({ ok: false, status: 400, message: 'startPrdDe is required (YYYYMM)' }, { status: 400 })
    }

    const months = monthRange(startPrdDe, endPrdDe || startPrdDe)
    if (months.length === 0) {
      return NextResponse.json({ ok: false, status: 400, message: 'Invalid period range' }, { status: 400 })
    }

    const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

    const attempts: Array<
      { scope: string; ok: true; count: number; usedParams: Record<string, string> } |
      { scope: string; ok: false; error: string; usedParams: Record<string, string> }
    > = []

    let totalInserted = 0
    let totalUpserted = 0
    let totalSkipped = 0

    // 월별 호출 (하나라도 없어도 전체는 계속 진행)
    for (const scope of months) {
      const q = new URLSearchParams()
      q.set('method', 'getList')
      q.set('apiKey', requireEnv('KOSIS_API_KEY'))
      q.set('format', 'json')
      q.set('jsonVD', 'Y')
      q.set('orgId', orgId)
      q.set('tblId', tblId)
      if (prdSe) q.set('prdSe', prdSe)
      q.set('startPrdDe', scope)
      q.set('endPrdDe', scope)
      if (itmId) q.set('itmId', itmId)
      if (objL1) q.set('objL1', objL1)
      if (objL2) q.set('objL2', objL2)
      if (objL3) q.set('objL3', objL3)
      if (objL4) q.set('objL4', objL4)

      const usedParams = Object.fromEntries(q.entries())
      const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?${q.toString()}`

      // KOSIS 호출
      let bodyText = ''
      let arr: any[] = []
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        bodyText = await res.text()

        // 일부 케이스는 200이면서 본문에 에러 코드가 포함됨
        let parsed: unknown
        try { parsed = JSON.parse(bodyText) } catch { parsed = null }

        if (!res.ok) {
          const msg = `HTTP ${res.status}`
          attempts.push({ scope, ok: false, error: `KOSIS error: ${msg}`, usedParams })
          continue
        }

        if (Array.isArray(parsed)) {
          arr = parsed
        } else if (parsed && typeof parsed === 'object' && 'errCd' in (parsed as any)) {
          // KOSIS 오류 포맷(예: {errCd:"30", errMsg:"데이터가 존재하지 않습니다."})
          const e = parsed as { errCd?: string; errMsg?: string }
          const code = e.errCd ?? 'NA'
          const msg = e.errMsg ?? 'Unknown error'
          if (code === '30') {
            // 요청 월에 데이터 없음 → 정상적으로 "0건" 처리
            attempts.push({ scope, ok: true, count: 0, usedParams })
            continue
          }
          attempts.push({ scope, ok: false, error: `KOSIS error ${code}: ${msg}`, usedParams })
          continue
        } else {
          // 비정형 본문
          if (bodyText.includes('데이터가 존재하지 않습니다')) {
            attempts.push({ scope, ok: true, count: 0, usedParams })
            continue
          }
          attempts.push({ scope, ok: false, error: `KOSIS response parse error`, usedParams })
          continue
        }
      } catch (e) {
        attempts.push({ scope, ok: false, error: `KOSIS fetch failed: ${String(e)}`, usedParams })
        continue
      }

      // 맵핑
      const mapped = arr
        .map((r) => {
          const { code, name } = pickRegion(r, regionKeyPref)
          const base = {
            org_id: r.ORG_ID ?? orgId,
            tbl_id: r.TBL_ID ?? tblId,
            prd_se: r.PRD_SE ?? prdSe,
            prd_de: r.PRD_DE as string | undefined,
            region_code: code,
            region_name: name,
            itm_id: (r.ITM_ID ?? itmId ?? 'ALL') as string,
            itm_name: (r.ITM_NM ?? null) as string | null,
            unit: (r.UNIT_NM ?? null) as string | null,
            value: toNumber(r.DT),
          }
          if (dataset === 'unsold_after') {
            return {
              ...base,
              inserted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          }
          return { ...base, raw: r }
        })
        .filter((r) => r.prd_de && typeof r.prd_de === 'string')

      // 월별 DB 저장
      if (dataset === 'unsold_after') {
        const { error } = await supabase.from('kosis_unsold_after').upsert(mapped as any[], {
          onConflict: 'tbl_id,itm_id,region_code,prd_de,org_id',
          ignoreDuplicates: false,
        })
        if (error) {
          attempts.push({ scope, ok: false, error: `upsert failed: ${(error as any).message ?? 'unknown'}`, usedParams })
          continue
        }
        attempts.push({ scope, ok: true, count: (mapped as any[]).length, usedParams })
        totalUpserted += (mapped as any[]).length
        continue
      }

      const table = dataset === 'hcsi' ? 'kosis_hcsi' : 'kosis_unsold'
      const keyFields = ['org_id', 'tbl_id', 'prd_se', 'prd_de', 'region_code', 'itm_id'] as const
      const prdSet = Array.from(new Set((mapped as any[]).map((r) => r.prd_de)))
      const { data: existing, error: exErr } = await supabase
        .from(table)
        .select(keyFields.join(','))
        .in('prd_de', prdSet)
        .eq('org_id', orgId)
        .eq('tbl_id', tblId)

      if (exErr) {
        attempts.push({ scope, ok: false, error: `select failed: ${(exErr as any).message ?? 'unknown'}`, usedParams })
        continue
      }

      const existSet = new Set((existing ?? []).map((e: any) => keyFields.map((k) => e[k]).join('|')))
      const toInsert = (mapped as any[]).filter((r) => !existSet.has(keyFields.map((k) => r[k]).join('|')))

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from(table).insert(toInsert)
        if (insErr) {
          attempts.push({ scope, ok: false, error: `insert failed: ${(insErr as any).message ?? 'unknown'}`, usedParams })
          continue
        }
      }

      attempts.push({ scope, ok: true, count: (mapped as any[]).length, usedParams })
      totalInserted += toInsert.length
      totalSkipped += (mapped as any[]).length - toInsert.length
    }

    // 전체 결과 집계 (부분 성공 허용)
    const anySuccess = attempts.some((a) => a.ok && a.count >= 0)
    const allZero = attempts.every((a) => a.ok && 'count' in a && a.count === 0)

    if (!anySuccess) {
      // 전부 실패한 경우만 실패 처리
      return NextResponse.json({ ok: false, status: 502, message: 'All attempts failed', attempts }, { status: 502 })
    }

    // 부분 성공 → 200 OK로 성공 처리
    return NextResponse.json({
      ok: true,
      status: 200,
      inserted: totalInserted,
      upserted: totalUpserted,
      skipped: totalSkipped,
      attempts,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, status: 500, message: String(e) }, { status: 500 })
  }
}
