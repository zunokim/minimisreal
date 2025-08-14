import { NextRequest, NextResponse } from 'next/server';
import { google, calendar_v3 } from 'googleapis';
import { getOAuthClient } from '@/lib/google';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type CreatePayload = {
  title: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  allDay: boolean;
};

async function getAuthedCalendar() {
  const { data, error } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('*')
    .eq('label', 'shared')
    .single();

  if (error || !data) throw new Error('Google not connected');

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: data.access_token || undefined,
    refresh_token: data.refresh_token || undefined,
    scope: data.scope || undefined,
    token_type: data.token_type || undefined,
    expiry_date: data.expiry_date || undefined,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function GET(req: NextRequest) {
  try {
    const cal = await getAuthedCalendar();
    const { searchParams } = new URL(req.url);
    const timeMin =
      searchParams.get('timeMin') ||
      new Date(new Date().setDate(1)).toISOString();
    const timeMax =
      searchParams.get('timeMax') ||
      new Date(
        new Date().setMonth(new Date().getMonth() + 2)
      ).toISOString();

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary';

    const resp = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Seoul',
      showDeleted: false,
      maxResults: 2500,
    });

    return NextResponse.json({ events: resp.data.items || [], calendarId });
  } catch (e: unknown) {
    const err = e as any;
    console.error('[calendar/events] error:', err?.response?.data || err);
    return NextResponse.json(
      {
        error:
          err?.response?.data?.error_description ||
          err?.response?.data?.error ||
          err?.message ||
          'failed_to_fetch_events',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const cal = await getAuthedCalendar();
    const body: CreatePayload = await req.json();
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary';

    if (!body.title || !body.start)
      throw new Error('title/start is required');

    let startObj: calendar_v3.Schema$EventDateTime = {};
    let endObj: calendar_v3.Schema$EventDateTime = {};
    let endRaw = body.end;

    if (
      body.allDay ||
      (body.start.length === 10 && (!endRaw || endRaw.length === 10))
    ) {
      if (!endRaw) {
        const d = new Date(body.start + 'T00:00:00+09:00');
        const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
        endRaw = next.toISOString().slice(0, 10);
      }
      startObj = { date: body.start };
      endObj = { date: endRaw };
    } else {
      if (!endRaw) {
        const start = new Date(body.start);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        endRaw = end.toISOString();
      }
      startObj = { dateTime: body.start, timeZone: 'Asia/Seoul' };
      endObj = { dateTime: endRaw, timeZone: 'Asia/Seoul' };
    }

    const inserted = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: body.title,
        description: body.description || '',
        location: body.location || '',
        start: startObj,
        end: endObj,
      },
    });
    return NextResponse.json({ event: inserted.data });
  } catch (e: unknown) {
    const err = e as any;
    console.error('[calendar/events POST] error:', err?.response?.data || err);
    return NextResponse.json(
      {
        error:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error_description ||
          err?.response?.data?.error ||
          err?.message ||
          'failed_to_create_event',
      },
      { status: 500 }
    );
  }
}
