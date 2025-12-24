// src/app/api/telegram/webhook/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: string, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export async function POST(request: Request) {
  try {
    const update = await request.json()
    if (!update.message || !update.message.text) return NextResponse.json({ ok: true })

    const { chat, text, from } = update.message
    const chatId = chat.id.toString()

    // 1. /start 명령어가 오면 구독자로 등록
    if (text === '/start') {
      const { error } = await supabase
        .from('telegram_subscribers')
        .upsert({
          chat_id: chatId,
          first_name: from.first_name,
          username: from.username,
          is_active: true
        })

      if (!error) {
        await sendMessage(chatId, `
🎉 <b>환영합니다! 뉴스 알림 구독이 완료되었습니다.</b>

한화투자 증권의 뉴스 키워드에 맞춰
5분마다 최신 소식을 전해드립니다.

알림을 끄고 싶으시면 <code>/stop</code>을 입력해주세요.
        `)
      }
    } 
    // 2. /stop 명령어가 오면 구독 정지
    else if (text === '/stop') {
      await supabase
        .from('telegram_subscribers')
        .update({ is_active: false })
        .eq('chat_id', chatId)
      
      await sendMessage(chatId, '🔕 <b>알림이 중지되었습니다.</b>\n다시 받으려면 <code>/start</code>를 입력하세요.')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}