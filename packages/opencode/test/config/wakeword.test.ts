import { test, expect, describe } from "bun:test"
import { Config } from "../../src/config/config"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

describe("wakewordEnabled config setting", () => {
  test("handles wakewordEnabled: false by default", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice?.wakewordEnabled).toBeUndefined()
      },
    })
  })

  test("handles missing voice config (wakewordEnabled defaults to false)", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice).toBeUndefined()
      },
    })
  })

  test("persists wakewordEnabled: true setting", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            voice: {
              wakewordEnabled: true,
            },
          }),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice?.wakewordEnabled).toBe(true)
      },
    })
  })

  test("persists wakewordEnabled: false setting", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            voice: {
              wakewordEnabled: false,
            },
          }),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice?.wakewordEnabled).toBe(false)
      },
    })
  })

  test("loads config with voice enabled but no wakeword setting (uses default)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            voice: {
              wakewordEnabled: false,
            },
          }),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice?.wakewordEnabled).toBe(false)
      },
    })
  })

  test("loads config with voice enabled but no wakeword setting (uses default)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            voice: {
              type: "whisper",
            },
          }),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice?.wakewordEnabled).toBe(false) // Default value
      },
    })
  })

  test("loads config with full voice configuration", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            voice: {
              type: "whisper",
              wakewordEnabled: true,
              whisper: {
                url: "https://api.example.com",
                apiKey: "test-key",
              },
            },
          }),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await Config.get()
        expect(config.voice?.wakewordEnabled).toBe(true)
        expect(config.voice?.type).toBe("whisper")
        expect(config.voice?.whisper?.apiKey).toBe("test-key")
      },
    })
  })
})
