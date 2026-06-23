import { Minus, Square, X } from 'lucide-react'
import { Button } from '@electron-template/ui/components/button'

// Type declaration for the preload-exposed API.
// Must stay in sync with apps/desktop/src/preload/index.ts
declare global {
  interface Window {
    electronAPI?: {
      minimize: () => Promise<void>
      maximizeToggle: () => Promise<void>
      quit: () => Promise<void>
    }
  }
}

export function AppTitleBar() {
  return (
    <header
      className="sticky top-0 z-50 flex h-8 items-center justify-end gap-1 border-b border-border bg-background px-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={() => window.electronAPI?.maximizeToggle()}
    >
      <div className="flex-1" />
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.electronAPI?.minimize()}
          aria-label="Minimize"
        >
          <Minus className="size-3.5"/>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.electronAPI?.maximizeToggle()}
          aria-label="Maximize"
        >
          <Square className="size-3.5"/>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.electronAPI?.quit()}
          aria-label="Quit"
        >
          <X className="size-3.5"/>
        </Button>
      </div>
    </header>
  )
}