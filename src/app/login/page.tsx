// src/app/login/page.tsx
'use client'

// (선택) 정적으로 프리렌더하지 말고 항상 동적 처리
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
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

    setLoading(true)
    try {
      // 1) Supabase 로그인
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setErrorMsg(error.message)
        return
      }
      const session = data.session
      if (!session) {
        setErrorMsg('세션 정보를 받지 못했습니다. 다시 시도해 주세요.')
        return
      }

      // 2) 클라이언트 세션 저장 (브라우저 getUser용)
      const { error: setErr } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      if (setErr) {
        setErrorMsg('클라이언트 세션 저장 실패: ' + setErr.message)
        return
      }

      // 3) 서버 쿠키 저장 (미들웨어 인증용)
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        credentials: 'include', // ✅ 쿠키 저장 보장
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setErrorMsg(`서버 세션 저장 실패: ${text || res.statusText}`)
        return
      }

      // 4) 완전 페이지 이동으로 쿠키/미들웨어 싱크 보장
      window.location.replace('/')
    } catch (err) {
      console.error('[login error]', err)
      setErrorMsg('알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white p-14 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6"> 경영관리 비밀연구소 </h1>

        {errorMsg && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="sr-only" htmlFor="email">이메일</label>
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
            <label className="sr-only" htmlFor="password">비밀번호</label>
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
