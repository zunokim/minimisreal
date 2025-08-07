'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

interface Post {
  id: string
  title: string
  content: string
  author: string
  created_at: string
}

interface Comment {
  id: string
  post_id: string
  author: string
  content: string
  created_at: string
}

export default function PostDetailPage() {
  const { id } = useParams()
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [email, setEmail] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)

  useEffect(() => {
    fetchPost()
    fetchComments()
    fetchUser()
  }, [id])

  const fetchUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.email) setEmail(user.email)
  }

  const fetchPost = async () => {
    const { data } = await supabase.from('posts').select('*').eq('id', id).single()
    setPost(data)
  }

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', id)
      .order('created_at', { ascending: true })

    setComments(data || [])
  }

  const handleCommentSubmit = async () => {
    if (!commentText.trim()) return

    if (editingCommentId) {
      // ✏️ 수정
      const { error } = await supabase
        .from('comments')
        .update({ content: commentText })
        .eq('id', editingCommentId)

      if (!error) {
        setEditingCommentId(null)
        setCommentText('')
        fetchComments()
      }
    } else {
      // ➕ 새 댓글
      const { error } = await supabase.from('comments').insert([
        {
          post_id: id,
          content: commentText,
          author: email,
        },
      ])

      if (!error) {
        setCommentText('')
        fetchComments()
      }
    }
  }

  const handleCommentEdit = (comment: Comment) => {
    setEditingCommentId(comment.id)
    setCommentText(comment.content)
  }

  const handleCommentDelete = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return

    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    if (!error) {
      fetchComments()
    }
  }

  if (!post) return <p className="p-10">글을 불러오는 중입니다...</p>

  return (
    <div className="p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{post.title}</h1>
      <p className="mb-2">{post.content}</p>
      <div className="text-sm text-gray-500 mb-6">
        작성자: {post.author} | 작성일: {new Date(post.created_at).toLocaleString()}
      </div>

      <hr className="my-4" />

      <h2 className="text-xl font-semibold mb-2">💬 댓글</h2>

      {/* 댓글 입력 */}
      <div className="mb-4">
        <textarea
          className="border w-full p-2 mb-2"
          placeholder="댓글을 입력하세요"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
        <button
          onClick={handleCommentSubmit}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {editingCommentId ? '수정 완료' : '댓글 작성'}
        </button>
        {editingCommentId && (
          <button
            onClick={() => {
              setEditingCommentId(null)
              setCommentText('')
            }}
            className="ml-2 text-gray-500 border px-4 py-2 rounded"
          >
            취소
          </button>
        )}
      </div>

      {/* 댓글 목록 */}
      <ul className="space-y-2">
        {comments.map((c) => (
          <li key={c.id} className="border p-3 rounded">
            <p>{c.content}</p>
            <div className="text-xs text-gray-500 mt-1">
              작성자: {c.author} | {new Date(c.created_at).toLocaleString()}
            </div>
            {c.author === email && (
              <div className="mt-1 flex gap-3">
                <button
                  onClick={() => handleCommentEdit(c)}
                  className="text-blue-600 hover:underline"
                >
                  ✏️ 수정
                </button>
                <button
                  onClick={() => handleCommentDelete(c.id)}
                  className="text-red-600 hover:underline"
                >
                  🗑️ 삭제
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
