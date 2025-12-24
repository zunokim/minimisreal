// src/app/news/alerts/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function NewsAlertPage() {
  const [keywords, setKeywords] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchKeywords = async () => {
    const { data } = await supabase
      .from('alert_keywords')
      .select('*')
      .order('created_at', { ascending: false })
    setKeywords(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchKeywords()
  }, [])

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const { error } = await supabase
      .from('alert_keywords')
      .insert({ keyword: input.trim() })

    if (error) {
      alert('이미 등록된 키워드이거나 오류가 발생했습니다.')
    } else {
      setInput('')
      fetchKeywords()
    }
  }

  const deleteKeyword = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('alert_keywords').delete().eq('id', id)
    fetchKeywords()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">🔔 뉴스 알림 키워드 관리</h1>
      
      {/* 입력 폼 */}
      <form onSubmit={addKeyword} className="flex gap-2 mb-8">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="알림 받을 키워드 입력 (예: 금리, 삼성전자)"
          className="flex-1 p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button 
          type="submit"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
        >
          추가
        </button>
      </form>

      {/* 목록 */}
      {loading ? (
        <div className="text-center text-gray-500">로딩 중...</div>
      ) : (
        <ul className="space-y-3">
          {keywords.map((item) => (
            <li 
              key={item.id} 
              className="flex justify-between items-center p-4 bg-white border rounded-lg shadow-sm hover:shadow-md transition"
            >
              <span className="font-medium text-lg text-gray-800">{item.keyword}</span>
              <button
                onClick={() => deleteKeyword(item.id)}
                className="text-red-500 hover:text-red-700 px-3 py-1 rounded border border-red-200 hover:bg-red-50 text-sm"
              >
                삭제
              </button>
            </li>
          ))}
          {keywords.length === 0 && (
            <li className="text-center text-gray-400 py-8">등록된 키워드가 없습니다.</li>
          )}
        </ul>
      )}
    </div>
  )
}