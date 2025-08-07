'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

interface Post {
  id: string
  title: string
  content: string
  author: string
  created_at: string
}

export default function BoardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [email, setEmail] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  // 🔐 현재 로그인 사용자 이메일 불러오기
  const fetchUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.email) setEmail(user.email)
  }

  // 📥 게시글 목록 가져오기
  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setPosts(data)
    }
  }

  // ✏️ 글 작성 또는 수정
  const handleSubmit = async () => {
    if (!title || !content) {
      alert('제목과 내용을 입력하세요.')
      return
    }

    if (editingId) {
      // 수정 모드
      const { error } = await supabase
        .from('posts')
        .update({ title, content })
        .eq('id', editingId)

      if (error) {
        alert('수정 실패: ' + error.message)
      } else {
        setEditingId(null)
        setTitle('')
        setContent('')
        fetchPosts()
      }
    } else {
      // 새 글 작성
      const { error } = await supabase.from('posts').insert([
        { title, content, author: email },
      ])

      if (error) {
        alert('작성 실패: ' + error.message)
      } else {
        setTitle('')
        setContent('')
        fetchPosts()
      }
    }
  }

  // ✏️ 수정 시작
  const handleEdit = (post: Post) => {
    setEditingId(post.id)
    setTitle(post.title)
    setContent(post.content)
  }

  // 🗑️ 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    const { error } = await supabase.from('posts').delete().eq('id', id)

    if (!error) {
      fetchPosts()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  useEffect(() => {
    fetchUser()
    fetchPosts()
  }, [])

  return (
    <div className="p-10 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">
        {editingId ? '게시글 수정' : '새 게시글 작성'}
      </h2>

      {/* 📋 입력창 */}
      <input
        type="text"
        placeholder="제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border w-full p-2 mb-2"
      />
      <textarea
        placeholder="내용"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="border w-full p-2 h-40 mb-2"
      />
      <div className="flex gap-2 mb-6">
        <button
          onClick={handleSubmit}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {editingId ? '수정 완료' : '작성하기'}
        </button>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(null)
              setTitle('')
              setContent('')
            }}
            className="text-gray-500 border px-4 py-2 rounded"
          >
            취소
          </button>
        )}
      </div>

      {/* 📄 게시글 목록 */}
      <h2 className="text-xl font-bold mb-4">게시글 목록</h2>
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="border p-4 rounded">
            <h3 className="text-lg font-bold">
              <Link href={`/board/${post.id}`} className="text-blue-600 hover:underline">
                {post.title}
              </Link>
            </h3>
            <p>{post.content}</p>
            <div className="text-sm text-gray-500 mt-2">
              작성자: {post.author} <br />
              작성일: {new Date(post.created_at).toLocaleString()}
            </div>
            {post.author === email && (
              <div className="mt-2 flex gap-3">
                <button
                  onClick={() => handleEdit(post)}
                  className="text-blue-600 hover:underline"
                >
                  ✏️ 수정
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-red-600 hover:underline"
                >
                  🗑️ 삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
