import { WakeWordEngine } from "@/wake-word/engine"
import { GlobalBus } from "@/bus/global"

export interface WakeWordDetectionConfig {
  microphone?: string
}

const pickCommand = (captureDevice?: string) => {
  if (captureDevice) {
    const deviceArgs = captureDevice.split(":")
    return ["ffmpeg", "-f", deviceArgs[0], "-i", deviceArgs[1], "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]
  }

  const defaultCommands = [
    ["ffmpeg", "-f", "pulse", "-i", "default", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    ["ffmpeg", "-f", "alsa", "-i", "default", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
  ]

  for (const candidate of defaultCommands) {
    const bin = candidate[0]
    if (!bin) continue
    if (Bun.which(bin)) return candidate
  }

  return undefined
}

export namespace WakeWord {
  export function create() {
    const state = {
      proc: undefined as ReturnType<typeof Bun.spawn> | undefined,
      isActive: false,
      audioBuffer: Buffer.alloc(0),
    }

    const CHUNK_SIZE = 2560

    const start = async (options: { microphone?: string } = {}): Promise<boolean> => {
      if (state.isActive) return false

      const command = pickCommand(options.microphone)

      if (!command) return false

      // Add -y just in case, similar to voice utility
      if (!command.includes("-y")) {
        command.splice(1, 0, "-y")
      }

      state.proc = Bun.spawn(command, {
        stdout: "pipe",
        stderr: "pipe",
      })

      const engine = new WakeWordEngine({
        modelPath: "",
      })

      const modelLoaded = await engine.loadModel()
      if (!modelLoaded) {
        console.error("[ERROR] Failed to load wake word model")
        state.proc?.kill()
        state.proc = undefined
        return false
      }

      state.isActive = true
      console.log("[INFO] Wake word detection started")

      if (!state.proc.stdout || typeof state.proc.stdout === "number") {
        state.isActive = false
        console.error("[ERROR] Failed to open stdout for wake word process")
        return false
      }

      const reader = state.proc.stdout.getReader()

      let lastDetectionTime = 0

      const processStream = async () => {
        try {
          while (state.isActive) {
            const { done, value } = await reader.read()
            if (done) {
              if (state.isActive) {
                state.isActive = false
              }
              break
            }

            state.audioBuffer = Buffer.concat([state.audioBuffer, Buffer.from(value)])

            while (state.audioBuffer.length >= CHUNK_SIZE) {
              const chunk = state.audioBuffer.subarray(0, CHUNK_SIZE)
              state.audioBuffer = state.audioBuffer.subarray(CHUNK_SIZE)

              try {
                const detected = await engine.detect(chunk)

                if (detected) {
                  const now = Date.now()
                  if (now - lastDetectionTime < 1000) {
                    continue
                  }
                  lastDetectionTime = now

                  state.audioBuffer = Buffer.alloc(0)

                  GlobalBus.emit("event", {
                    directory: process.cwd(),
                    payload: {
                      type: "tui.wakeword.detected",
                      properties: {
                        timestamp: now,
                      },
                    },
                  })
                }
              } catch (error) {
                // Silently handle detection errors in TUI
              }
            }
          }
        } catch (error) {
          // Silently handle stream errors in TUI
        } finally {
          reader.releaseLock()
        }
      }

      processStream().catch(() => {
        // Silently handle failures in background stream processing
      })

      return true
    }

    const stop = async () => {
      if (!state.proc) return

      const target = state.proc
      state.proc = undefined

      try {
        target.kill()
        await target.exited.catch(() => { })
      } catch { }

      state.isActive = false
      state.audioBuffer = Buffer.alloc(0)
    }

    return {
      start,
      stop,
    }
  }
}
