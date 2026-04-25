import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION_WRITE from "./todowrite.txt"
import { Todo } from "../session/todo"

export const TodoWriteTool = Tool.define("todowrite", {
  description: DESCRIPTION_WRITE,
  parameters: z
    .object({
      todos: z.array(z.object(Todo.Info.shape)).describe("Full updated todo list"),
    })
    .or(
      z.object({
        ids: z.array(z.string()).describe("Todo IDs to update"),
        status: z
          .enum(["pending", "in_progress", "completed", "cancelled"])
          .describe("New status for specified todo IDs"),
        priority: z
          .enum(["high", "medium", "low"])
          .optional()
          .describe("Optional new priority"),
      }),
    ),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "todowrite",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    let todos: Todo.Info[]
    if ("ids" in params && params.ids && params.status) {
      todos = await Todo.patch({
        sessionID: ctx.sessionID,
        ids: params.ids,
        status: params.status,
        priority: params.priority,
      })
    } else {
      todos = (params as any).todos || []
      await Todo.update({
        sessionID: ctx.sessionID,
        todos,
      })
    }
    return {
      title: `${todos.filter((x) => x.status !== "completed").length} todos`,
      output: JSON.stringify(todos, null, 2),
      metadata: {
        todos,
      },
    }
  },
})

export const TodoReadTool = Tool.define("todoread", {
  description: "Use this tool to read your todo list",
  parameters: z.object({}),
  async execute(_params, ctx) {
    await ctx.ask({
      permission: "todoread",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const todos = await Todo.get(ctx.sessionID)
    return {
      title: `${todos.filter((x) => x.status !== "completed").length} todos`,
      metadata: {
        todos,
      },
      output: JSON.stringify(todos, null, 2),
    }
  },
})
