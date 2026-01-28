import { describe, it, expect, beforeEach, mock } from "bun:test"
import { WakeWord } from "../../../../opencode/src/cli/cmd/tui/wake-word"
import { Config } from "../../../../opencode/src/config/config"

describe("Voice Wake Word Integration", () => {
  let wakeWord: ReturnType<typeof WakeWord.create>
  let mockTranscriptionCallback: ReturnType<typeof mock>
  let mockGetConfig: ReturnType<typeof mock>

  beforeEach(() => {
    mockTranscriptionCallback = mock(() => console.log("[INFO] Transcription triggered"))
    mockGetConfig = mock(async () => ({
      voice: {
        wakewordEnabled: true,
      },
    }))

    wakeWord = WakeWord.create({
      transcriptionCallback: mockTranscriptionCallback,
    })
  })

  describe("Detection flow", () => {
    it("should check config before starting", async () => {
      // When started with enabled config
      const result = await wakeWord.start()

      expect(result).toBe(true)
      expect(mockGetConfig).toHaveBeenCalled()
      expect(mockGetConfig.mock.calls.length).toBe(1)
    })

    it("should not start when wakewordEnabled is false", async () => {
      // Mock config with disabled wakeword
      Object.defineProperty(mockGetConfig.mock.results[0].value, "voice", {
        get: () => ({ wakewordEnabled: false }) as any,
      })

      wakeWord = WakeWord.create({
        transcriptionCallback: mockTranscriptionCallback,
      })

      const result = await wakeWord.start()

      expect(result).toBe(false)
    })

    it("should trigger transcription callback on stop", async () => {
      // Start detection
      await wakeWord.start()

      // Stop detection
      await wakeWord.stop()

      // Check if transcription callback was triggered
      // The callback should have been called once
      expect(mockTranscriptionCallback).toHaveBeenCalled()
      expect(mockTranscriptionCallback.mock.calls.length).toBe(1)
    })

    it("should set isActive state correctly", async () => {
      wakeWord = WakeWord.create()

      expect(await wakeWord.start()).toBe(true)
      expect((wakeWord as any).state.isActive).toBe(true)

      await wakeWord.stop()
      expect((wakeWord as any).state.isActive).toBe(false)
    })
  })

  describe("DetectionOptions interface", () => {
    it("should accept optional transcriptionCallback", async () => {
      // Test without callback
      wakeWord = WakeWord.create()
      await wakeWord.start()

      const stopPromise = wakeWord.stop()

      // Should not throw
      await expect(stopPromise).resolves.not.toThrow()
    })

    it("should accept async transcriptionCallback", async () => {
      const asyncCallback = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      wakeWord = WakeWord.create({
        transcriptionCallback: asyncCallback,
      })

      await wakeWord.start()
      await wakeWord.stop()

      expect(asyncCallback).toHaveBeenCalled()
    })
  })
})
