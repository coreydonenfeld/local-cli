const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80
const CLEAR_LINE = '\r\x1b[2K'

export interface Spinner {
  /** Replace the trailing text without disturbing the animation. */
  update(text: string): void
  /** Milliseconds since the spinner started, for a final timing message. */
  elapsed(): number
  /** Clear the spinner line, optionally leaving one final message in its place. */
  stop(finalText?: string): void
}

/** m:ss, counting past an hour rather than wrapping. */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
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

/**
 * Keep the line inside the terminal width; a wrapped line breaks
 * carriage-return redraws. Elides the middle so the counter at the start and
 * the elapsed time at the end both survive -- a long path is the part worth
 * losing.
 */
function fit(line: string): string {
  const width = (process.stdout.columns || 80) - 1
  if (line.length <= width) return line
  const head = Math.ceil((width - 1) / 2)
  return line.slice(0, head) + '…' + line.slice(line.length - (width - 1 - head))
}

export function startSpinner(label: string): Spinner {
  const started = Date.now()

  // Piped output gets one plain line per state, so logs stay greppable.
  if (!process.stdout.isTTY) {
    console.log(label)
    return {
      update() {},
      elapsed: () => Date.now() - started,
      stop(finalText) {
        if (finalText) console.log(finalText)
      },
    }
  }

  let text = label
  let frame = 0

  // Elapsed is redrawn every frame, so a long stall still visibly ticks.
  const draw = () =>
    process.stdout.write(CLEAR_LINE + fit(`${FRAMES[frame]} ${text} · ${formatDuration(Date.now() - started)}`))
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
    elapsed: () => Date.now() - started,
    stop(finalText) {
      clearInterval(timer)
      process.stdout.write(CLEAR_LINE)
      active = null
      if (finalText) console.log(finalText)
    },
  }
}
