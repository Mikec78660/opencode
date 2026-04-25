import z from "zod"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { Bus } from "../bus"
import { File } from "../file"
import { FileTime } from "../file/time"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { trimDiff } from "./edit"
import { assertExternalDirectory } from "./external-directory"
import { FILE_HEADER_INSTRUCTION } from "@/agents/prompts/builder-shared"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Provider } from "../provider/provider"

const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5

async function getLatestModel(sessionID: string): Promise<string> {
   for await (const item of MessageV2.stream(sessionID)) {
     if (item.info.role === "user" && item.info.modelID && item.info.providerID) {
       return `${item.info.providerID}/${item.info.modelID}`
     }
   }
   const defaultModel = await Provider.defaultModel()
   return `${defaultModel.providerID}/${defaultModel.modelID}`
 }

 function getFileCommentStyle(filePath: string): { prefix: string; linePrefix: string; suffix: string; skipHeader?: boolean } {
   const ext = path.extname(filePath).toLowerCase()

   switch (ext) {
     case ".html":
       return { prefix: "<!--", linePrefix: " ", suffix: "-->" }
     case ".css":
       return { prefix: "/*", linePrefix: " ", suffix: "*/" }
     case ".js":
     case ".ts":
     case ".jsx":
     case ".tsx":
       return { prefix: "//", linePrefix: " ", suffix: "" }
     case ".py":
       return { prefix: "#", linePrefix: " ", suffix: "" }
     case ".json":
       return { prefix: "", linePrefix: "", suffix: "", skipHeader: true }
     default:
       return { prefix: "/*", linePrefix: " ", suffix: "*/" }
   }
 }

 function generateFileHeader(filename: string, author: string, filePath: string): string {
   const commentStyle = getFileCommentStyle(filePath)

   if (commentStyle.skipHeader) {
     return ""
   }

   const currentDate = new Date().toDateString()
   const descriptionLine = "[Descriptive explanation of what the code in the file does. List dependencies here.]"

   if (commentStyle.prefix === "//" || commentStyle.prefix === "#") {
     return `${commentStyle.prefix} ${filename}
${commentStyle.prefix}${commentStyle.linePrefix} ${descriptionLine}
${commentStyle.prefix}${commentStyle.linePrefix} 
${commentStyle.prefix}${commentStyle.linePrefix} Created on: ${currentDate}
${commentStyle.prefix}${commentStyle.linePrefix}     Author: ${author}`
   } else {
     return `${commentStyle.prefix} ${filename}
${commentStyle.linePrefix} *
${commentStyle.linePrefix} * ${descriptionLine}
${commentStyle.linePrefix} *
${commentStyle.linePrefix} * Created on: ${currentDate}
${commentStyle.linePrefix} *     Author: ${author}
${commentStyle.suffix}`
   }
 }

export const WriteTool = Tool.define("write", {
  description: DESCRIPTION,
  parameters: z.object({
    content: z.string().describe("The content to write to the file"),
    filePath: z.string().describe("The absolute path to the file to write (must be absolute, not relative)"),
  }),
  async execute(params, ctx) {
    const filepath = path.isAbsolute(params.filePath) ? params.filePath : path.join(Instance.directory, params.filePath)
    await assertExternalDirectory(ctx, filepath)

    const file = Bun.file(filepath)
    const exists = await file.exists()
    const contentOld = exists ? await file.text() : ""
    if (exists) await FileTime.assert(ctx.sessionID, filepath)

// For new files, prepend the file header
     const header = generateFileHeader(path.basename(filepath), await getLatestModel(ctx.sessionID), filepath)
     const contentToWrite = exists ? params.content : `${header}${header ? "\n\n" : ""}${params.content}`

    const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentToWrite))
    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Instance.worktree, filepath)],
      always: ["*"],
      metadata: {
        filepath,
        diff,
      },
    })

    await Bun.write(filepath, contentToWrite)
    await Bus.publish(File.Event.Edited, {
      file: filepath,
    })
    FileTime.read(ctx.sessionID, filepath)

    let output = "Wrote file successfully."
    await LSP.touchFile(filepath, true)
    const diagnostics = await LSP.diagnostics()
    const normalizedFilepath = Filesystem.normalizePath(filepath)
    let projectDiagnosticsCount = 0
    for (const [file, issues] of Object.entries(diagnostics)) {
      const errors = issues.filter((item) => item.severity === 1)
      if (errors.length === 0) continue
      const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
      const suffix =
        errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
      if (file === normalizedFilepath) {
        output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filepath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
        continue
      }
      if (projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
      projectDiagnosticsCount++
      output += `\n\nLSP errors detected in other files:\n<diagnostics file="${file}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
    }

    return {
      title: path.relative(Instance.worktree, filepath),
      metadata: {
        diagnostics,
        filepath,
        exists: exists,
      },
      output,
    }
  },
})
