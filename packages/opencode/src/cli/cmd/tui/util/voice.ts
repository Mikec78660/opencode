import { tmpdir } from "os"
import path from "path"
import { Config } from "@/config/config"
import { Alm } from "@/voice/alm"
import { Whisper } from "@/voice/whisper"

export type VoiceConfig = {
  command?: string[]
  mime?: string
}

const defaultCommands = [
  ["ffmpeg", "-y", "-f", "pulse", "-i", "default", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
  ["ffmpeg", "-y", "-f", "alsa", "-i", "default", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
]

const defaultMime = "audio/wav"

const resolveType = (voice?: Config.Info["voice"]) => {
  if (voice?.type) return voice.type
  if (voice?.whisper?.apiKey && !voice?.alm?.apiKey) return "whisper"
  if (voice?.alm?.apiKey && !voice?.whisper?.apiKey) return "alm"
  if (voice?.whisper?.apiKey) return "whisper"
  if (voice?.alm?.apiKey) return "alm"
  return "whisper"
}

const pickCommand = (config?: VoiceConfig) => {
  if (config?.command?.length) return config.command
  for (const candidate of defaultCommands) {
    const bin = candidate[0]
    if (!bin) continue
    if (Bun.which(bin)) return candidate
  }
  return undefined
}

function getRMS(buffer: Buffer) {
  const samples = new Int16Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length) / 32768
}

function encodeWAV(samples: Buffer, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length)
  const view = new DataView(buffer)

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  /* RIFF identifier */
  writeString(view, 0, "RIFF")
  /* file length */
  view.setUint32(4, 32 + samples.length, true)
  /* RIFF type */
  writeString(view, 8, "WAVE")
  /* format chunk identifier */
  writeString(view, 12, "fmt ")
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, 1, true)
  /* channel count */
  view.setUint16(22, 1, true)
  /* sample rate */
  view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true)
  /* bits per sample */
  view.setUint32(34, 16, true)
  /* data chunk identifier */
  writeString(view, 36, "data")
  /* data chunk length */
  view.setUint32(40, samples.length, true)

  const wav = new Uint8Array(buffer)
  wav.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), 44)
  return wav
}

export namespace Voice {
  export function create(input: {
    config: () => VoiceConfig | undefined
    transcription?: () => Config.Info["voice"] | undefined
    sessionID?: () => string | undefined
    prompt?: () => string | undefined
    onSilence?: () => void
  }) {
    const state = {
      proc: undefined as ReturnType<typeof Bun.spawn> | undefined,
      audioChunks: [] as Buffer[],
      controller: undefined as AbortController | undefined,
      cancelled: false,
      isActive: false,
    }

    const isEnabled = () => {
      const voice = input.transcription?.()
      const type = resolveType(voice)
      if (type === "alm") return !!voice?.alm?.apiKey
      return !!voice?.whisper?.apiKey
    }

    const start = async () => {
      if (state.proc) return false
      const config = input.config()
      const command = pickCommand(config)
      if (!command) return false

      state.isActive = true
      state.audioChunks = []
      state.proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" })

      if (!state.proc.stdout || typeof state.proc.stdout === "number") {
        state.isActive = false
        state.proc.kill()
        state.proc = undefined
        return false
      }

      const reader = state.proc.stdout.getReader()
      let silenceStart: number | null = null

        ; (async () => {
          try {
            while (state.isActive) {
              const { done, value } = await reader.read()
              if (done) break
              const buffer = Buffer.from(value)
              state.audioChunks.push(buffer)

              const rms = getRMS(buffer)
              // Energy threshold for silence (adjust as needed)
              if (rms < 0.01) {
                if (silenceStart === null) silenceStart = Date.now()
                else if (Date.now() - silenceStart > 2000) {
                  input.onSilence?.()
                  break
                }
              } else {
                silenceStart = null
              }
            }
          } catch (error) {
            // Silence background stream errors in TUI
          } finally {
            reader.releaseLock()
          }
        })()

      return true
    }

    const stop = async () => {
      if (!state.isActive || !state.proc) return
      state.isActive = false

      const target = state.proc
      state.proc = undefined
      target.kill()
      await target.exited.catch(() => { })

      if (state.audioChunks.length === 0) return

      const fullBuffer = Buffer.concat(state.audioChunks)
      const wavData = encodeWAV(fullBuffer, 16000)

      const mime = "audio/wav"
      const apiFile = new File([wavData], "audio.wav", { type: mime })
      const voice = input.transcription?.()
      const type = resolveType(voice)

      state.cancelled = false
      state.controller = new AbortController()

      try {
        const result = await (type === "alm"
          ? Alm.transcribe({
            file: apiFile,
            mime,
            sessionID: input.sessionID?.(),
            prompt: input.prompt?.(),
            signal: state.controller.signal,
            voice,
          })
          : Whisper.transcribe({
            file: apiFile,
            mime,
            sessionID: input.sessionID?.(),
            prompt: input.prompt?.(),
            signal: state.controller.signal,
            voice,
          }))
          .then((response) => ({ text: response.text, cancelled: false }))
          .catch((error) => {
            if (error?.name === "AbortError" || state.cancelled) return { text: "", cancelled: true }
            throw error
          })
        state.controller = undefined
        return result
      } catch (error) {
        state.controller = undefined
        throw error
      }
    }

    const cancel = () => {
      state.isActive = false
      if (state.proc) {
        state.proc.kill()
        state.proc = undefined
      }
      if (!state.controller) return false
      state.cancelled = true
      state.controller.abort()
      return true
    }

    return {
      isEnabled,
      start,
      stop,
      cancel,
    }
  }
}
