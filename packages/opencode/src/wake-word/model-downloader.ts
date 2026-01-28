import path from "path"

export const downloadModel = async () => {
  const userHome = process.env.HOME || "/tmp"
  const modelPath = path.join(userHome, ".opencode", "wakeword_models")

  const modelExists = await Bun.file(modelPath).exists()

  if (modelExists) {
    return {
      path: modelPath,
      downloaded: false,
    }
  }

  try {
    const response = await fetch(
      "https://github.com/dscripka/openWakeWord/releases/latest/download/openWakeWord-models.tar.gz",
    )

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()

    const dirExists = await Bun.file(path.dirname(modelPath)).exists()
    const dirPath = path.dirname(modelPath)

    if (!dirExists) {
      try {
        Bun.spawn([process.platform === "win32" ? "md" : "mkdir", "-p", dirPath])
      } catch {}
    }

    Bun.write(modelPath, new Uint8Array(buffer))

    return {
      path: modelPath,
      downloaded: true,
    }
  } catch (error) {
    return {
      path: modelPath,
      downloaded: false,
      error: error as Error,
    }
  }
}
