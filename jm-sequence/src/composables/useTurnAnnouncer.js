import { ref } from 'vue'

const CHIME_NOTES = [880, 1047, 1319]   // A5 – C6 – E6 major triad
const NOTE_SPACING  = 0.18              // seconds between note onsets
const NOTE_DURATION = 0.60             // seconds each note sustains (with tail)
const CHIME_TOTAL   = NOTE_SPACING * (CHIME_NOTES.length - 1) + NOTE_DURATION  // ~0.96s
const TTS_DELAY_MS  = Math.round(CHIME_TOTAL * 1000) + 300  // chime + 300ms breath

export function useTurnAnnouncer() {
  const audioReady = ref(false)
  let ctx = null
  let pendingAnnounce = null   // queued call while ctx is suspended

  function getContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      ctx.onstatechange = () => {
        audioReady.value = ctx.state === 'running'
        if (ctx.state === 'running' && pendingAnnounce) {
          const fn = pendingAnnounce
          pendingAnnounce = null
          fn()
        }
      }
    }
    audioReady.value = ctx.state === 'running'
    return ctx
  }

  function playChime(isRecall) {
    const audioCtx = getContext()
    if (isRecall) {
      // Single soft tone for recalls
      _playNote(audioCtx, 880, audioCtx.currentTime, 0.18)
    } else {
      CHIME_NOTES.forEach((freq, i) => {
        _playNote(audioCtx, freq, audioCtx.currentTime + i * NOTE_SPACING, 0.28)
      })
    }
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
    // Prefer female Latin American Spanish, fall back to any Spanish
    const ranked = [
      voices.find(v => v.lang.startsWith('es-419') && v.name.toLowerCase().includes('female')),
      voices.find(v => v.lang.startsWith('es-419')),
      voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('female')),
      voices.find(v => v.lang.startsWith('es')),
    ]
    return ranked.find(Boolean) ?? null
  }

  function speak(turn) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(buildText(turn))
    utterance.lang   = 'es-419'
    utterance.rate   = 0.88
    utterance.pitch  = 1.05
    utterance.volume = 1.0
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    window.speechSynthesis.speak(utterance)
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

  return { audioReady, announce, requestAudioPermission }
}
