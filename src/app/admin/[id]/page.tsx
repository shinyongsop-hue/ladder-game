'use client'
import { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Game, Claim } from '@/lib/supabase'

type GameWithStatus = Game & { status?: string }

function AdminContent() {
  const { id } = useParams<{ id: string }>()
  const [game, setGame] = useState<GameWithStatus | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

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
    if (data) setGame(data as GameWithStatus)
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

  async function closeGame() {
    setClosing(true)
    await supabase.from('games').update({ status: 'closed' }).eq('id', id)
    setGame(prev => prev ? { ...prev, status: 'closed' } : prev)
    setClosing(false)
    setConfirmClose(false)
  }

  async function reopenGame() {
    await supabase.from('games').update({ status: 'open' }).eq('id', id)
    setGame(prev => prev ? { ...prev, status: 'open' } : prev)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">불러오는 중...</p></div>
  }

  if (!game) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">게임을 찾을 수 없습니다</p></div>
  }

  const { n, autoNames, results } = game.config
  const totalClaimed = claims.length
  const isClosed = game.status === 'closed'

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-6 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/caricature.webp" alt="" className="w-12 h-12 rounded-full object-cover border-2 border-red-100 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black">{game.title}</h1>
                  {isClosed && <span className="text-xs bg-gray-200 text-gray-500 rounded-full px-2 py-0.5 font-bold">종료됨</span>}
                </div>
                <p className="text-sm text-gray-400 mt-0.5">관리자 현황판</p>
              </div>
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

          {/* Game close/reopen */}
          <div className="mt-4">
            {!isClosed ? (
              confirmClose ? (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="flex-1 text-sm text-red-600 font-bold">정말 게임을 종료할까요? 참여자가 더 이상 참여할 수 없습니다.</p>
                  <button onClick={closeGame} disabled={closing}
                    className="bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50">
                    {closing ? '종료 중...' : '종료'}
                  </button>
                  <button onClick={() => setConfirmClose(false)} className="text-gray-400 text-sm px-2">취소</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClose(true)}
                  className="text-sm text-gray-400 border border-gray-200 rounded-lg px-4 py-2 hover:border-red-300 hover:text-red-500 transition">
                  🔒 게임 종료
                </button>
              )
            ) : (
              <button onClick={reopenGame}
                className="text-sm text-gray-400 border border-gray-200 rounded-lg px-4 py-2 hover:border-green-300 hover:text-green-500 transition">
                🔓 게임 재개
              </button>
            )}
          </div>

          {/* Share link */}
          <div className="mt-3 flex gap-2 items-center">
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
          <div className={n > 20 ? 'grid grid-cols-2 gap-2' : 'space-y-3'}>
            {Array.from({ length: n }, (_, i) => {
              const claim = getClaimForSlot(i)
              const isClaimed = !!claim
              const result = results[i]
              const isWon = result !== '꽝'
              const compact = n > 20

              return (
                <div key={i} className={`flex items-center gap-2 rounded-xl border-2 transition
                  ${compact ? 'p-2' : 'p-3'}
                  ${isClaimed ? 'border-gray-200 bg-gray-50' : 'border-dashed border-gray-200 bg-white'}`}>
                  {/* Slot number */}
                  <div className={`rounded-full flex items-center justify-center font-black flex-shrink-0
                    ${compact ? 'w-7 h-7 text-xs' : 'w-10 h-10 text-sm'}
                    ${isClaimed ? 'bg-gray-200 text-gray-600' : 'bg-red-100 text-red-500'}`}>
                    {i + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {isClaimed ? (
                      <>
                        <p className={`font-bold text-gray-800 truncate ${compact ? 'text-xs' : ''}`}>{claim!.real_name}</p>
                        {!compact && <p className="text-xs text-gray-400 truncate">{autoNames[i]}</p>}
                      </>
                    ) : (
                      <>
                        <p className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>미참여</p>
                        {!compact && <p className="text-xs text-gray-300">{autoNames[i]}</p>}
                      </>
                    )}
                  </div>

                  {/* Result badge */}
                  {isClaimed && (
                    <div className={`rounded-full font-bold flex-shrink-0 text-center
                      ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}
                      ${isWon ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                      {result}
                    </div>
                  )}
                  {!isClaimed && !compact && (
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
