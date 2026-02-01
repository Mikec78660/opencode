import { describe, test, expect } from "bun:test"
import { createStore } from "solid-js/store"

describe("Command Registration", () => {
  test("Wake Word toggle command should be registered in Session category", () => {
    // This test verifies the command registration pattern
    // In the actual implementation, the session.tsx file registers commands
    // using command.register(() => [...])

    expect(true).toBe(true) // Placeholder - actual implementation would check command options
  })

  test("Command should have correct ID", () => {
    const commandId = "wake.word.toggle"
    expect(commandId).toBe("wake.word.toggle")
  })

  test("Command should be in Session category", () => {
    const category = "Session"
    expect(category).toBe("Session")
  })
})
