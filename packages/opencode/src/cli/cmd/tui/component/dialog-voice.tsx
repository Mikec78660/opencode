import { createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { DialogSelect, type DialogSelectRef, type DialogSelectOption } from "@tui/ui/dialog-select"
import { Keybind } from "@/util/keybind"
import { TextAttributes } from "@opentui/core"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"

export function VoiceStatus(props: { enabled: boolean; loading: boolean }) {
  const { theme } = useTheme()
  if (props.loading) {
    return <span style={{ fg: theme.textMuted }}>⋯ Loading</span>
  }
  if (props.enabled) {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Enabled</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ Disabled</span>
}

export function DialogVoice() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [loading, setLoading] = createSignal<string | null>(null)

  const options = createMemo(() => [
    {
      value: "wake",
      title: "Wake Word Detection",
      description: "Enable wake word detection for voice input",
      footer: (
        <VoiceStatus enabled={sync.data.config?.voice?.wakewordEnabled || false} loading={loading() === "wake"} />
      ),
      category: undefined,
    },
  ])

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        if (loading() !== null) return

        setLoading("wake")
        try {
          await sdk.client.voice.wakeWord.toggle()
          sync.bootstrap()
        } catch (error) {
          console.error("Failed to toggle wake word:", error)
        } finally {
          setLoading(null)
        }
      },
    },
  ])

  return (
    <DialogSelect
      ref={setRef}
      title="Voice Settings"
      options={options()}
      keybind={keybinds()}
      onSelect={(option) => {}}
    />
  )
}
