import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"

export interface WakeWordDetectionConfig {
  modelPath: string
  confidence?: number
}

export interface DetectionResult {
  detected: boolean
  confidence?: number
}

export class WakeWordEngine {
  private config: WakeWordDetectionConfig

  constructor(config: WakeWordDetectionConfig) {
    this.config = config
  }

  async detect(audioStream: Blob | Iterable<Uint8Array>, options: { confidence?: number } = {}): Promise<boolean> {
    const confidenceThreshold = options.confidence ?? 0.5

    const pythonScriptPath = join(this.config.modelPath, "wake_word.py")
    const outputFile = join(tmpdir(), `wakeword-${randomUUID()}.pcm`)

    const spawnArgs = [
      "python3",
      pythonScriptPath,
      "--input",
      outputFile,
      "--model",
      this.config.modelPath,
      "--threshold",
      confidenceThreshold.toString(),
    ]

    const process = Bun.spawn(spawnArgs, { stdin: "pipe", stdout: "pipe", stderr: "pipe" })

    let audioBuffer: ArrayBuffer
    if (audioStream instanceof Blob) {
      audioBuffer = await audioStream.arrayBuffer()
    } else {
      audioBuffer = await new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of audioStream) {
              controller.enqueue(chunk)
            }
            controller.close()
          },
        }),
      ).arrayBuffer()
    }
    process.stdin.write(audioBuffer)
    process.stdin.end()

    const result = await process.exited
    const stdoutText = await new Response(process.stdout).text()
    const stderrText = await new Response(process.stderr).text()

    process.kill()

    await Bun.file(outputFile)
      .delete()
      .catch(() => {})

    if (result !== 0) {
      console.error("Wake word detection failed:", stderrText)
      return false
    }

    const output = stdoutText.toLowerCase()
    return output.includes("hey opencode")
  }
}
