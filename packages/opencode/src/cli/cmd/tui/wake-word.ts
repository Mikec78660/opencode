import { tmpdir } from "os"
import path from "path"
import { WakeWordEngine } from "@/wake-word/engine"
import { randomUUID } from "crypto"
import { Config } from "@/config/config"

export interface WakeWordDetectionConfig {
  microphone?: string
}

const pickCommand = (captureDevice?: string) => {
  if (captureDevice) {
    const deviceArgs = captureDevice.split(":")
    return ["ffmpeg", "-f", deviceArgs[0], "-i", deviceArgs[1], "-ac", "1", "-ar", "16000", "-f", "s16le", "{output}"]
  }

  const defaultCommands = [
    ["ffmpeg", "-f", "pulse", "-i", "default", "-ac", "1", "-ar", "16000", "-f", "s16le", "{output}"],
    ["ffmpeg", "-f", "alsa", "-i", "default", "-ac", "1", "-ar", "16000", "-f", "s16le", "{output}"],
  ]

  for (const candidate of defaultCommands) {
    const bin = candidate[0]
    if (!bin) continue
    if (Bun.which(bin)) return candidate
  }

  return undefined
}

export namespace WakeWord {
  export interface DetectionOptions {
    transcriptionCallback?: () => void | Promise<void>
  }

  export function create(options?: DetectionOptions) {
    const state = {
      proc: undefined as ReturnType<typeof Bun.spawn> | undefined,
      output: undefined as string | undefined,
      isActive: false,
    }

    const start = async (): Promise<boolean> => {
      if (state.isActive) return false

      const config = await Config.get()
      const voiceConfig = config.voice
      if (!voiceConfig?.wakewordEnabled) {
        console.log("[INFO] Wake word detection not enabled in config")
        return false
      }

      const configObj: WakeWordDetectionConfig = {}
      const modelPath = path.join(process.env.HOME!, ".opencode/wakeword_models")
      const command = pickCommand(configObj.microphone)

      if (!command) return false

      state.output = path.join(tmpdir(), `opencode-wakeword-${randomUUID()}.pcm`)
      const args = command.map((entry) => entry.replaceAll("{output}", state.output!))

      state.proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      })

      const engine = new WakeWordEngine({
        modelPath,
      })

      console.log("[INFO] Wake word detection started")

      state.isActive = true

      return true
    }

    const stop = async () => {
      if (!state.proc || !state.output) return

      const target = state.proc
      state.proc = undefined
      const pathResult = state.output
      state.output = undefined

      const callback = options?.transcriptionCallback

      try {
        target.kill()
        await target.exited.catch(() => {})
      } catch {}

      await Bun.file(pathResult)
        .delete()
        .catch(() => {})

      state.isActive = false

      if (callback) {
        try {
          await callback()
        } catch (error) {
          console.log("[ERROR] Detection callback failed:", error)
        }
      }

      console.log("[INFO] Wake word detection stopped")
    }

    return {
      start,
      stop,
    }
  }
}
