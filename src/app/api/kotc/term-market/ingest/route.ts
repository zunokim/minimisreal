// src/app/api/kotc/term-market/ingest/route.ts
// 업로드된 K-OTC 엑셀(기간별 시장지표) 파싱 후 DB upsert
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseKotcTermMarketExcel } from '@/lib/kotc/parser'

export const runtime = 'nodejs' // 파일 파싱이므로 node 런타임

function requireSecret(req: Request) {
  const header = req.headers.get('x-ingest-secret') || ''
  const secret = process.env.KOTC_INGEST_SECRET || ''
  if (!secret || header !== secret) {
    throw new Error('Unauthorized: invalid ingest secret')
  }
}

export async function POST(req: Request) {
  try {
    requireSecret(req)

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Use multipart/form-data' }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get('file')
    const section = String(form.get('section') || '전체')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    const ab = await file.arrayBuffer()

    const rows = parseKotcTermMarketExcel(ab, { section })
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data parsed from excel' }, { status: 400 })
    }

    // upsert (prd_de, section) unique로 동작
    const { error, count } = await supabaseAdmin
      .from('kotc_term_market')
      .upsert(
        rows.map((r) => ({
          prd_de: r.prd_de,
          section: r.section,
          avg_price: r.avg_price,
          volume: r.volume,
          amount_krw: r.amount_krw,
          market_cap_krw: r.market_cap_krw,
          src: 'K-OTC',
          raw: r.raw,
        })),
        { onConflict: 'prd_de,section', ignoreDuplicates: false, count: 'exact' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      parsed: rows.length,
      upserted: count ?? null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
