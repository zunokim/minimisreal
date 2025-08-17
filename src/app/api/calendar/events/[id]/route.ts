// src/app/api/calendar/events/route.ts
import { NextResponse } from 'next/server'
import { google, calendar_v3 } from 'googleapis'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ListRange = {
  timeMin?: string
  timeMax?: string
}

type CreateEventBody = {
  title: string
  description?: string
  location?: string
  start: string
  end?: string
  allDay?: boolean
}

type GoogleErrData = {
  // Google API는 error가 string 또는 객체일 수 있음
  error?: { message?: string } | string
  error_description?: string
}

async function getAuthedCalendar(): Promise<calendar_v3.Calendar> {
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

// GET: 기간 내 이벤트 목록
export async function GET(req: Request) {
  try {
    const cal = await getAuthedCalendar()
    const { searchParams } = new URL(req.url)
    const timeMin =
      searchParams.get('timeMin') ||
      new Date(new Date().setDate(1)).toISOString()
    const timeMax =
      searchParams.get('timeMax') ||
      new Date(new Date().setMonth(new Date().getMonth() + 2)).toISOString()

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const resp = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 2500,
    })

    return NextResponse.json({ events: resp.data.items || [], calendarId })
  } catch (e: unknown) {
    const data = (e as { response?: { data?: GoogleErrData } })?.response?.data
    const msg =
      (typeof data?.error === 'string'
        ? data.error
        : data?.error?.message) ||
      data?.error_description ||
      (e as Error).message ||
      'failed_to_fetch_events'

    console.error('[calendar/events GET] error:', data || e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: 이벤트 생성
export async function POST(req: Request) {
  try {
    const cal = await getAuthedCalendar()
    const body = (await req.json()) as CreateEventBody

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const title = body.title || ''
    const allDay = !!body.allDay
    const constStartRaw: string = body.start // reassignment 없음
    let endRaw: string | undefined = body.end // 필요 시 계산하여 재할당

    if (!title || !constStartRaw) throw new Error('title/start is required')

    // Google API 입력 포맷 생성
    let startObj: calendar_v3.Schema$EventDateTime
    let endObj: calendar_v3.Schema$EventDateTime

    const isDateOnly =
      allDay ||
      (constStartRaw.length === 10 && (!endRaw || endRaw.length === 10))

    if (isDateOnly) {
      // 올데이: date 사용, end는 종료일의 다음날(FullCalendar와의 호환을 위해 날짜 그대로 전달해도 대부분 동작)
      if (!endRaw) {
        const d = new Date(constStartRaw + 'T00:00:00+09:00')
        const next = new Date(d.getTime() + 24 * 60 * 60 * 1000)
        endRaw = next.toISOString().slice(0, 10) // YYYY-MM-DD
      }
      startObj = { date: constStartRaw }
      endObj = { date: endRaw }
    } else {
      // 시간 지정: dateTime 사용
      if (!endRaw) {
        const s = new Date(constStartRaw)
        const e = new Date(s.getTime() + 60 * 60 * 1000)
        endRaw = e.toISOString()
      }
      startObj = { dateTime: constStartRaw, timeZone: 'Asia/Seoul' }
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
  } catch (e: unknown) {
    const data = (e as { response?: { data?: GoogleErrData } })?.response?.data
    const msg =
      (typeof data?.error === 'string'
        ? data.error
        : data?.error?.message) ||
      data?.error_description ||
      (e as Error).message ||
      'failed_to_create_event'

    console.error('[calendar/events POST] error:', data || e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
