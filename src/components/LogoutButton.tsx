// src/components/LogoutButton.tsx
'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()

    // 서버 세션도 종료 (옵션)
    await fetch('/api/logout', { method: 'POST' })

    router.push('/login') // 로그인 페이지로 이동
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-red-600 hover:underline"
    >
      로그아웃
    </button>
  )
}
