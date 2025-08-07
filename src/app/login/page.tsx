'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      alert('로그인 실패: ' + error.message)
    } else {
      await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: data.session?.access_token }),
      })
      router.push('/login/success')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">로그인</h2>
        <input
          type="email"
          placeholder="아이디 (이메일)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-b border-gray-400 w-full py-2 mb-6 focus:outline-none"
        />
        <input
          type="password"
          placeholder="패스워드"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-b border-gray-400 w-full py-2 mb-6 focus:outline-none"
        />
        <button
          onClick={handleLogin}
          className="bg-black text-white w-full py-2 rounded-lg hover:bg-gray-800"
        >
          Login
        </button>
      </div>
    </div>
  )
}
