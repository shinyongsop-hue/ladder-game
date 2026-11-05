'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Game, Claim } from '@/lib/supabase'
import { generateLadder, tracePath } from '@/lib/ladder'

type Phase = 'loading' | 'choose' | 'name' | 'animating' | 'result' | 'claimed'

function GameContent() {
  const { id } = useParams<{ id: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [selectedSlot, setSelectedSlot] = useState<number>(-1)
  const [myName, setMyName] = useState('')
  const [nameError, setNameError] = useState('')
  const [result, setResult] = useState('')
  const [animPath, setAnimPath] = useState<{ row: number; col: number }[]>([])
  const [animStep, setAnimStep] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadGame()
    // Real-time subscription for claims
    const channel = supabase.channel(`claims:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: `game_id=eq.${id}` },
        () => loadClaims())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function loadGame() {
    const { data } = await supabase.from('games').select('*').eq('id', id).single()
    if (data) { setGame(data as Game); setPhase('choose') }
    await loadClaims()
  }

  async function loadClaims() {
    const { data } = await supabase.from('claims').select('*').eq('game_id', id)
    if (data) setClaims(data as Claim[])
  }

  function isClaimed(slot: number) {
    return claims.some(c => c.slot === slot)
  }

  function getClaimName(slot: number) {
    return claims.find(c => c.slot === slot)?.real_name ?? null
  }

  function handleSelectSlot(slot: number) {
    if (isClaimed(slot)) return
    setSelectedSlot(slot)
    setPhase('name')
    setNameError('')
  }

  async function handleConfirmName() {
    if (!myName.trim()) { setNameError('이름을 입력해주세요'); return }
    if (!game) return
    // Try to insert claim (PK prevents duplicates)
    const { error } = await supabase.from('claims').insert({
      game_id: id,
      slot: selectedSlot,
      real_name: myName.trim(),
    })
    if (error) {
      if (error.code === '23505') {
        setNameError('이미 선택된 번호입니다. 다른 번호를 선택해주세요')
        await loadClaims()
        setPhase('choose')
      } else {
        setNameError('오류: ' + error.message)
      }
      return
    }
    // Start animation
    startAnimation()
  }

  function startAnimation() {
    if (!game) return
    const { n, seed } = game.config
    const { rungs, rows } = generateLadder(n, seed)
    const path = tracePath(selectedSlot, rungs, rows)
    setAnimPath(path)
    setAnimStep(0)
    setPhase('animating')
    animateStep(path, 0, rows)
  }

  function animateStep(path: { row: number; col: number }[], step: number, rows: number) {
    if (step >= path.length) {
      // Done
      if (game) {
        setResult(game.config.results[selectedSlot])
      }
      setPhase('result')
      return
    }
    setAnimStep(step)
    animRef.current = setTimeout(() => animateStep(path, step + 1, rows), 40)
  }

  useEffect(() => {
    return () => { if (animRef.current) clearTimeout(animRef.current) }
  }, [])

  useEffect(() => {
    if (phase === 'animating' || phase === 'result') {
      drawLadder()
    }
  }, [animStep, phase, game])

  function drawLadder() {
    if (!game || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const { n, seed } = game.config
    const { rungs, rows } = generateLadder(n, seed)

    const W = canvas.width
    const H = canvas.height
    const pad = 30
    const colW = (W - pad * 2) / (n - 1)
    const rowH = (H - pad * 2) / rows

    ctx.clearRect(0, 0, W, H)

    // Draw vertical lines
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 2
    for (let c = 0; c < n; c++) {
      const x = pad + c * colW
      ctx.beginPath()
      ctx.moveTo(x, pad)
      ctx.lineTo(x, H - pad)
      ctx.stroke()
    }

    // Draw rungs
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < n - 1; c++) {
        if (rungs[r][c]) {
          const x1 = pad + c * colW
          const x2 = pad + (c + 1) * colW
          const y = pad + (r + 0.5) * rowH
          ctx.beginPath()
          ctx.moveTo(x1, y)
          ctx.lineTo(x2, y)
          ctx.stroke()
        }
      }
    }

    // Draw animated path
    if (animPath.length > 0) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 3
      ctx.beginPath()
      const start = animPath[0]
      ctx.moveTo(pad + start.col * colW, pad + (start.row + 1) * rowH)
      for (let i = 1; i <= Math.min(animStep, animPath.length - 1); i++) {
        const pt = animPath[i]
        ctx.lineTo(pad + pt.col * colW, pad + (pt.row + 1) * rowH)
      }
      ctx.stroke()

      // Draw dot at current position
      if (animStep < animPath.length) {
        const cur = animPath[Math.min(animStep, animPath.length - 1)]
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(pad + cur.col * colW, pad + (cur.row + 1) * rowH, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Column labels (top)
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    for (let c = 0; c < n; c++) {
      ctx.fillText(`${c + 1}`, pad + c * colW, pad - 8)
    }
  }

  if (phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">불러오는 중...</p></div>
  }

  if (!game) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">게임을 찾을 수 없습니다</p></div>
  }

  const { n, autoNames } = game.config

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-black text-center mt-4 mb-1">{game.title}</h1>
        <p className="text-center text-gray-400 text-sm mb-6">번호를 선택해 사다리를 타세요</p>

        {/* Slot selection */}
        {(phase === 'choose' || phase === 'name') && (
          <div className="bg-white rounded-2xl shadow p-6 mb-4">
            <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(n, 5)}, 1fr)` }}>
              {Array.from({ length: n }, (_, i) => {
                const claimed = isClaimed(i)
                const claimName = getClaimName(i)
                return (
                  <button key={i}
                    onClick={() => handleSelectSlot(i)}
                    disabled={claimed}
                    className={`flex flex-col items-center rounded-xl py-3 px-2 border-2 transition font-bold text-sm
                      ${claimed ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed' :
                        selectedSlot === i && phase === 'name' ? 'border-red-500 bg-red-50 text-red-600' :
                        'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50'}`}>
                    <span className="text-xl font-black">{i + 1}</span>
                    {claimed && claimName ? (
                      <span className="text-xs text-gray-400 mt-1 truncate w-full text-center">{claimName}</span>
                    ) : (
                      <span className="text-xs text-gray-300 mt-1">{autoNames[i].split(' ')[1]}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {phase === 'name' && (
              <div className="mt-5 border-t pt-4">
                <p className="text-sm text-gray-500 mb-2"><strong>{selectedSlot + 1}번</strong> 선택됨</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                    placeholder="이름을 입력하세요"
                    value={myName}
                    onChange={e => setMyName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleConfirmName()}
                    autoFocus
                  />
                  <button onClick={handleConfirmName}
                    className="bg-red-500 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-red-600 transition">
                    출발!
                  </button>
                </div>
                {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                <button onClick={() => { setPhase('choose'); setSelectedSlot(-1) }}
                  className="text-gray-400 text-xs mt-2 underline">취소</button>
              </div>
            )}
          </div>
        )}

        {/* Animation / Result */}
        {(phase === 'animating' || phase === 'result') && (
          <div className="bg-white rounded-2xl shadow p-4">
            <canvas
              ref={canvasRef}
              width={420}
              height={Math.max(300, n * 40)}
              className="w-full"
              style={{ display: 'block' }}
            />
            {phase === 'result' && (
              <div className="text-center mt-4 py-4 border-t">
                <p className="text-gray-400 text-sm">{myName}님의 결과</p>
                <p className={`text-4xl font-black mt-2 ${result === '꽝' ? 'text-gray-400' : 'text-red-500'}`}>
                  {result}
                </p>
                <button onClick={() => { setPhase('choose'); setSelectedSlot(-1) }}
                  className="mt-4 text-gray-400 text-sm underline">돌아가기</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">불러오는 중...</p></div>}>
      <GameContent />
    </Suspense>
  )
}
