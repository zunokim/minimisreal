'use client'

import { useEffect, useState } from 'react'

export default function LoginSuccessPage() {
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let mounted = true

    // 1) 쿠키가 브라우저에 실제로 적용됐는지 확인
    const check = async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store', credentials: 'include' })
        const json = await res.json()
        if (mounted && json?.user) {
          setOk(true)
          // 2) 적용 확인 후 '완전한 페이지 이동' (SPA push X)
          setTimeout(() => {
            window.location.replace('/')   // ✅ 미들웨어와 쿠키 동기화 확실
          }, 800)
        } else {
          // 아직 반영 전이면 조금 있다가 재시도
          setTimeout(check, 300)
        }
      } catch {
        setTimeout(check, 300)
      }
    }

    check()
    return () => { mounted = false }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow text-center">
        <p className="text-lg font-semibold">로그인이 완료되었습니다!</p>
        <p className="text-sm text-gray-600 mt-2">
          {ok ? '메인으로 이동 중…' : '세션 확인 중…'}
        </p>
      </div>
    </div>
  )
}
