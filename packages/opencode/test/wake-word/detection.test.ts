import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { WakeWordEngine } from "../../src/wake-word/engine"
import path from "path"

describe("WakeWord Detection", () => {
  let engine: WakeWordEngine

  beforeEach(() => {
    engine = new WakeWordEngine({
      modelPath: path.join(process.env.HOME!, ".opencode/wakeword_models"),
    })
  })

  test("detect() processes audio stream and returns boolean result", async () => {
    const audioStream = new Blob(["test audio"], { type: "audio/mpeg" })
    const result = await engine.detect(audioStream, { confidence: 0.5 })

    expect(typeof result).toBe("boolean")
  })

  test("detect() handles empty audio stream gracefully", async () => {
    const result = await engine.detect(new Blob([], { type: "audio/mpeg" }), { confidence: 0.5 })

    expect(typeof result).toBe("boolean")
  })

  test("detect() handles different confidence thresholds", async () => {
    const highThreshold = await engine.detect(new Blob(["audio"], { type: "audio/mpeg" }), { confidence: 0.9 })
    const lowThreshold = await engine.detect(new Blob(["audio"], { type: "audio/mpeg" }), { confidence: 0.1 })

    expect(typeof highThreshold).toBe("boolean")
    expect(typeof lowThreshold).toBe("boolean")
  })

  test("can create multiple engine instances", () => {
    const engine1 = new WakeWordEngine({
      modelPath: path.join(process.env.HOME!, ".opencode/wakeword_models"),
    })
    const engine2 = new WakeWordEngine({
      modelPath: path.join(process.env.HOME!, ".opencode/wakeword_models"),
    })

    expect(engine1).toBeDefined()
    expect(engine2).toBeDefined()
    expect(engine1).not.toBe(engine2)
  })
})
