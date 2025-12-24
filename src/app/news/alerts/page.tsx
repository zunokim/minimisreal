// src/app/news/alerts/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function NewsAlertPage() {
  const [keywords, setKeywords] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [subCount, setSubCount] = useState(0) // 구독자 수 표시용

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchData = async () => {
    // 키워드 목록
    const { data: kData } = await supabase.from('alert_keywords').select('*').order('created_at', { ascending: false })
    if (kData) setKeywords(kData)

    // 현재 구독자 수 (재미 요소)
    const { count } = await supabase.from('telegram_subscribers').select('*', { count: 'exact', head: true }).eq('is_active', true)
    if (count !== null) setSubCount(count)
  }

  useEffect(() => { fetchData() }, [])

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const { error } = await supabase.from('alert_keywords').insert({ keyword: input.trim() })
    
    if (error) alert('이미 등록되었거나 권한이 없습니다.')
    else {
      setInput('')
      fetchData()
    }
  }

  const deleteKeyword = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('alert_keywords').delete().eq('id', id)
    fetchData()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8 border-b pb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">📢 뉴스 브리핑 설정</h1>
        <p className="text-gray-600">
          여기서 키워드를 등록하면, <b>현재 구독 중인 {subCount}명</b>의 텔레그램 사용자에게 뉴스가 발송됩니다.
        </p>
      </div>
      
      <form onSubmit={addKeyword} className="flex gap-2 mb-8">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="공유할 뉴스 키워드 (예: 금리인상)"
          className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button type="submit" className="bg-blue-600 text-white px-6 rounded-lg font-bold hover:bg-blue-700">
          등록
        </button>
      </form>

      <h2 className="font-bold text-gray-800 mb-4">등록된 키워드 ({keywords.length})</h2>
      <ul className="grid gap-3">
        {keywords.map((item) => (
          <li key={item.id} className="flex justify-between items-center p-4 bg-white border rounded-lg shadow-sm">
            <span className="font-medium text-lg text-gray-800">{item.keyword}</span>
            <button onClick={() => deleteKeyword(item.id)} className="text-red-500 hover:bg-red-50 px-3 py-1 rounded">
              삭제
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}