'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Game, Claim } from '@/lib/supabase'
import { generateLadder, tracePath } from '@/lib/ladder'

type Phase = 'loading' | 'choose' | 'name' | 'animating' | 'result' | 'already' | 'closed'

function storageKey(gameId: string) { return `ladder_claimed_${gameId}` }
function getSavedClaim(gameId: string): { slot: number; name: string; result: string } | null {
  try { return JSON.parse(localStorage.getItem(storageKey(gameId)) || 'null') } catch { return null }
}
function saveClaim(gameId: string, slot: number, name: string, result: string) {
  try { localStorage.setItem(storageKey(gameId), JSON.stringify({ slot, name, result })) } catch { /* ignore */ }
}

function GameContent() {
  const { id } = useParams<{ id: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [selectedSlot, setSelectedSlot] = useState<number>(-1)
  const [myName, setMyName] = useState('')
  const [nameError, setNameError] = useState('')
  const [result, setResult] = useState('')
  const [savedClaim, setSavedClaim] = useState<{ slot: number; name: string; result: string } | null>(null)
  const [takenMsg, setTakenMsg] = useState('')
  const [animPath, setAnimPath] = useState<{ row: number; col: number }[]>([])
  const [animStep, setAnimStep] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sparkRef = useRef(0)

  useEffect(() => {
    const existing = getSavedClaim(id)
    if (existing) {
      setSavedClaim(existing)
      loadGame('already')
    } else {
      loadGame('choose')
    }
    const channel = supabase.channel(`claims:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: `game_id=eq.${id}` },
        () => loadClaims())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` },
        (payload) => {
          if ((payload.new as { status?: string }).status === 'closed') setPhase('closed')
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function loadGame(initialPhase: Phase) {
    const { data } = await supabase.from('games').select('*').eq('id', id).single()
    if (data) {
      const g = data as Game
      setGame(g)
      if ((g as Game & { status?: string }).status === 'closed') { setPhase('closed'); return }
      setPhase(initialPhase)
    }
    await loadClaims()
  }

  async function loadClaims() {
    const { data } = await supabase.from('claims').select('*').eq('game_id', id)
    if (data) setClaims(data as Claim[])
  }

  function isClaimed(slot: number) { return claims.some(c => c.slot === slot) }
  function getClaimName(slot: number) { return claims.find(c => c.slot === slot)?.real_name ?? null }

  function handleSelectSlot(slot: number) {
    if (isClaimed(slot)) {
      const name = getClaimName(slot)
      setTakenMsg(`${slot + 1}번은 이미 ${name ? `'${name}'님이` : '다른 분이'} 선택하셨습니다. 다른 번호를 선택해주세요.`)
      setTimeout(() => setTakenMsg(''), 3000)
      return
    }
    setTakenMsg('')
    setSelectedSlot(slot)
    setPhase('name')
    setNameError('')
  }

  async function handleConfirmName() {
    if (!myName.trim()) { setNameError('이름을 입력해주세요'); return }
    if (!game) return
    const { error } = await supabase.from('claims').insert({
      game_id: id, slot: selectedSlot, real_name: myName.trim(),
    })
    if (error) {
      if (error.code === '23505') {
        setNameError('방금 다른 분이 선택하셨습니다. 다른 번호를 선택해주세요')
        await loadClaims()
        setPhase('choose')
      } else { setNameError('오류: ' + error.message) }
      return
    }
    startAnimation()
  }

  function startAnimation() {
    if (!game) return
    const { n, seed } = game.config
    const { rungs, rows } = generateLadder(n, seed)
    const path = tracePath(selectedSlot, rungs, rows)
    setAnimPath(path)
    setAnimStep(0)
    sparkRef.current = 0
    setPhase('animating')
    animateStep(path, 0, rows)
  }

  function animateStep(path: { row: number; col: number }[], step: number, rows: number) {
    if (step >= path.length) {
      if (game) {
        const finalResult = game.config.results[selectedSlot]
        setResult(finalResult)
        saveClaim(id, selectedSlot, myName.trim(), finalResult)
        setSavedClaim({ slot: selectedSlot, name: myName.trim(), result: finalResult })
      }
      setPhase('result')
      return
    }
    setAnimStep(step)
    sparkRef.current = step
    animRef.current = setTimeout(() => animateStep(path, step + 1, rows), 35)
  }

  useEffect(() => { return () => { if (animRef.current) clearTimeout(animRef.current) } }, [])

  useEffect(() => {
    if (phase === 'animating' || phase === 'result') drawLadder()
  }, [animStep, phase, game])

  function drawLadder() {
    if (!game || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const { n, seed } = game.config
    const { rungs, rows } = generateLadder(n, seed)
    const W = canvas.width, H = canvas.height
    const pad = 30
    const colW = (W - pad * 2) / (n - 1)
    const rowH = (H - pad * 2) / rows

    ctx.clearRect(0, 0, W, H)

    // Vertical lines
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 2
    for (let c = 0; c < n; c++) {
      const x = pad + c * colW
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke()
    }

    // Rungs
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < n - 1; c++) {
        if (rungs[r][c]) {
          const x1 = pad + c * colW, x2 = pad + (c + 1) * colW
          const y = pad + (r + 0.5) * rowH
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
        }
      }
    }

    // Column labels
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    for (let c = 0; c < n; c++) ctx.fillText(`${c + 1}`, pad + c * colW, pad - 8)

    if (animPath.length === 0) return

    // === FUSE BURN ANIMATION ===
    const pts = animPath
    const curStep = Math.min(animStep, pts.length - 1)

    // Build polyline points
    const polyPts: [number, number][] = pts.slice(0, curStep + 1).map(pt => [
      pad + pt.col * colW,
      pad + (pt.row + 1) * rowH,
    ])

    // Draw burnt trail (dark grey/charcoal)
    if (polyPts.length > 1) {
      ctx.save()
      ctx.strokeStyle = '#374151'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(polyPts[0][0], polyPts[0][1])
      for (let i = 1; i < polyPts.length; i++) ctx.lineTo(polyPts[i][0], polyPts[i][1])
      ctx.stroke()

      // Glow/heat overlay on burnt trail
      ctx.strokeStyle = 'rgba(251,146,60,0.18)'
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(polyPts[0][0], polyPts[0][1])
      for (let i = 1; i < polyPts.length; i++) ctx.lineTo(polyPts[i][0], polyPts[i][1])
      ctx.stroke()
      ctx.restore()
    }

    if (phase === 'result') return

    // Ember/spark head at current position
    const [ex, ey] = polyPts[polyPts.length - 1] ?? [0, 0]

    // Outer glow
    const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 18)
    glow.addColorStop(0, 'rgba(255,200,50,0.9)')
    glow.addColorStop(0.3, 'rgba(255,100,20,0.6)')
    glow.addColorStop(1, 'rgba(255,50,0,0)')
    ctx.save()
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(ex, ey, 18, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // Inner bright core
    const core = ctx.createRadialGradient(ex, ey, 0, ex, ey, 6)
    core.addColorStop(0, '#fff')
    core.addColorStop(0.5, '#fde68a')
    core.addColorStop(1, '#f97316')
    ctx.save()
    ctx.fillStyle = core
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // Random sparks
    const rng = (Math.sin(animStep * 7.3) * 0.5 + 0.5)
    const sparkCount = 4
    ctx.save()
    for (let s = 0; s < sparkCount; s++) {
      const angle = (rng * Math.PI * 2) + s * (Math.PI * 2 / sparkCount)
      const len = 6 + rng * 10
      const sx = ex + Math.cos(angle) * len
      const sy = ey + Math.sin(angle) * len
      ctx.strokeStyle = `rgba(255,${150 + s * 20},0,${0.6 + s * 0.1})`
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sx, sy); ctx.stroke()
    }
    ctx.restore()
  }

  if (phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">불러오는 중...</p></div>
  }
  if (!game) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">게임을 찾을 수 없습니다</p></div>
  }

  if (phase === 'closed') {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-black mb-1">{game.title}</h1>
          <p className="text-gray-400 mt-2">이 게임은 종료되었습니다</p>
        </div>
      </main>
    )
  }

  if (phase === 'already' && savedClaim) {
    const isWon = savedClaim.result !== '꽝'
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <img src="/caricature.webp" alt="" className="w-20 h-20 rounded-full object-cover mx-auto mb-4 border-4 border-red-100" />
          <div className="text-4xl mb-2">{isWon ? '🎉' : '😢'}</div>
          <h1 className="text-xl font-black mb-1">{game.title}</h1>
          <p className="text-gray-400 text-sm mb-6">이미 참여하셨습니다</p>
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-500">{savedClaim.name}님 · {savedClaim.slot + 1}번 선택</p>
            <p className={`text-4xl font-black mt-2 ${isWon ? 'text-red-500' : 'text-gray-400'}`}>{savedClaim.result}</p>
          </div>
          <p className="text-xs text-gray-300">같은 기기에서는 1번만 참여 가능합니다</p>
        </div>
      </main>
    )
  }

  const { n, autoNames } = game.config

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-4">
      <div className="w-full max-w-lg">
        {/* Header with caricature */}
        <div className="flex items-center justify-center gap-3 mt-4 mb-1">
          <img src="/caricature.webp" alt="" className="w-10 h-10 rounded-full object-cover border-2 border-red-200" />
          <h1 className="text-2xl font-black">{game.title}</h1>
        </div>
        <p className="text-center text-gray-400 text-sm mb-6">번호를 선택해 사다리를 타세요</p>

        {/* Taken slot toast */}
        {takenMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-3 text-center">
            {takenMsg}
          </div>
        )}

        {(phase === 'choose' || phase === 'name') && (
          <div className="bg-white rounded-2xl shadow p-6 mb-4">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n <= 10 ? Math.min(n, 5) : n <= 20 ? 5 : 10}, 1fr)` }}>
              {Array.from({ length: n }, (_, i) => {
                const claimed = isClaimed(i)
                const claimName = getClaimName(i)
                const compact = n > 20
                return (
                  <button key={i}
                    onClick={() => handleSelectSlot(i)}
                    className={`flex flex-col items-center rounded-xl border-2 transition font-bold
                      ${compact ? 'py-2 px-1 text-xs' : 'py-3 px-2 text-sm'}
                      ${claimed ? 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed' :
                        selectedSlot === i && phase === 'name' ? 'border-red-500 bg-red-50 text-red-600' :
                        'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50'}`}>
                    <span className={`font-black ${compact ? 'text-sm' : 'text-xl'}`}>{i + 1}</span>
                    {!compact && (claimed && claimName ? (
                      <span className="text-xs text-gray-400 mt-1 truncate w-full text-center">{claimName}</span>
                    ) : (
                      <span className="text-xs text-gray-300 mt-1">{autoNames[i].split(' ')[1]}</span>
                    ))}
                    {compact && claimed && claimName && (
                      <span className="text-xs text-gray-400 truncate w-full text-center leading-tight">{claimName.slice(0, 4)}</span>
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

        {(phase === 'animating' || phase === 'result') && (
          <div className="bg-white rounded-2xl shadow p-4">
            <canvas ref={canvasRef} width={420} height={Math.max(300, n * 40)} className="w-full" style={{ display: 'block' }} />
            {phase === 'result' && (
              <div className="text-center mt-4 py-4 border-t">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <img src="/caricature.webp" alt="" className="w-8 h-8 rounded-full object-cover" />
                  <p className="text-gray-400 text-sm">{myName}님의 결과</p>
                </div>
                <p className={`text-4xl font-black mt-2 ${result === '꽝' ? 'text-gray-400' : 'text-red-500'}`}>{result}</p>
                <p className="text-xs text-gray-300 mt-3">같은 기기에서는 1번만 참여 가능합니다</p>
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
