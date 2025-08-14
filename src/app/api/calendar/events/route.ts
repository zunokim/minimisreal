// src/app/api/calendar/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { google, calendar_v3 } from 'googleapis'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type CreateEventBody = {
  title: string
  start: string
  end?: string
  allDay?: boolean
  description?: string
  location?: string
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

export async function GET(req: NextRequest) {
  try {
    const cal = await getAuthedCalendar()
    const { searchParams } = new URL(req.url)
    const timeMin =
      searchParams.get('timeMin') || new Date(new Date().setDate(1)).toISOString()
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
      timeZone: 'Asia/Seoul',
      showDeleted: false,
      maxResults: 2500,
    })

    return NextResponse.json({ events: resp.data.items || [], calendarId })
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { error_description?: string; error?: string } } }).response?.data?.error_description ||
      (e as { response?: { data?: { error?: string } } }).response?.data?.error ||
      (e as Error).message ||
      'failed_to_fetch_events'
    console.error('[calendar/events] error:', (e as { response?: { data?: unknown } }).response?.data || e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const cal = await getAuthedCalendar()
    const body = (await req.json()) as CreateEventBody
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const title = body.title || ''
    const startRaw = body.start            // <- prefer-const 대응
    let endRaw = body.end
    const allDay = !!body.allDay

    if (!title || !startRaw) throw new Error('title/start is required')

    // Google API 규칙에 맞춘 start/end
    let startObj: calendar_v3.Schema$EventDateTime
    let endObj: calendar_v3.Schema$EventDateTime

    if (allDay || (startRaw.length === 10 && (!endRaw || endRaw.length === 10))) {
      // 올데이
      if (!endRaw) {
        const d = new Date(startRaw + 'T00:00:00+09:00')
        const next = new Date(d.getTime() + 24 * 60 * 60 * 1000)
        endRaw = next.toISOString().slice(0, 10) // YYYY-MM-DD
      }
      startObj = { date: startRaw }
      endObj = { date: endRaw }
    } else {
      // 시간 지정
      if (!endRaw) {
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
  } catch (e: unknown) {
    const errResp =
      (e as { response?: { data?: { error?: { message?: string }; error_description?: string; error?: string } } }).response
        ?.data
    const msg =
      errResp?.error?.message ||
      errResp?.error_description ||
      errResp?.error ||
      (e as Error).message ||
      'failed_to_create_event'
    console.error('[calendar/events POST] error:', (e as { response?: { data?: unknown } }).response?.data || e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
