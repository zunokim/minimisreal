// src/app/api/indexes/spgi/sheets-ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs' // Edge 금지 (Node API 사용)

type AttemptOk = {
  scope: string
  ok: true
  count: number
  usedParams: Record<string, string>
}
type AttemptFail = {
  scope: string
  ok: false
  error: string
  usedParams: Record<string, string>
  httpStatus?: number
  url?: string
}
type Attempt = AttemptOk | AttemptFail

type ParsedRow = { date: string; value: number }

const DEFAULT_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9DkfKSKbKo735I4z4HeYQDS1XCpYodYTeQKTWXkvaqm_uJlgtk1zQEn_cGOSjmPgIHnvh9NGqErg1/pub?gid=0&single=true&output=csv'

/** YYYY-MM-DD */
function toISODate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** CSV 행의 "Date" 셀을 다양한 로케일로 파싱 */
function parseDateCell(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().replace(/^"|"$/g, '') // 양끝 따옴표 제거

  // 1) ISO / 슬래시 기본형: YYYY-MM-DD or YYYY/MM/DD
  {
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (m) {
      const y = Number(m[1])
      const mon = clampInt(Number(m[2]), 1, 12)
      const d = clampInt(Number(m[3]), 1, 31)
      const dt = new Date(Date.UTC(y, mon - 1, d))
      return Number.isNaN(dt.getTime()) ? null : toISODate(dt)
    }
  }

  // 2) 미국형 + AM/PM: M/D/YYYY [H:MM(:SS)?] [AM|PM]
  {
    const m = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i
    )
    if (m) {
      const mon = clampInt(Number(m[1]), 1, 12)
      const d = clampInt(Number(m[2]), 1, 31)
      const y = Number(m[3])
      // 시간은 날짜 산출에 영향 없음 → 날짜만 사용
      const dt = new Date(Date.UTC(y, mon - 1, d))
      return Number.isNaN(dt.getTime()) ? null : toISODate(dt)
    }
  }

  // 3) 한국어 로케일: YYYY. M. D [오전|오후] H:MM(:SS)?
  {
    const m = s.match(
      /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})(?:\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    )
    if (m) {
      const y = Number(m[1])
      const mon = clampInt(Number(m[2]), 1, 12)
      const d = clampInt(Number(m[3]), 1, 31)
      // 시간은 날짜만 사용 (오전/오후는 무시)
      const dt = new Date(Date.UTC(y, mon - 1, d))
      return Number.isNaN(dt.getTime()) ? null : toISODate(dt)
    }
  }

  // 4) 마지막 시도: '오전→AM, 오후→PM' 치환 후 Date 파싱
  {
    const s2 = s
      .replace(/오전/g, 'AM')
      .replace(/오후/g, 'PM')
      .replace(/\./g, '/') // 2025. 1. 2 → 2025/ 1/ 2 (대부분 파싱 가능)
    const d = new Date(s2)
    if (!Number.isNaN(d.getTime())) return toISODate(d)
  }

  return null
}

/** 숫자 셀 파싱 */
function parseNumberCell(raw: string): number | null {
  if (!raw) return null
  const t = raw.trim().replace(/,/g, '').replace(/^"|"$/g, '')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** 구글 시트 CSV 파싱 (헤더: Date, Close/Price 등) */
function parseGoogleFinanceCsv(csv: string, start?: string, end?: string): ParsedRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return []

  // 헤더
  const header = lines[0]
    .split(',')
    .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase())

  // Date 열 인덱스 (없으면 0)
  let dateIdx = header.findIndex((h) => h === 'date' || h === '날짜')
  if (dateIdx < 0) dateIdx = 0

  // 가격 열 인덱스 (우선순위: close, price, adj close → 기본 1)
  let closeIdx = header.findIndex((h) => ['close', 'price', 'adj close', '가격'].includes(h))
  if (closeIdx < 0) closeIdx = 1

  const out: ParsedRow[] = []

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',')
    const dateRaw = cols[dateIdx] ?? cols[0] ?? ''
    const valRaw = cols[closeIdx] ?? cols[1] ?? ''

    const iso = parseDateCell(dateRaw)
    const value = parseNumberCell(valRaw)
    if (!iso || value == null) continue
    if (start && iso < start) continue
    if (end && iso > end) continue

    out.push({ date: iso, value })
  }

  // 중복 제거(마지막 값 우선) + 정렬
  const map = new Map<string, number>()
  out.forEach((r) => map.set(r.date, r.value))
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** body 파싱 */
function parseBody(input: unknown): { csvUrl: string; start?: string; end?: string } {
  const b = (input ?? {}) as Record<string, unknown>
  const csvUrl = (b.csvUrl as string) || DEFAULT_CSV_URL
  const start = b.start ? String(b.start) : undefined
  const end = b.end ? String(b.end) : undefined
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('start must be YYYY-MM-DD')
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('end must be YYYY-MM-DD')
  if (start && end && start > end) throw new Error('start must be <= end')
  return { csvUrl, start, end }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { csvUrl, start, end } = parseBody(await req.json())
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('missing supabase env')

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    const attempts: Attempt[] = []
    let upserted = 0

    // CSV 다운로드
    let httpStatus = 0
    let text = ''
    try {
      const resp = await fetch(csvUrl, { cache: 'no-store' })
      httpStatus = resp.status
      if (!resp.ok) {
        text = await resp.text()
        attempts.push({
          scope: `${start ?? ''}~${end ?? ''}`,
          ok: false,
          error: `csv http ${resp.status}`,
          usedParams: { method: 'sheet-csv' },
          httpStatus: resp.status,
          url: csvUrl,
        })
        return NextResponse.json({ ok: true, status: 200, upserted, attempts })
      }
      text = await resp.text()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push({
        scope: `${start ?? ''}~${end ?? ''}`,
        ok: false,
        error: msg,
        usedParams: { method: 'sheet-csv' },
        httpStatus,
        url: csvUrl,
      })
      return NextResponse.json({ ok: true, status: 200, upserted, attempts })
    }

    // 파싱
    const rows = parseGoogleFinanceCsv(text, start, end)

    if (rows.length > 0) {
      const payload = rows.map((r) => ({
        family: 'spgi' as const,
        index_code: '^SPGTINFR',
        provider: 'google_sheet' as const,
        date: r.date,
        value: r.value,
        currency: 'USD',
        meta: { source: 'google_sheets', interval: '1d' as const },
      }))

      const { error } = await supabase
        .from('index_series')
        .upsert(payload, { onConflict: 'family,index_code,provider,date', ignoreDuplicates: false })

      if (error) {
        attempts.push({
          scope: `${start ?? ''}~${end ?? ''}`,
          ok: false,
          error: `upsert failed: ${error.message}`,
          usedParams: { method: 'sheet-csv' },
        })
        return NextResponse.json({ ok: true, status: 200, upserted, attempts })
      }
      upserted = payload.length
    }

    attempts.push({
      scope: `${start ?? ''}~${end ?? ''}`,
      ok: true,
      count: rows.length,
      usedParams: { method: 'sheet-csv', url: csvUrl },
    })

    return NextResponse.json({ ok: true, status: 200, upserted, attempts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, status: 500, message: msg }, { status: 500 })
  }
}
