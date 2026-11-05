'use client'
import { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Game, Claim } from '@/lib/supabase'

function AdminContent() {
  const { id } = useParams<{ id: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadAll()
    const channel = supabase.channel(`admin:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: `game_id=eq.${id}` },
        () => loadClaims())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function loadAll() {
    const { data } = await supabase.from('games').select('*').eq('id', id).single()
    if (data) setGame(data as Game)
    await loadClaims()
    setLoading(false)
  }

  async function loadClaims() {
    const { data } = await supabase.from('claims').select('*').eq('game_id', id)
    if (data) setClaims(data as Claim[])
  }

  function getClaimForSlot(slot: number): Claim | undefined {
    return claims.find(c => c.slot === slot)
  }

  function copyLink() {
    const url = `${window.location.origin}/game/${id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">불러오는 중...</p></div>
  }

  if (!game) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">게임을 찾을 수 없습니다</p></div>
  }

  const { n, autoNames, results } = game.config
  const totalClaimed = claims.length

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-6 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">{game.title}</h1>
              <p className="text-sm text-gray-400 mt-1">관리자 현황판</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-red-500">{totalClaimed}<span className="text-lg font-normal text-gray-400">/{n}</span></div>
              <p className="text-xs text-gray-400">참여 완료</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 bg-gray-100 rounded-full h-2">
            <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${(totalClaimed / n) * 100}%` }} />
          </div>

          {/* Share link */}
          <div className="mt-4 flex gap-2 items-center">
            <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500 truncate font-mono">
              {typeof window !== 'undefined' ? `${window.location.origin}/game/${id}` : `/game/${id}`}
            </div>
            <button onClick={copyLink}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${copied ? 'bg-green-500 text-white' : 'bg-red-500 text-white hover:bg-red-600'}`}>
              {copied ? '복사됨!' : '링크 복사'}
            </button>
          </div>
        </div>

        {/* Participant slots */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-bold text-gray-700 mb-4">참여 현황</h2>
          <div className="space-y-3">
            {Array.from({ length: n }, (_, i) => {
              const claim = getClaimForSlot(i)
              const isClaimed = !!claim
              const result = results[i]
              const isWon = result !== '꽝'

              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition
                  ${isClaimed ? 'border-gray-200 bg-gray-50' : 'border-dashed border-gray-200 bg-white'}`}>
                  {/* Slot number */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0
                    ${isClaimed ? 'bg-gray-200 text-gray-600' : 'bg-red-100 text-red-500'}`}>
                    {i + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {isClaimed ? (
                      <>
                        <p className="font-bold text-gray-800 truncate">{claim!.real_name}</p>
                        <p className="text-xs text-gray-400 truncate">{autoNames[i]}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-400 text-sm">미참여</p>
                        <p className="text-xs text-gray-300">{autoNames[i]}</p>
                      </>
                    )}
                  </div>

                  {/* Result badge */}
                  {isClaimed && (
                    <div className={`px-3 py-1 rounded-full text-sm font-bold flex-shrink-0
                      ${isWon ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                      {result}
                    </div>
                  )}
                  {!isClaimed && (
                    <div className="px-3 py-1 rounded-full text-xs text-gray-300 border border-dashed border-gray-200">
                      대기 중
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-4">실시간으로 업데이트됩니다</p>
      </div>
    </main>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">불러오는 중...</p></div>}>
      <AdminContent />
    </Suspense>
  )
}
