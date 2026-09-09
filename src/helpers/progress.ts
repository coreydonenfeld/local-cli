const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80
const CLEAR_LINE = '\r\x1b[2K'

export interface Spinner {
  /** Replace the trailing text without disturbing the animation. */
  update(text: string): void
  /** Clear the spinner line, optionally leaving one final message in its place. */
  stop(finalText?: string): void
}

let active: {clear(): void; redraw(): void} | null = null

/**
 * Print above a running spinner instead of overwriting its line. Callers that
 * may or may not run under a spinner can use this in place of console.log.
 */
export function logAbove(text: string): void {
  if (!active) {
    console.log(text)
    return
  }
  active.clear()
  console.log(text)
  active.redraw()
}

/** Truncate to the terminal width; a wrapped line breaks carriage-return redraws. */
function fit(line: string): string {
  const width = process.stdout.columns || 80
  return line.length >= width ? line.slice(0, width - 1) : line
}

export function startSpinner(label: string): Spinner {
  // Piped output gets one plain line per state, so logs stay greppable.
  if (!process.stdout.isTTY) {
    console.log(label)
    return {
      update() {},
      stop(finalText) {
        if (finalText) console.log(finalText)
      },
    }
  }

  let text = label
  let frame = 0

  const draw = () => process.stdout.write(CLEAR_LINE + fit(`${FRAMES[frame]} ${text}`))
  const tick = () => {
    frame = (frame + 1) % FRAMES.length
    draw()
  }

  draw()
  const timer = setInterval(tick, FRAME_MS)
  timer.unref()
  active = {clear: () => process.stdout.write(CLEAR_LINE), redraw: draw}

  return {
    update(next) {
      text = next
    },
    stop(finalText) {
      clearInterval(timer)
      process.stdout.write(CLEAR_LINE)
      active = null
      if (finalText) console.log(finalText)
    },
  }
}
