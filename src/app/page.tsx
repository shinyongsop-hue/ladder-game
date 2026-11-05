'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateId, generateAutoNames, generateLadder, computeResults } from '@/lib/ladder'

export default function Home() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [n, setN] = useState(4)
  const [prizes, setPrizes] = useState<string[]>(['당첨!', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleN = (val: number) => {
    setN(val)
    setPrizes(prev => {
      const next = [...prev]
      while (next.length < val) next.push('')
      return next.slice(0, val)
    })
  }

  const handleCreate = async () => {
    if (!title.trim()) { setError('제목을 입력해주세요'); return }
    const wonCount = prizes.filter(p => p.trim()).length
    if (wonCount === 0) { setError('당첨 항목을 하나 이상 입력해주세요'); return }
    setLoading(true)
    setError('')

    const id = generateId()
    const seed = generateId(8)
    const autoNames = generateAutoNames(n, seed)
    const { rungs, rows } = generateLadder(n, seed)
    const resultIndices = computeResults(n, rungs, rows)

    // Build results array: assign prizes to slots, rest are '꽝'
    const prizeList = prizes.filter(p => p.trim())
    const resultSlots = Array(n).fill('꽝')
    // Distribute prizes by result index
    prizeList.forEach((prize, i) => {
      if (i < n) resultSlots[i] = prize
    })
    // Map: start position i → result
    const results = resultIndices.map(ri => resultSlots[ri])

    const { error: dbErr } = await supabase.from('games').insert({
      id,
      title: title.trim(),
      config: { n, autoNames, results, prizes: prizeList, seed },
    })

    if (dbErr) { setError('저장 실패: ' + dbErr.message); setLoading(false); return }
    router.push(`/admin/${id}`)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-black text-center mb-2 bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
          🪜 사다리 게임
        </h1>
        <p className="text-center text-gray-400 text-sm mb-8">새 게임 만들기</p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold mb-1">게임 제목</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-400"
              placeholder="예: 오늘 점심 뭐 먹을까?"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">참여 인원: <span className="text-red-500 text-xl">{n}</span>명</label>
            <input type="range" min={2} max={10} value={n} onChange={e => handleN(Number(e.target.value))}
              className="w-full accent-red-500" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>2명</span><span>10명</span></div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">당첨 항목 <span className="text-gray-400 font-normal">(빈칸은 꽝)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {prizes.map((p, i) => (
                <input key={i}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                  placeholder={`${i + 1}번 항목`}
                  value={p}
                  onChange={e => setPrizes(prev => { const next = [...prev]; next[i] = e.target.value; return next })}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 disabled:opacity-50 transition"
          >
            {loading ? '생성 중...' : '🎲 게임 만들기'}
          </button>
        </div>
      </div>
    </main>
  )
}
