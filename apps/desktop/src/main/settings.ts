// TODO(PR3): replace with real electron-store once npm install + types align.
// Stub keeps the API shape identical so the oRPC surface is identical.
import { settingsRegistry, type SettingDefinition, type AppStore } from '@electron-template/api'

type Listener = () => void

class InMemoryStore implements AppStore {
  private data: Record<string, unknown>
  private listeners = new Set<Listener>()

  constructor(initial: Record<string, unknown>) {
    this.data = { ...initial }
  }

  get store(): Record<string, unknown> {
    return { ...this.data }
  }

  get(key: string): unknown {
    return this.data[key]
  }

  set(key: string, value: unknown): void {
    this.data[key] = value
    for (const l of this.listeners) l()
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

const defaults: Record<string, unknown> = { version: 1 }
for (const entry of settingsRegistry.entries) {
  if ('source' in entry && entry.source === 'globalDb') continue
  defaults[entry.key] = (entry as SettingDefinition).default
}

export const store: InMemoryStore = new InMemoryStore(defaults)
