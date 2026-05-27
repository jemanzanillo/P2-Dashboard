import { ref } from 'vue'

const CHIME_NOTES = [880, 1047, 1319]   // A5 – C6 – E6 major triad
const NOTE_SPACING  = 0.18              // seconds between note onsets
const NOTE_DURATION = 0.60             // seconds each note sustains (with tail)
const CHIME_TOTAL   = NOTE_SPACING * (CHIME_NOTES.length - 1) + NOTE_DURATION  // ~0.96s
const TTS_DELAY_MS  = Math.round(CHIME_TOTAL * 1000) + 300  // chime + 300ms breath

export function useTurnAnnouncer() {
  const audioReady = ref(false)
  const voicesReady = ref(false)
  let ctx = null
  let pendingAnnounce = null   // queued call while ctx is suspended
  let voiceListenerInit = false
  let _keepaliveTimer    = null   // Gap A: prevent AudioContext auto-suspend
  let _ttsKeepaliveTimer = null   // Gap B: prevent Chrome speechSynthesis stall

  function initVoiceListener() {
    if (voiceListenerInit) return
    voiceListenerInit = true

    window.speechSynthesis.onvoiceschanged = () => {
      const voices = window.speechSynthesis.getVoices()
      voicesReady.value = voices.length > 0
      if (voices.length > 0) {
        console.debug('[TTS] Voices loaded:', voices.length)
      }
    }

    // Trigger initial check
    const initialVoices = window.speechSynthesis.getVoices()
    voicesReady.value = initialVoices.length > 0
    if (initialVoices.length > 0) {
      console.debug('[TTS] Initial voices available:', initialVoices.length)
    }
  }

  function getContext() {
    if (!ctx) {
      initVoiceListener()
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      ctx.onstatechange = () => {
        audioReady.value = ctx.state === 'running'
        if (ctx.state === 'running' && pendingAnnounce) {
          const fn = pendingAnnounce
          pendingAnnounce = null
          fn()
        }
      }

      // Gap A: browsers auto-suspend AudioContext after inactivity. Only the
      // initial creation requires a user gesture; subsequent resume() calls
      // from an interval are allowed. Poll every 30 s and resume if suspended.
      if (!_keepaliveTimer) {
        _keepaliveTimer = setInterval(() => {
          if (ctx && ctx.state !== 'running') ctx.resume()
        }, 30_000)
      }

      // Gap B: Chrome silently stops delivering TTS after ~15 min of silence.
      // A periodic cancel() pokes the synthesis engine and resets its idle timer.
      if (!_ttsKeepaliveTimer) {
        _ttsKeepaliveTimer = setInterval(() => {
          window.speechSynthesis.cancel()
        }, 10 * 60_000)
      }
    }
    audioReady.value = ctx.state === 'running'
    return ctx
  }

  function playChime(isRecall) {
    const audioCtx = getContext()
    const notes = isRecall ? [...CHIME_NOTES].reverse() : CHIME_NOTES
    notes.forEach((freq, i) => {
      _playNote(audioCtx, freq, audioCtx.currentTime + i * NOTE_SPACING, 0.28)
    })
  }

  function _playNote(audioCtx, freq, startTime, peakGain) {
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    osc.type = 'sine'
    osc.frequency.value = freq

    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + NOTE_DURATION)

    osc.start(startTime)
    osc.stop(startTime + NOTE_DURATION)
  }

  function buildText(turn) {
    const letter = turn.id[0]
    const digits = turn.id.slice(1).split('').join(' ')
    return `Turno ${letter}, ${digits}. Diríjase a ventanilla ${turn.counterId}.`
  }

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) {
      console.warn('[TTS] No voices available on this device', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      })
      return null
    }

    // Prefer female Latin American Spanish, fall back to any Spanish
    const ranked = [
      voices.find(v => v.lang.startsWith('es-419') && v.name.toLowerCase().includes('female')),
      voices.find(v => v.lang.startsWith('es-419')),
      voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('female')),
      voices.find(v => v.lang.startsWith('es')),
      voices[0], // Fallback to first available voice
    ]
    const selected = ranked.find(Boolean) ?? null
    if (!selected) {
      console.warn('[TTS] No Spanish voice found; available voices:', voices.map(v => `${v.lang}/${v.name}`))
    }
    return selected
  }

  function speak(turn) {
    try {
      window.speechSynthesis.cancel()
      const text = buildText(turn)
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang   = 'es-419'
      utterance.rate   = 0.88
      utterance.pitch  = 1.05
      utterance.volume = 1.0

      const voice = pickVoice()
      if (voice) {
        utterance.voice = voice
      }

      utterance.onerror = (evt) => {
        console.warn('[TTS] Error during speech synthesis', {
          error: evt.error,
          userAgent: navigator.userAgent,
          voicesAvailable: window.speechSynthesis.getVoices().length,
          text: text.substring(0, 50),
        })
      }

      utterance.onstart = () => {
        console.debug('[TTS] Speech started')
      }

      utterance.onend = () => {
        console.debug('[TTS] Speech ended')
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.error('[TTS] Exception during speech synthesis', {
        error: err.message,
        stack: err.stack,
      })
    }
  }

  function _doAnnounce(turn, isRecall) {
    playChime(isRecall)
    setTimeout(() => speak(turn), isRecall ? 600 : TTS_DELAY_MS)
  }

  function announce(turn, isRecall = false) {
    const audioCtx = getContext()
    if (audioCtx.state === 'suspended') {
      // Store the call; will fire once user taps to activate
      pendingAnnounce = () => _doAnnounce(turn, isRecall)
      audioCtx.resume()   // attempt resume (will succeed on next user gesture)
    } else {
      _doAnnounce(turn, isRecall)
    }
  }

  function requestAudioPermission() {
    const audioCtx = getContext()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    // Ensure voices are loaded (Chrome lazy-loads them)
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.getVoices()
    }
  }

  // Tear down keepalive timers and close the AudioContext when the FOH view
  // unmounts. Prevents ghost intervals if the component is ever remounted.
  function dispose() {
    clearInterval(_keepaliveTimer);    _keepaliveTimer    = null
    clearInterval(_ttsKeepaliveTimer); _ttsKeepaliveTimer = null
    if (ctx) { ctx.close(); ctx = null }
    audioReady.value = false
  }

  return { audioReady, voicesReady, announce, requestAudioPermission, dispose }
}
