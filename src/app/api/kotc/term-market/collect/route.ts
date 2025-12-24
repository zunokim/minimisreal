// src/app/api/kotc/term-market/collect/route.ts
// 설명: (자동수집) K-OTC에서 엑셀을 직접 내려받아 파싱 → Supabase upsert
// 보안: x-ingest-secret 헤더 필수, 서버 전용(Node.js 런타임)
import { NextResponse } from 'next/server'
import dayjs from 'dayjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchKotcExcel } from '@/lib/kotc/collector'
import { parseKotcTermMarketExcel } from '@/lib/kotc/parser'

export const runtime = 'nodejs'
export const maxDuration = 300 // Vercel 함수 타임아웃 여유

function requireSecret(req: Request): void {
  const hdr = req.headers.get('x-ingest-secret') || ''
  const secret = process.env.KOTC_INGEST_SECRET || ''
  if (!secret || hdr !== secret) {
    throw new Error('Unauthorized')
  }
}

export async function POST(req: Request) {
  try {
    requireSecret(req)
    const body = (await req.json().catch(() => ({}))) as {
      from?: string
      to?: string
      section?: string
    }

    const from = body.from && /^\d{4}-\d{2}-\d{2}$/.test(body.from)
      ? body.from
      : dayjs().subtract(7, 'day').format('YYYY-MM-DD')
    const to = body.to && /^\d{4}-\d{2}-\d{2}$/.test(body.to)
      ? body.to
      : dayjs().format('YYYY-MM-DD')
    const section = (body.section && String(body.section).trim()) || '전체'

    // 1) 원격 엑셀 획득
    const excelBuf = await fetchKotcExcel({ from, to, section })

    // 2) 파싱 → 정규화
    const rows = parseKotcTermMarketExcel(excelBuf, { section })
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows parsed' }, { status: 502 })
    }

    // 3) 멱등 upsert
    const payload = rows.map((r) => ({
      prd_de: r.prd_de,
      section: r.section,
      avg_price: r.avg_price,
      volume: r.volume,
      amount_krw: r.amount_krw,
      market_cap_krw: r.market_cap_krw,
      src: 'K-OTC',
      raw: r.raw,
    }))

    const { error, count } = await supabaseAdmin
      .from('kotc_term_market')
      .upsert(payload, {
        onConflict: 'prd_de,section',
        ignoreDuplicates: false,
        count: 'exact',
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      from,
      to,
      section,
      parsed: rows.length,
      upserted: count ?? null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
