// src/app/api/calendar/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function getAuthedCalendar() {
  const { data, error } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('*')
    .eq('label', 'shared')
    .single()

  if (error || !data) throw new Error('Google not connected')

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: data.access_token || undefined,
    refresh_token: data.refresh_token || undefined,
    scope: data.scope || undefined,
    token_type: data.token_type || undefined,
    expiry_date: data.expiry_date || undefined,
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export async function GET(req: NextRequest) {
  try {
    const cal = await getAuthedCalendar()
    const { searchParams } = new URL(req.url)
    const timeMin = searchParams.get('timeMin') || new Date(new Date().setDate(1)).toISOString()
    const timeMax = searchParams.get('timeMax') || new Date(new Date().setMonth(new Date().getMonth() + 2)).toISOString()

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const resp = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Seoul',
      showDeleted: false,
      maxResults: 2500,
    })

    return NextResponse.json({ events: resp.data.items || [], calendarId })
  } catch (e: any) {
    console.error('[calendar/events] error:', e?.response?.data || e)
    return NextResponse.json(
      {
        error:
          e?.response?.data?.error_description ||
          e?.response?.data?.error ||
          e?.message ||
          'failed_to_fetch_events',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const cal = await getAuthedCalendar()
    const body = await req.json()
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const title: string = body.title || ''
    let startRaw: string = body.start
    let endRaw: string | undefined = body.end
    const allDay: boolean = !!body.allDay

    if (!title || !startRaw) throw new Error('title/start is required')

    // Google API 규칙:
    // - 올데이: start = {date: 'YYYY-MM-DD'}, end = {date: 'YYYY-MM-DD'} (end는 종료일의 다음날, exclusive)
    // - 시간지정: start/end = {dateTime: ISO, timeZone: 'Asia/Seoul'}
    let startObj: any
    let endObj: any

    if (allDay || (startRaw.length === 10 && (!endRaw || endRaw.length === 10))) {
      // 올데이로 처리
      // endRaw가 없으면 startRaw의 다음날로
      if (!endRaw) {
        const d = new Date(startRaw + 'T00:00:00+09:00')
        const next = new Date(d.getTime() + 24 * 60 * 60 * 1000)
        endRaw = next.toISOString().slice(0, 10) // YYYY-MM-DD
      }
      startObj = { date: startRaw }
      endObj = { date: endRaw } // Google은 end(종료일 다음날)를 기대하지만 FullCalendar는 endStr가 이미 exclusive인 편
    } else {
      // 시간 지정
      if (!endRaw) {
        // 기본 1시간
        const start = new Date(startRaw)
        const end = new Date(start.getTime() + 60 * 60 * 1000)
        endRaw = end.toISOString()
      }
      startObj = { dateTime: startRaw, timeZone: 'Asia/Seoul' }
      endObj = { dateTime: endRaw, timeZone: 'Asia/Seoul' }
    }

    const inserted = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: body.description || '',
        location: body.location || '',
        start: startObj,
        end: endObj,
      },
    })
    return NextResponse.json({ event: inserted.data })
  } catch (e: any) {
    console.error('[calendar/events POST] error:', e?.response?.data || e)
    return NextResponse.json(
      {
        error:
          e?.response?.data?.error?.message ||
          e?.response?.data?.error_description ||
          e?.response?.data?.error ||
          e?.message ||
          'failed_to_create_event',
      },
      { status: 500 }
    )
  }
}
