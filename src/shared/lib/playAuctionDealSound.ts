/** Короткий сигнал при появлении выгодного лота. AudioContext создаётся только после жеста пользователя (политика автовоспроизведения). */

let sharedCtx: AudioContext | null = null
let gestureListenersAttached = false

function getAudioCtor(): (typeof AudioContext) | null {
  const g = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

function attachGestureUnlock(): void {
  if (gestureListenersAttached || typeof document === 'undefined') return
  gestureListenersAttached = true

  const onFirstGesture = () => {
    document.removeEventListener('pointerdown', onFirstGesture, true)
    document.removeEventListener('keydown', onFirstGesture, true)
    const Ctor = getAudioCtor()
    if (!Ctor) return
    try {
      if (!sharedCtx) {
        sharedCtx = new Ctor()
      }
      void sharedCtx.resume()
    } catch {
      sharedCtx = null
    }
  }

  document.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true })
  document.addEventListener('keydown', onFirstGesture, { capture: true, passive: true })
}

attachGestureUnlock()

function playTone(audioCtx: AudioContext): void {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, audioCtx.currentTime)
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.07, audioCtx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(audioCtx.currentTime)
  osc.stop(audioCtx.currentTime + 0.24)
}

export function playAuctionDealSound(): void {
  try {
    const Ctor = getAudioCtor()
    if (!Ctor) return

    if (!sharedCtx) {
      // Ждём первого pointerdown/keydown — без этого new AudioContext даёт предупреждение в консоли.
      return
    }

    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().then(() => {
        try {
          playTone(sharedCtx!)
        } catch {
          // ignore
        }
      })
      return
    }

    playTone(sharedCtx)
  } catch {
    // ignore
  }
}
