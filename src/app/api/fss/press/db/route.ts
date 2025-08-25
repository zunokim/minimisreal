// src/app/api/fss/press/db/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') // YYYY-MM-DD
    const endDate = searchParams.get('endDate')     // YYYY-MM-DD
    const subject = searchParams.get('subject') || ''
    const publishOrg = searchParams.get('publishOrg') || ''

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required. (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    // 기간 필터: reg_date 기준
    let query = supabaseAdmin
      .from('fss_press')
      .select(
        'content_id, subject, publish_org, origin_url, view_cnt, reg_date, atchfile_url, atchfile_nm, contents_kor'
      )
      .gte('reg_date', new Date(startDate + 'T00:00:00Z').toISOString())
      .lte('reg_date', new Date(endDate + 'T23:59:59Z').toISOString())
      .order('reg_date', { ascending: false })

    if (subject) {
      // 간단 부분일치 (ILIKE)
      query = query.ilike('subject', `%${subject}%`)
    }
    if (publishOrg) {
      query = query.ilike('publish_org', `%${publishOrg}%`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      resultCnt: data?.length ?? 0,
      result: (data ?? []).map((r) => ({
        contentId: r.content_id,
        subject: r.subject,
        publishOrg: r.publish_org,
        originUrl: r.origin_url,
        viewCnt: r.view_cnt,
        regDate: r.reg_date,
        atchfileUrl: r.atchfile_url,
        atchfileNm: r.atchfile_nm,
        contentsKor: r.contents_kor,
      })),
      period: { startDate, endDate },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Unexpected server error' },
      { status: 500 }
    )
  }
}
