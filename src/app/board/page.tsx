'use client'

import { useEffect, useMemo, useState } from 'react'
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

const PAGE_SIZE = 5

export default function BoardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 페이지네이션 & 검색
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')

  // 댓글 수 집계
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  )

  const fetchCommentCounts = async (postIds: string[]) => {
    if (postIds.length === 0) {
      setCommentCounts({})
      return
    }
    const results = await Promise.all(
      postIds.map(async (id) => {
        const { count } = await supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', id)
        return { id, count: count ?? 0 }
      })
    )
    const map: Record<string, number> = {}
    results.forEach(({ id, count }) => (map[id] = count))
    setCommentCounts(map)
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        let countReq = supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })

        if (query.trim()) {
          const kw = query.trim()
          countReq = countReq.or(`title.ilike.%${kw}%,author.ilike.%${kw}%`)
        }

        const { count, error: countErr } = await countReq
        if (countErr) throw countErr
        setTotal(count ?? 0)

        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let dataReq = supabase
          .from('posts')
          .select('id, title, content, author, created_at, user_id')
          .order('created_at', { ascending: false })
          .range(from, to)

        if (query.trim()) {
          const kw = query.trim()
          dataReq = dataReq.or(`title.ilike.%${kw}%,author.ilike.%${kw}%`)
        }

        const { data, error: dataErr } = await dataReq
        if (dataErr) throw dataErr

        const list = (data ?? []) as Post[]
        setPosts(list)
        await fetchCommentCounts(list.map((p) => p.id))
      } catch (e) {
        const msg = e instanceof Error ? e.message : '게시글을 불러오지 못했습니다.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [page, query])

  const onSearch = () => {
    setPage(1)
    setQuery(q)
  }
  const onReset = () => {
    setQ('')
    setQuery('')
    setPage(1)
  }

  // 페이지네이션
  const totalPagesComputed = totalPages
  const goPrev = () => setPage((p) => Math.max(1, p - 1))
  const goNext = () => setPage((p) => Math.min(totalPagesComputed, p + 1))
  const goPage = (p: number) => setPage(p)

  const pageNumbers = useMemo(() => {
    const arr: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPagesComputed, start + 4)
    for (let i = start; i <= end; i++) arr.push(i)
    return arr
  }, [page, totalPagesComputed])

  return (
    <div className="max-w-4xl">
      <section className="bg-white p-6 rounded-xl shadow border mb-6">
        <h2 className="text-xl font-bold mb-4">게시글 목록</h2>

        {loading && <div className="text-gray-600">불러오는 중…</div>}
        {error && <div className="text-red-600 mb-2">오류: {error}</div>}
        {!loading && posts.length === 0 && (
          <div className="text-gray-500">게시글이 없습니다.</div>
        )}

        <ul className="divide-y">
          {posts.map((p) => (
            <li key={p.id} className="py-3">
              <Link href={`/board/${p.id}`} className="block hover:bg-gray-50 rounded px-2 py-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {p.title}{' '}
                    <span className="text-gray-500 text-sm">
                      ({commentCounts[p.id] ?? 0})
                    </span>
                  </h3>
                  <span className="text-sm text-gray-500">
                    {p.author ?? '익명'} · {new Date(p.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2 mt-1">{p.content}</p>
              </Link>
            </li>
          ))}
        </ul>

        {/* 페이지네이션 */}
        {totalPagesComputed > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={goPrev}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            >
              이전
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => goPage(n)}
                className={[
                  'px-3 py-1 rounded border',
                  n === page
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 hover:bg-gray-50',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
            <button
              onClick={goNext}
              disabled={page === totalPagesComputed}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            >
              다음
            </button>
          </div>
        )}

        {/* 🔍 검색 & 새 글 작성 버튼 (하단 배치) */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              className="w-48 md:w-64 border rounded px-3 py-2"
              placeholder="제목/작성자 검색"
            />
            <button
              onClick={onSearch}
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50"
            >
              검색
            </button>
            <button
              onClick={onReset}
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50"
            >
              초기화
            </button>
          </div>
          <Link
            href="/board/new"
            className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800"
          >
            새 글 작성
          </Link>
        </div>
      </section>
    </div>
  )
}
