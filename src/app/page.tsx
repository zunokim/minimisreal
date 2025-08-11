// src/app/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface WeatherData {
  current: {
    condition: { text: string; icon: string }
    temp_c: number
  }
  location: { name: string }
}

export default function Home() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  const [remaining, setRemaining] = useState('')
  const [weather, setWeather] = useState<WeatherData | null>(null)

  // 🔗 관련 사이트 (추후 추가만 하면 됨)
  const links = [
    { name: 'Circle', url: 'https://hisc.circle.hanwha.com/' },
    { name: '외부메일', url: 'https://mail.hanwhawm.com/' },
    { name: 'KOFIA', url: 'https://www.kofiabond.or.kr/' },
    { name: 'Chatgpt', url: 'https://chatgpt.com/' },
    { name: 'DART', url: 'http://dart.fss.or.kr/' },
    { name: '채널H', url: 'https://chhplus.hanwha.com/' },
    { name: '금융보안원', url: 'https://edu.fsec.or.kr/' },
  ]

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const days = ['일', '월', '화', '수', '목', '금', '토']
      const dayName = days[now.getDay()]
      setDate(`${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${dayName})`)
      setTime(now.toLocaleTimeString('ko-KR'))

      const endTime = new Date()
      endTime.setHours(17, 30, 0, 0)
      const diffMs = endTime.getTime() - now.getTime()
      if (diffMs <= 0) {
        setRemaining('퇴근 시간이 지났어요! 🎉')
      } else {
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000)
        setRemaining(`${diffHrs}시간 ${diffMins}분 ${diffSecs}초 남음`)
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather')
        const data = await res.json()
        setWeather(data)
      } catch (err) {
        console.error('날씨 정보를 불러오는 데 실패했습니다:', err)
      }
    }
    fetchWeather()
  }, [])

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-3xl font-bold mb-8">" 하싫핑 하하방 "</h1>

      <div className="mb-8 space-y-2">
        <p className="text-lg">📅 {date}</p>
        <p className="text-lg">⏰ {time}</p>
        <p className="text-lg">⏳ 퇴근까지 : {remaining}</p>
      </div>

      {weather && (
        <div className="flex items-center gap-4 bg-blue-100 p-4 rounded-lg shadow-md w-fit mb-8">
          <Image
            src={`https:${weather.current.condition.icon}`}
            alt="날씨"
            width={48}
            height={48}
          />
          <div>
            <p className="text-lg font-semibold">{weather.current.condition.text}</p>
            <p className="text-sm text-gray-700">
              {weather.current.temp_c}℃ / {weather.location.name}
            </p>
          </div>
        </div>
      )}

      {/* 🔗 관련 사이트 */}
      <section className="bg-white p-6 rounded-xl shadow border max-w-xl">
        <h2 className="text-xl font-bold mb-4">사이트 바로가기</h2>
        <ul className="space-y-2 list-disc list-inside">
          {links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {l.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
