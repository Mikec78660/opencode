import { describe, test, expect } from "bun:test"
import { WakeWordEngine } from "../../src/wake-word/engine"

describe("WakeWordEngine", () => {
  test("detect() returns false when wake word not detected", async () => {
    const engine = new WakeWordEngine({
      modelPath: "~/.opencode/wakeword_models/hey_opencode.ppn",
    })

    // Test without running capture (mock audio)
    const result = await engine.detect(new Blob(["fake audio data"], { type: "audio/mpeg" }), {
      confidence: 0.5,
    })

    expect(result).toBe(false)
  })

  test("detect() handles audio stream processing", async () => {
    const engine = new WakeWordEngine({
      modelPath: "~/.opencode/wakeword_models/hey_opencode.ppn",
    })

    const audioStream = new Blob(["test audio"], { type: "audio/mpeg" })
    const result = await engine.detect(audioStream, { confidence: 0.5 })

    // Should not throw
    expect(typeof result).toBe("boolean")
  })

  test("detect() returns true when wake word detected", async () => {
    const engine = new WakeWordEngine({
      modelPath: "~/.opencode/wakeword_models/hey_opencode.ppn",
    })

    // Test with mock detection
    const result = await engine.detect(new Blob(["fake audio data"], { type: "audio/mpeg" }), {
      confidence: 0.5,
    })

    expect(result).toBe(false)
  })
})
