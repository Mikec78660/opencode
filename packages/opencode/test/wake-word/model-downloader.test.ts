import { describe, test, expect } from "bun:test"
import { downloadModel } from "../../src/wake-word/model-downloader"

describe("Model Downloader", () => {
  describe("downloadModel", () => {
    test("should skip download when model already exists", async () => {
      const result = await downloadModel()
      expect(result.downloaded).toBe(false)
      expect(result.path).toContain("wakeword_models")
    })

    test("should use correct model path", async () => {
      const result = await downloadModel()
      expect(result.path).toContain(".opencode")
      expect(result.path).toContain("wakeword_models")
    })

    test("should handle errors gracefully when download fails", async () => {
      const originalFetch = global.fetch
      ;(global.fetch as any) = () => {
        const response = new Response("Not Found", { status: 404 })
        return Promise.resolve(response)
      }

      const result = await downloadModel()
      expect(result.downloaded).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.path).toContain("wakeword_models")

      global.fetch = originalFetch as any
    })
  })
})
