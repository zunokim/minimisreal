// src/app/api/kosis/guess-objl/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisData } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

type KosisPrdSe = 'Y' | 'H' | 'Q' | 'M' | 'D' | 'IR' | 'F' | 'S'

/**
 * 특정 표(orgId, tblId)에 대해 objL "코드"를 추정합니다.
 * - 한 달 범위(YYYYMM)를 입력하면, objL 후보들을 빠르게 시도하여 성공하는 코드만 반환합니다.
 *
 * 예)
 * /api/kosis/guess-objl
 *   ?orgId=116
 *   &tblId=DT_MLTM_5328
 *   &prdSe=M
 *   &ym=202506
 *   &limit=200      ← 최대 시도 개수(옵션, 기본 200)
 *   &candidates=01,02,1,2,M,P   ← 수동 후보(옵션, 콤마구분). 주면 이것만 시도함.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const orgId = (url.searchParams.get('orgId') ?? '').trim()
    const tblId = (url.searchParams.get('tblId') ?? '').trim()
    const prdSe = ((url.searchParams.get('prdSe') ?? 'M').trim().toUpperCase()) as KosisPrdSe
    const ym = (url.searchParams.get('ym') ?? '').trim()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 1000)

    // 수동 후보가 주어지면 그것만 사용
    const candidatesRaw = (url.searchParams.get('candidates') ?? '').trim()

    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(ym)) {
      return NextResponse.json({ ok: false, error: 'ym must be YYYYMM' }, { status: 400 })
    }

    let candidates: string[] = []
    if (candidatesRaw) {
      candidates = candidatesRaw.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      // 기본 후보군(일반적으로 많이 쓰이는 형태들)
      const nums = Array.from({ length: 99 }, (_, i) => String(i + 1))         // 1..99
      const numsPad = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0')) // 01..99
      const alphas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')                     // A..Z
      // 흔히 쓰이는 약어 추정(민간/공공/합계 등), 틀려도 해가 없음
      const hints = ['M', 'P', 'G', 'T', 'A', 'ALL'] // M: 민간? P/G: Public/Gov? T/A: Total/All?
      candidates = [...new Set([...nums, ...numsPad, ...alphas, ...hints])].slice(0, limit)
    }

    const tried: Array<{
      objL: string
      ok: boolean
      count?: number
      error?: string
    }> = []
    const hits: Array<{ objL: string; count: number }> = []

    for (const code of candidates) {
      try {
        const rows = await fetchKosisData({
          orgId, tblId, prdSe,
          startPrdDe: ym,
          endPrdDe: ym,
          itmId: 'ALL',
          objL: code,
          format: 'json',
        })
        const count = Array.isArray(rows) ? rows.length : 0
        tried.push({ objL: code, ok: true, count })
        if (count > 0) hits.push({ objL: code, count })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        tried.push({ objL: code, ok: false, error: msg })
      }
    }

    // 성공 후보를 count 내림차순으로 정렬
    hits.sort((a, b) => b.count - a.count)

    return NextResponse.json({
      ok: true,
      orgId, tblId, prdSe, ym,
      triedCount: tried.length,
      hits,
      sample: hits.slice(0, 10),
      note:
        hits.length === 0
          ? '성공한 objL 코드가 없습니다. candidates 파라미터로 후보를 좁혀 다시 시도해 보세요.'
          : 'hits[0]의 objL을 import 라우트에 그대로 사용해 보세요.',
      // 디버깅용: 어떤 코드가 실패/성공했는지 모두 보고 싶으면 아래 주석 해제
       tried,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
