// src/app/api/calendar/events/[id]/route.ts
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cal = await getAuthedCalendar()
    const body = await req.json()
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const patch: any = {}
    if (typeof body.title === 'string') patch.summary = body.title
    if (typeof body.description === 'string') patch.description = body.description
    if (typeof body.location === 'string') patch.location = body.location

    // allDay 여부에 따라 start/end 포맷 분기
    const allDay: boolean | undefined = typeof body.allDay === 'boolean' ? body.allDay : undefined
    const hasStart = typeof body.start === 'string'
    const hasEnd = typeof body.end === 'string'

    if (hasStart || hasEnd) {
      if (allDay || ((body.start?.length === 10) && (!body.end || body.end.length === 10))) {
        // 올데이: YYYY-MM-DD
        if (hasStart) patch.start = { date: body.start }
        if (hasEnd) patch.end = { date: body.end }
      } else {
        // 시간 지정
        if (hasStart) patch.start = { dateTime: body.start, timeZone: 'Asia/Seoul' }
        if (hasEnd) patch.end = { dateTime: body.end, timeZone: 'Asia/Seoul' }
      }
    }

    const updated = await cal.events.patch({
      calendarId,
      eventId: params.id,
      requestBody: patch,
    })
    return NextResponse.json({ event: updated.data })
  } catch (e: any) {
    console.error('[calendar/events PATCH] error:', e?.response?.data || e)
    return NextResponse.json(
      {
        error:
          e?.response?.data?.error?.message ||
          e?.response?.data?.error_description ||
          e?.response?.data?.error ||
          e?.message ||
          'failed_to_update_event',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cal = await getAuthedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'
    await cal.events.delete({ calendarId, eventId: params.id })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[calendar/events DELETE] error:', e?.response?.data || e)
    return NextResponse.json(
      {
        error:
          e?.response?.data?.error?.message ||
          e?.response?.data?.error_description ||
          e?.response?.data?.error ||
          e?.message ||
          'failed_to_delete_event',
      },
      { status: 500 }
    )
  }
}
