// ✅ app/login/success/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/')
    }, 1500)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold text-green-600">로그인 성공 🎉</h1>
      <p className="mt-4 text-gray-600">잠시 후 메인 페이지로 이동합니다.</p>
    </div>
  )
}
