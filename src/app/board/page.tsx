// src/app/board/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Post = {
  id: string
  title: string
  content: string
  author: string | null
  created_at: string
  user_id: string | null
}

export default function BoardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  // 현재 로그인 사용자 (내 글 배지 등 표시 목적)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUserId(user?.id ?? null)

        const { data, error } = await supabase
          .from('posts')
          .select('id, title, content, author, created_at, user_id')
          .order('created_at', { ascending: false })
        if (error) throw error
        setPosts((data ?? []) as Post[])
      } catch (e) {
        const msg = e instanceof Error ? e.message : '게시글을 불러오지 못했습니다.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // ✅ 프로필에서 display_name 읽기
  const getDisplayName = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return '익명'
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    return profile?.display_name || '익명'
  }

  // ✅ 글 작성 시 user_id 저장 (RLS: with check (auth.uid() = user_id))
  const handleCreatePost = async () => {
    const t = title.trim()
    const c = content.trim()
    if (!t || !c) {
      alert('제목과 내용을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        alert('로그인이 필요합니다.')
        return
      }
      const author = await getDisplayName()

      const { data, error } = await supabase
        .from('posts')
        .insert({ title: t, content: c, author, user_id: user.id })
        .select('id, title, content, author, created_at, user_id')
        .single()
      if (error) throw error

      setPosts((prev) => [data as Post, ...prev])
      setTitle('')
      setContent('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      console.error('[posts.insert] 실패:', e)
      alert(`등록 실패: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <section className="mb-8 bg-white p-6 rounded-xl shadow border">
        <h2 className="text-xl font-bold mb-4">새 글 작성</h2>
        <div className="mb-3">
          <label className="block text-sm mb-1">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="제목을 입력하세요"
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full border rounded px-3 py-2 h-40"
            placeholder="내용을 입력하세요"
          />
        </div>
        <button
          onClick={handleCreatePost}
          disabled={saving}
          className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? '등록 중…' : '등록'}
        </button>
      </section>

      <section className="bg-white p-6 rounded-xl shadow border">
        <h2 className="text-xl font-bold mb-4">게시글 목록</h2>

        {loading && <div className="text-gray-600">불러오는 중…</div>}
        {error && <div className="text-red-600 mb-2">오류: {error}</div>}
        {!loading && posts.length === 0 && <div className="text-gray-500">첫 글을 작성해 보세요!</div>}

        <ul className="divide-y">
          {posts.map((p) => {
            const isMine = currentUserId && p.user_id === currentUserId
            return (
              <li key={p.id} className="py-3">
                <Link href={`/board/${p.id}`} className="block hover:bg-gray-50 rounded px-2 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{p.title}</h3>
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      {/* 필요하면 내 글 배지 표시 */}
                      {isMine && <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">내 글</span>}
                      {p.author ?? '익명'} · {new Date(p.created_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mt-1">{p.content}</p>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
