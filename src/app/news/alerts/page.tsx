'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// --- 키워드 시각화 컴포넌트 (기존 유지) ---
const KeywordVisualizer = ({ text }: { text: string }) => {
  if (text.includes('|')) {
    const parts = text.split('|').map(t => t.trim())
    return (
      <div className="flex flex-wrap gap-2 items-center">
        {parts.map((part, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {idx > 0 && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-1 rounded">OR</span>}
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-md text-sm font-medium border border-orange-200">
              {part}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const parts = text.split(/\s+/).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {parts.map((part, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {idx > 0 && <span className="text-xs font-bold text-blue-300">+</span>}
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium border border-blue-200">
            {part}
          </span>
        </div>
      ))}
    </div>
  )
}

// --- 인터페이스 수정: alert_filter 추가 ---
interface AlertKeyword {
  id: string
  keyword: string
  alert_filter: string | null // 알림 조건 (null이면 전체 알림)
  created_at: string
}

export default function NewsAlertPage() {
  const [keywords, setKeywords] = useState<AlertKeyword[]>([])
  const [input, setInput] = useState('')        // 수집 키워드
  const [filterInput, setFilterInput] = useState('') // 알림 필터 (추가됨)
  const [subCount, setSubCount] = useState(0)
  const [sendingTest, setSendingTest] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchData = useCallback(async () => {
    // 키워드 목록 (alert_filter 포함 조회)
    const { data: kData } = await supabase
      .from('alert_keywords')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (kData) setKeywords(kData as AlertKeyword[])

    // 구독자 수
    const { count } = await supabase
      .from('telegram_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      
    if (count !== null) setSubCount(count)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    
    // 로그인 체크
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      alert('관리자 로그인이 필요합니다.')
      return
    }

    const { error } = await supabase.from('alert_keywords').insert({ 
      keyword: input.trim(),
      alert_filter: filterInput.trim() || null, // 비어있으면 null로 저장
      created_by: session.user.id 
    })
    
    if (error) {
      if (error.code === '23505') alert('이미 등록된 키워드입니다.')
      else alert('오류가 발생했습니다: ' + error.message)
    } else {
      setInput('')
      setFilterInput('') // 필터 입력창도 초기화
      fetchData()
    }
  }

  const deleteKeyword = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('alert_keywords').delete().eq('id', id)
    fetchData()
  }

  // 전체 테스트 발송
  const sendTestBroadcast = async () => {
    if (subCount === 0) return alert('구독자가 없습니다.')
    if (!confirm(`현재 구독자 ${subCount}명 전원에게 테스트 메시지를 보냅니다.\n계속하시겠습니까?`)) return

    setSendingTest(true)
    try {
      const res = await fetch('/api/telegram/test-broadcast', { method: 'POST' })
      const json = await res.json()
      if (res.ok) alert(`성공적으로 발송했습니다! (성공: ${json.sent}/${json.total})`)
      else alert(`발송 실패: ${json.error}`)
    } catch (error) {
      console.error(error)
      alert('오류가 발생했습니다.')
    }
    setSendingTest(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">📢 뉴스 브리핑 센터</h1>
          <p className="text-gray-600">
            현재 <b>{subCount}명</b>의 구독자가 뉴스를 기다리고 있습니다.
          </p>
        </div>
        <button 
          onClick={sendTestBroadcast}
          disabled={sendingTest || subCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
        >
          {sendingTest ? '발송 중...' : '🔔 전체 테스트 발송'}
        </button>
      </div>
      
      {/* 입력 폼 (2단 구조로 변경) */}
      <div className="bg-gray-50 p-5 rounded-2xl mb-8 border border-gray-100">
        <h3 className="text-sm font-bold text-gray-700 mb-3">새로운 뉴스 주제 등록</h3>
        <form onSubmit={addKeyword} className="flex flex-col md:flex-row gap-3">
          {/* 1. 수집 키워드 */}
          <div className="flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="수집 검색어 (예: 한화투자증권)"
              className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
            <p className="text-xs text-gray-500 mt-1 pl-1">
              * 네이버 뉴스에서 검색할 단어입니다.
            </p>
          </div>

          {/* 2. 알림 조건 (필터) */}
          <div className="flex-1">
            <input
              type="text"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              placeholder="알림 조건 (선택사항, 예: 이벤트, 실적)"
              className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-green-500 outline-none transition"
            />
            <p className="text-xs text-gray-500 mt-1 pl-1">
              * 비워두면 모든 뉴스를 알림으로 보냅니다.
            </p>
          </div>

          <button 
            type="submit" 
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-sm transition whitespace-nowrap h-[50px]"
          >
            등록
          </button>
        </form>
      </div>

      <h2 className="text-lg font-bold text-gray-800 mb-4 pl-2 border-l-4 border-blue-500">
        편성된 키워드 ({keywords.length})
      </h2>
      
      {/* 키워드 목록 */}
      <ul className="grid gap-3">
        {keywords.map((item) => (
          <li key={item.id} className="flex flex-col md:flex-row md:justify-between md:items-center p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition group gap-4">
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">수집</span>
                <KeywordVisualizer text={item.keyword} />
              </div>
              
              {/* 알림 조건 표시 부분 */}
              <div className="flex items-center gap-2 text-sm">
                <span className={`text-xs font-bold px-2 py-1 rounded ${item.alert_filter ? 'text-green-700 bg-green-100' : 'text-gray-500 bg-gray-100'}`}>
                  알림
                </span>
                
                {item.alert_filter ? (
                  <div className="flex items-center gap-1 text-gray-700">
                    <span>조건:</span>
                    <span className="font-semibold text-green-700 bg-green-50 px-1 rounded">
                      {item.alert_filter.split(',').join(' OR ')}
                    </span>
                    <span>포함 시 발송</span>
                  </div>
                ) : (
                  <span className="text-gray-500">조건 없음 (모든 뉴스 발송)</span>
                )}
              </div>

              <span className="text-[10px] text-gray-400 font-mono ml-1">
                {new Date(item.created_at).toLocaleDateString()} 등록
              </span>
            </div>
            
            <button 
              onClick={() => deleteKeyword(item.id)} 
              className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition self-end md:self-center"
              title="삭제"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </li>
        ))}
        {keywords.length === 0 && (
          <li className="text-center text-gray-400 py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            등록된 키워드가 없습니다.<br/>위에서 새로운 뉴스 주제를 편성해보세요.
          </li>
        )}
      </ul>
    </div>
  )
}