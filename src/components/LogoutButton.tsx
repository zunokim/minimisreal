// src/components/LogoutButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleLogout = async () => {
    if (loading) return // 이중 클릭 방지
    setLoading(true)
    setErr(null)

    try {
      // 1) 클라이언트 세션 종료
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      // 2) 서버 쿠키 삭제 (네비게이션 직전 전송 보장용 keepalive)
      await fetch('/api/logout', { method: 'POST', keepalive: true })

      // 3) 로그인 페이지로 교체 이동
      router.replace('/login')
      // router.refresh() // 필요 시 새로고침까지 원하면 주석 해제
    } catch (e: any) {
      console.error(e)
      setErr(e?.message ?? '로그아웃 중 오류가 발생했습니다.')
      // 문제가 있어도 보호 라우팅을 깨끗이 하기 위해 로그인으로 보냅니다.
      router.replace('/login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        aria-busy={loading}
        aria-disabled={loading}
        className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 active:scale-95 transition disabled:opacity-60"
        title="로그아웃"
      >
        {loading ? '로그아웃 중…' : '로그아웃'}
      </button>

      {/* 선택: 에러 메세지 표시 */}
      {err && (
        <span role="alert" className="text-xs text-red-600">
          {err}
        </span>
      )}
    </div>
  )
}
