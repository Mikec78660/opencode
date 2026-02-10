import { describeRoute, resolver } from "hono-openapi"
import { zValidator } from "@hono/zod-validator"
import z from "zod"
import { Config } from "@/config/config"
import { Alm } from "@/voice/alm"
import { Whisper } from "@/voice/whisper"
import { WakeWord } from "@/cli/cmd/tui/wake-word"
import { lazy } from "@/util/lazy"
import { Hono } from "hono"

const resolveType = (voice?: Config.Info["voice"]) => {
  if (voice?.type) return voice.type
  if (voice?.whisper?.apiKey && !voice?.alm?.apiKey) return "whisper"
  if (voice?.alm?.apiKey && !voice?.whisper?.apiKey) return "alm"
  if (voice?.whisper?.apiKey) return "whisper"
  if (voice?.alm?.apiKey) return "alm"
  return "whisper"
}

export const VoiceRoutes = lazy(() =>
  new Hono()
    .post(
      "/transcribe",
      describeRoute({
        summary: "Transcribe audio",
        description: "Transcribe an audio file with Whisper or an audio language model",
        operationId: "audio.transcribe",
        responses: {
          200: {
            description: "Transcription result",
            content: {
              "application/json": {
                schema: resolver(Whisper.Response),
              },
            },
          },
        },
      }),
      zValidator(
        "form",
        z.object({
          file: z.instanceof(File),
          sessionID: z.string().optional(),
          prompt: z.string().optional(),
        }),
      ),
      async (c) => {
        const data = c.req.valid("form")
        const file = data.file
        const mime = file.type || "audio/wav"
        const voice = (await Config.get()).voice
        const type = resolveType(voice)
        const result = await (type === "alm"
          ? Alm.transcribe({
            file,
            mime,
            sessionID: data.sessionID,
            prompt: data.prompt,
            voice,
          })
          : Whisper.transcribe({
            file,
            mime,
            sessionID: data.sessionID,
            prompt: data.prompt,
            voice,
          }))
        return c.json(result)
      },
    )
    .post(
      "/wake-word/toggle",
      describeRoute({
        summary: "Toggle wake word detection",
        description: "Start or stop wake word detection",
        operationId: "voice.wakeWord.toggle",
        responses: {
          200: {
            description: "Wake word toggle result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.boolean(),
                    status: z.enum(["started", "stopped", "failed"]),
                    message: z.string(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        try {
          const config = await Config.get()
          const currentEnabled = config.voice?.wakewordEnabled ?? false
          const newEnabled = !currentEnabled
          await Config.update({
            voice: {
              ...config.voice,
              wakewordEnabled: newEnabled,
            },
          })

          const wakeWordModule = await import("@/cli/cmd/tui/wake-word")
          let wakeWordInstance = (globalThis as any).wakeWordInstance

          if (!wakeWordInstance) {
            wakeWordInstance = wakeWordModule.WakeWord.create()
              ; (globalThis as any).wakeWordInstance = wakeWordInstance
          }

          const instance = await wakeWordInstance

          if (newEnabled) {
            const startResult = await instance.start()
            if (startResult) {
              return c.json({
                success: true,
                status: "started",
                message: "Wake word detection enabled and started",
              })
            } else {
              return c.json({
                success: true,
                status: "started",
                message: "Wake word detection enabled (but could not start - check config)",
              })
            }
          } else {
            await instance.stop()
            return c.json({
              success: true,
              status: "stopped",
              message: "Wake word detection disabled and stopped",
            })
          }
        } catch (error) {
          return c.json({
            success: false,
            status: "failed",
            message: error instanceof Error ? error.message : "Unknown error occurred",
          })
        }
      },
    ),
)
