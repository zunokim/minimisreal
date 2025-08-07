// src/app/board/[id]/BoardDetailClient.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

// 게시글 타입
type Post = {
  id: string
  title: string
  content: string
  author: string | null
  created_at: string
}

// 댓글 타입
type Comment = {
  id: string
  post_id: string
  content: string
  author: string | null
  created_at: string
}

export default function BoardDetailClient({ postId }: { postId: string }) {
  const router = useRouter()

  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newComment, setNewComment] = useState('')

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')

  const [editingPost, setEditingPost] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingContent, setEditingContent] = useState('')

  // 초기 로드: 게시글 + 댓글
  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)

        // 게시글
        const { data: postData, error: postErr } = await supabase
          .from('posts')
          .select('*')
          .eq('id', postId)
          .single()

        if (postErr) throw postErr
        const typedPost = postData as Post
        setPost(typedPost)
        setEditingTitle(typedPost.title)
        setEditingContent(typedPost.content)

        // 댓글
        const { data: commentData, error: cErr } = await supabase
          .from('comments')
          .select('*')
          .eq('post_id', postId)
          .order('created_at', { ascending: true })

        if (cErr) throw cErr
        setComments((commentData ?? []) as Comment[])
      } catch (e) {
        const msg = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [postId])

  // 게시글 삭제
  const handleDeletePost = async () => {
    if (!confirm('이 게시글을 삭제할까요?')) return
    const { error: delErr } = await supabase.from('posts').delete().eq('id', postId)
    if (delErr) {
      alert(`삭제 실패: ${delErr.message}`)
      return
    }
    router.push('/board')
  }

  // 게시글 수정 저장
  const handleSavePost = async () => {
    if (!editingTitle.trim() || !editingContent.trim()) {
      alert('제목과 내용을 입력하세요.')
      return
    }
    const { error: upErr } = await supabase
      .from('posts')
      .update({ title: editingTitle, content: editingContent })
      .eq('id', postId)

    if (upErr) {
      alert(`수정 실패: ${upErr.message}`)
      return
    }

    setPost((prev) => (prev ? { ...prev, title: editingTitle, content: editingContent } : prev))
    setEditingPost(false)
  }

  // 댓글 등록
  const handleAddComment = async () => {
    const text = newComment.trim()
    if (!text) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const author = user?.email ?? '익명'

    const { data, error: insErr } = await supabase
      .from('comments')
      .insert({ post_id: postId, content: text, author })
      .select('*')
      .single()

    if (insErr) {
      alert(`댓글 등록 실패: ${insErr.message}`)
      return
    }

    setComments((prev) => [...prev, data as Comment])
    setNewComment('')
  }

  // 댓글 수정 시작/취소/저장
  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id)
    setEditingCommentText(c.content)
  }
  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditingCommentText('')
  }
  const saveEditComment = async () => {
    if (!editingCommentId) return
    const text = editingCommentText.trim()
    if (!text) {
      alert('내용을 입력하세요.')
      return
    }

    const { error: upErr } = await supabase
      .from('comments')
      .update({ content: text })
      .eq('id', editingCommentId)

    if (upErr) {
      alert(`댓글 수정 실패: ${upErr.message}`)
      return
    }

    setComments((prev) => prev.map((c) => (c.id === editingCommentId ? { ...c, content: text } : c)))
    setEditingCommentId(null)
    setEditingCommentText('')
  }

  // 댓글 삭제
  const handleDeleteComment = async (id: string) => {
    if (!confirm('이 댓글을 삭제할까요?')) return
    const { error: delErr } = await supabase.from('comments').delete().eq('id', id)
    if (delErr) {
      alert(`댓글 삭제 실패: ${delErr.message}`)
      return
    }
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  if (loading) return <div className="text-gray-600">불러오는 중...</div>

  if (error || !post) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">오류: {error ?? '게시글을 찾을 수 없습니다.'}</p>
        <Link href="/board" className="text-blue-600 underline">
          목록으로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      {/* 상단 액션 */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/board" className="text-blue-600 underline">
          ← 목록으로
        </Link>

        {!editingPost ? (
          <>
            <button
              onClick={() => setEditingPost(true)}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
            >
              게시글 수정
            </button>
            <button
              onClick={handleDeletePost}
              className="px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
            >
              게시글 삭제
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSavePost}
              className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              수정 저장
            </button>
            <button
              onClick={() => {
                setEditingPost(false)
                setEditingTitle(post.title)
                setEditingContent(post.content)
              }}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
            >
              취소
            </button>
          </>
        )}
      </div>

      {/* 게시글 */}
      {!editingPost ? (
        <article className="bg-white p-6 rounded-xl shadow border">
          <h1 className="text-2xl font-bold mb-2">{post.title}</h1>
          <p className="text-sm text-gray-500 mb-4">
            작성자: {post.author ?? '익명'} · {new Date(post.created_at).toLocaleString('ko-KR')}
          </p>
          <div className="whitespace-pre-wrap leading-7">{post.content}</div>
        </article>
      ) : (
        <div className="bg-white p-6 rounded-xl shadow border">
          <div className="mb-3">
            <label className="block text-sm mb-1">제목</label>
            <input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="제목을 입력하세요"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">내용</label>
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="w-full border rounded px-3 py-2 h-48"
              placeholder="내용을 입력하세요"
            />
          </div>
        </div>
      )}

      {/* 댓글 */}
      <section className="mt-8">
        <h2 className="text-xl font-bold mb-4">댓글 {comments.length}개</h2>

        <div className="flex gap-2 mb-6">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
            placeholder="댓글을 입력하세요"
          />
          <button
            onClick={handleAddComment}
            className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800"
          >
            등록
          </button>
        </div>

        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="bg-white p-4 rounded border">
              <div className="text-sm text-gray-500 mb-2">
                {c.author ?? '익명'} · {new Date(c.created_at).toLocaleString('ko-KR')}
              </div>

              {editingCommentId === c.id ? (
                <>
                  <textarea
                    value={editingCommentText}
                    onChange={(e) => setEditingCommentText(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditComment}
                      className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEditComment}
                      className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap leading-7 mb-2">{c.content}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditComment(c)}
                      className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteComment(c.id)}
                      className="px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
