'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()          // 클라 세션 종료
      await fetch('/api/logout', { method: 'POST' }) // 서버 쿠키 삭제
      router.replace('/login')               // 미들웨어가 보호하므로 어디든 가도 다시 로그인 요구
    } catch (e) {
      console.error(e)
      router.replace('/login')
    }
  }

  return (
    <button onClick={handleLogout} className="px-3 py-1 border rounded hover:bg-gray-50">
      로그아웃
    </button>
  )
}
