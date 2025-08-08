// src/app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (!email || !password) {
      setErrorMsg('이메일과 비밀번호를 입력하세요.')
      return
    }

    try {
      setLoading(true)

      // 1) Supabase로 이메일/비밀번호 로그인
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setErrorMsg(error.message)
        return
      }

      const access_token = data.session?.access_token
      const refresh_token = data.session?.refresh_token
      if (!access_token || !refresh_token) {
        setErrorMsg('세션 토큰을 받지 못했습니다. 다시 시도해 주세요.')
        return
      }

      // 2) 서버에 HTTP-only 쿠키로 저장
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, refresh_token }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setErrorMsg(`세션 저장 실패: ${text || res.statusText}`)
        return
      }

      // 3) 성공 페이지로 이동 (거기서 2초 뒤 홈으로 이동)
      router.push('/login/success')
    } catch (err) {
      setErrorMsg('알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      {/* 카드 */}
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6">로그인</h1>

        {/* 오류 메시지 */}
        {errorMsg && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="sr-only" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              placeholder="아이디 (이메일)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-gray-400 py-2 focus:outline-none"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="sr-only" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              placeholder="패스워드"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-gray-400 py-2 focus:outline-none"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? '로그인 중…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
