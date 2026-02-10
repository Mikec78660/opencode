import * as ort from "onnxruntime-node"
import { getModelBuffer } from "./model-loader"
import { computeMelSpectrogram, normalizeAudio } from "./audio-processing"

export interface WakeWordDetectionConfig {
  modelPath: string
  confidence?: number
}

export class WakeWordEngine {
  private config: WakeWordDetectionConfig
  private session: ort.InferenceSession | null = null
  private modelLoaded = false
  private audioBuffer: Float32Array = new Float32Array(0)
  private readonly REQUIRED_SAMPLES = 15712 // Samples for 96 frames (95 * 160 + 512)

  constructor(config: WakeWordDetectionConfig) {
    this.config = config
  }

  async loadModel(): Promise<boolean> {
    if (this.modelLoaded) return true

    const modelBuffer = await getModelBuffer()
    if (!modelBuffer) {
      return false
    }

    try {
      this.session = await ort.InferenceSession.create(modelBuffer, {
        intraOpNumThreads: 1,
        interOpNumThreads: 1,
      })
      this.modelLoaded = true
      return true
    } catch (error) {
      return false
    }
  }

  async detect(audioChunk: Buffer, options: { confidence?: number } = {}): Promise<boolean> {
    const confidenceThreshold = options.confidence ?? 0.9965

    if (!this.modelLoaded) {
      const loaded = await this.loadModel()
      if (!loaded) return false
    }

    if (!this.session) return false

    try {
      // 1. Convert new chunk to normalized float samples
      const int16Array = new Int16Array(audioChunk.buffer, audioChunk.byteOffset, audioChunk.length / 2)
      const newSamples = normalizeAudio(int16Array)

      // Check for minimum energy to avoid triggers on silence
      let energy = 0
      for (let i = 0; i < newSamples.length; i++) {
        energy += newSamples[i] * newSamples[i]
      }
      const avgEnergy = energy / newSamples.length

      // If the chunk is almost silent, don't even add to buffer or process
      if (avgEnergy < 1e-6 && this.audioBuffer.length === 0) {
        return false
      }

      // 2. Append to rolling buffer
      const updatedBuffer = new Float32Array(this.audioBuffer.length + newSamples.length)
      updatedBuffer.set(this.audioBuffer)
      updatedBuffer.set(newSamples, this.audioBuffer.length)
      this.audioBuffer = updatedBuffer

      // 3. Ensure we have at least REQUIRED_SAMPLES
      if (this.audioBuffer.length < this.REQUIRED_SAMPLES) {
        return false
      }

      // 4. Keep buffer size reasonable
      if (this.audioBuffer.length > 32000) {
        this.audioBuffer = this.audioBuffer.slice(this.audioBuffer.length - this.REQUIRED_SAMPLES)
      }

      // 5. Compute mel spectrogram for current window
      const samplesToProcess = this.audioBuffer.slice(this.audioBuffer.length - this.REQUIRED_SAMPLES)
      const melSpectrogram = computeMelSpectrogram(samplesToProcess, 16000, 512, 160, 16)

      if (melSpectrogram.length < 16 * 96) {
        return false
      }

      // 6. Prepare input tensor (1, 16, 96)
      const inputData = new Float32Array(16 * 96)
      for (let mel = 0; mel < 16; mel++) {
        for (let frame = 0; frame < 96; frame++) {
          inputData[mel * 96 + frame] = melSpectrogram[mel * 96 + frame]
        }
      }

      const inputTensor = new ort.Tensor("float32", inputData, [1, 16, 96])
      const inputName = this.session.inputNames[0]
      const feeds: Record<string, ort.Tensor> = { [inputName]: inputTensor }
      const results = await this.session.run(feeds)

      const outputName = this.session.outputNames[0]
      const outputTensor = results[outputName]

      if (!outputTensor) {
        return false
      }

      const scores = outputTensor.data as Float32Array
      const maxScore = Math.max(...scores)

      if (maxScore > 0.4) {
        console.log(`[DEBUG] Wake word confidence: ${maxScore.toFixed(4)} (Threshold: ${confidenceThreshold})`)
      }

      const detected = maxScore >= confidenceThreshold
      if (detected) {
        console.log(`[INFO] Wake word detected with confidence ${maxScore.toFixed(4)}`)
        this.clearBuffer()
      }
      return detected
    } catch (error) {
      console.error("[ERROR] Wake word detection error:", error)
      return false
    }
  }

  clearBuffer(): void {
    this.audioBuffer = new Float32Array(0)
  }

  release(): void {
    if (this.session) {
      this.session.release()
      this.session = null
      this.modelLoaded = false
      this.audioBuffer = new Float32Array(0)
    }
  }
}
