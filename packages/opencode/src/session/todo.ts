import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"
import { Storage } from "../storage/storage"

export namespace Todo {
  export const Info = z
    .object({
      content: z.string().describe("Brief description of the task"),
      status: z.string().describe("Current status of the task: pending, in_progress, completed, cancelled"),
      priority: z.string().describe("Priority level of the task: high, medium, low"),
      id: z.string().describe("Unique identifier for the todo item"),
    })
    .meta({ ref: "Todo" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define(
      "todo.updated",
      z.object({
        sessionID: z.string(),
        todos: z.array(Info),
      }),
    ),
  }

  export async function update(input: { sessionID: string; todos: Info[] }) {
    await Storage.write(["todo", input.sessionID], input.todos)
    Bus.publish(Event.Updated, input)
  }

  export async function get(sessionID: string) {
    return Storage.read<Info[]>(["todo", sessionID])
      .then((x) => x || [])
      .catch(() => [])
  }

  export async function patch(input: {
    sessionID: string
    ids: string[]
    status: "pending" | "in_progress" | "completed" | "cancelled"
    priority?: "high" | "medium" | "low"
  }) {
    const todos = await get(input.sessionID)
    const updated = todos.map((todo) => {
      if (input.ids.includes(todo.id)) {
        return {
          ...todo,
          status: input.status,
          ...(input.priority ? { priority: input.priority } : {}),
        } as Info
      }
      return todo
    })
    await Storage.write(["todo", input.sessionID], updated)
    Bus.publish(Event.Updated, { sessionID: input.sessionID, todos: updated })
    return updated
  }
}
