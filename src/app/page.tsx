'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  const [remaining, setRemaining] = useState('')
  const [weather, setWeather] = useState<any>(null)

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()

      // 요일 포함한 날짜 포맷
      const days = ['일', '월', '화', '수', '목', '금', '토']
      const dayName = days[now.getDay()]
      setDate(
        `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${dayName})`
      )

      setTime(now.toLocaleTimeString('ko-KR'))

      // 퇴근 시간 계산
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
      <h1 className="text-3xl font-bold mb-8">하싫핑 하하방</h1>

      <div className="mb-8 space-y-2">
        <p className="text-lg">📅 {date}</p>
        <p className="text-lg">⏰ {time}</p>
        <p className="text-lg">⏳ 퇴근까지 : {remaining}</p>
      </div>

      {weather && (
        <div className="flex items-center gap-4 bg-blue-100 p-4 rounded-lg shadow-md w-fit">
          <img
            src={`https:${weather.current.condition.icon}`}
            alt="날씨"
            className="w-12 h-12"
          />
          <div>
            <p className="text-lg font-semibold">
              {weather.current.condition.text}
            </p>
            <p className="text-sm text-gray-700">
              {weather.current.temp_c}℃ / {weather.location.name}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
