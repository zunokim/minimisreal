// src/app/api/fss/press/route.ts
// Node.js 런타임 강제 (Buffer/iconv 사용)
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** ====== 인코딩/엔티티 처리 유틸 ====== */

/**
 * 항상 ArrayBuffer로 받은 뒤
 * utf8 / euc-kr / cp949 각각으로 디코드해 보고
 * "한글 글자 수"가 가장 큰 JSON을 선택
 */
async function decodeBestJson(res: Response): Promise<any> {
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  const iconv = (await import('iconv-lite')).default

  type Candidate = { enc: 'utf8' | 'euc-kr' | 'cp949'; json?: any; score: number }
  const cands: Candidate[] = [
    { enc: 'utf8', score: 0 },
    { enc: 'euc-kr', score: 0 },
    { enc: 'cp949', score: 0 },
  ]

  for (const c of cands) {
    try {
      const txt = c.enc === 'utf8' ? buf.toString('utf8') : iconv.decode(buf, c.enc)
      const j = JSON.parse(txt)
      c.json = j
      c.score = hangulScoreFromJson(j)
    } catch {
      c.score = -1
    }
  }
  cands.sort((a, b) => b.score - a.score)
  const best = cands[0]
  if (!best || best.score < 0 || !best.json) {
    throw new Error('Failed to decode/parse FSS response (utf8/euc-kr/cp949).')
  }
  return best.json
}

function hangulScoreFromJson(obj: any): number {
  try {
    const s = JSON.stringify(obj)
    let score = 0
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i)
      if (ch >= 0xac00 && ch <= 0xd7a3) score++ // 한글 음절
      if (ch === 0xfffd) score -= 2 // replacement char 감점
    }
    return score
  } catch {
    return -1
  }
}

/** HTML 엔티티(&ldquo;, &#39;, ...) 디코더 (서버 저장단에서 정규화) */
function decodeHtmlEntities(input?: string | null): string | undefined {
  if (!input) return input ?? undefined
  let s = String(input)

  // 숫자 엔티티 (십진/16진)
  s = s.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))

  // 대표적인 명명 엔티티
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&hellip;': '…',
    '&middot;': '·',
  }
  s = s.replace(/&[a-zA-Z]+?;|&#\d+;|&#x[0-9a-fA-F]+;/g, (m) => map[m] ?? m)

  return s
}

type FssPressItem = {
  contentId: string
  subject: string
  publishOrg: string
  originUrl: string
  viewCnt: string
  regDate: string
  atchfileUrl?: string
  atchfileNm?: string
  contentsKor?: string
}

type FssPressResponse = {
  resultCode: string
  resultMsg: string
  resultCnt: number
  result: FssPressItem[]
}

function normalizeMultiline(s?: string): string | undefined {
  if (!s) return s
  // 금감원 JSON에서 종종 보이는 개행/따옴표 이슈 간단 정리
  const cleaned = s
    .replace(/rnrn/gi, '\n\n')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
  return cleaned
}

function normalizeJson(json: any): FssPressResponse {
  // 문서에 "reponse" 오타 사례가 있어 두 키 모두 대응
  const root = json?.reponse ?? json?.response ?? json
  const resultCnt = Number(root?.resultCnt ?? 0)
  const arr: any[] = Array.isArray(root?.result)
    ? root?.result
    : root?.result
    ? [root?.result]
    : []

  return {
    resultCode: String(root?.resultCode ?? ''),
    resultMsg: String(root?.resultMsg ?? ''),
    resultCnt,
    result: arr.map((it) => {
      const subject = decodeHtmlEntities(String(it?.subject ?? ''))
      const contents = decodeHtmlEntities(it?.contentsKor ? String(it.contentsKor) : undefined)
      const atchNm = decodeHtmlEntities(it?.atchfileNm ? String(it.atchfileNm) : undefined)
      return {
        contentId: String(it?.contentId ?? ''),
        subject: subject ?? '',
        publishOrg: String(it?.publishOrg ?? ''),
        originUrl: String(it?.originUrl ?? ''),
        viewCnt: String(it?.viewCnt ?? '0'),
        regDate: String(it?.regDate ?? ''),
        atchfileUrl: it?.atchfileUrl ? String(it.atchfileUrl) : undefined,
        atchfileNm: atchNm,
        contentsKor: normalizeMultiline(contents),
      }
    }),
  }
}

/** ====== 라우트 핸들러 ====== */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') // YYYY-MM-DD
    const endDate = searchParams.get('endDate')     // YYYY-MM-DD
    const subject = searchParams.get('subject') || '' // 서버 후처리
    // 발행기관 필터는 사용 안 함 (요청에 따라 제거)
    const save = searchParams.get('save') === '1'

    const authKey = process.env.FSS_AUTH_KEY
    if (!authKey) {
      return NextResponse.json({ error: 'FSS_AUTH_KEY is not set on the server.' }, { status: 500 })
    }
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required. (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const base = 'https://www.fss.or.kr/fss/kr/openApi/api/bodoInfo.jsp'
    const qs = new URLSearchParams({ apiType: 'json', startDate, endDate, authKey })
    const apiUrl = `${base}?${qs.toString()}`

    const upstream = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json,text/plain,*/*' },
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status} ${upstream.statusText}` },
        { status: 502 }
      )
    }

    // 인코딩 자동 판별 + 엔티티 정규화
    const rawJson = await decodeBestJson(upstream)
    const normalized = normalizeJson(rawJson)

    // 제목 키워드 서버 후처리
    const filtered = normalized.result.filter((item) =>
      subject ? item.subject?.toLowerCase().includes(subject.toLowerCase()) : true
    )

    // (옵션) DB 저장 — 저장 전에 이미 엔티티 디코딩된 텍스트가 들어가므로 이후 조회도 정상 표기
    let saved = 0
    if (save && filtered.length > 0) {
      const payload = filtered.map((r) => ({
        content_id: r.contentId,
        subject: r.subject,
        publish_org: r.publishOrg,
        origin_url: r.originUrl,
        view_cnt: Number(r.viewCnt || 0),
        reg_date: new Date(r.regDate.replace(' ', 'T') + 'Z').toISOString(),
        atchfile_url: r.atchfileUrl ?? null,
        atchfile_nm: r.atchfileNm ?? null,
        contents_kor: r.contentsKor ?? null,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabaseAdmin.from('fss_press').upsert(payload, { onConflict: 'content_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      saved = payload.length
    }

    return NextResponse.json({
      resultCode: normalized.resultCode,
      resultMsg: normalized.resultMsg,
      resultCnt: filtered.length,
      result: filtered,
      period: { startDate, endDate },
      saved,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Unexpected server error' }, { status: 500 })
  }
}
