# TUI Design Patterns

Lessons from building an interactive CLI for Local (WordPress dev tool). These are split into general design patterns (applicable to any TUI) and implementation notes specific to the Node.js/inquirer stack we used.

---

## Design Patterns

### Default to interactive, degrade to scriptable

No args → interactive TUI. Flags and args → pipe-friendly stdout. Two audiences, one tool. The interactive mode isn't a wrapper around the CLI commands - it shares the same API layer but has its own UX. Don't try to make one mode pretend to be the other.

### Screen-as-state, not append-as-log

Each state is a full screen clear + redraw. No leftover text from previous actions. The user always sees exactly one "screen" worth of info. This was the single biggest UX improvement - before this, actions appended output and the terminal became a messy scrolling log.

### Notice → Details → Actions layout

```
✓ Copied to clipboard!        ← notice (transient, from last action)
──────────────────────────────
Name:   KWF                    ← details (always present)
ID:     nZcTUohgM
Status: running
URL:    http://kwf.local
──────────────────────────────
? Choose an action:            ← actions
```

Three zones, always in the same order. The notice area at the top gives feedback without a modal or a separate screen. It naturally disappears on the next redraw. Details are always visible so you never lose context about what you're acting on.

### Universal quit

`q` exits from anywhere. In search it filters to a quit option. In menus it's a shortcut. In text inputs it throws a quit signal. Users never feel trapped.

### Shortcut keys alongside navigation

Show shortcut labels in the choices themselves (`[o] ↗ Open in browser`). Users who know the keys act instantly. Users who don't can arrow around and discover them. The labels teach the shortcuts without a separate help screen.

### Confirmation scales with danger

- View/copy: instant, no confirmation
- Start/stop: instant (reversible)
- Delete: confirm prompt, default "no"
- Push to production: extra explicit confirm, default "no"
- Destructive actions always create a backup first

The number of friction points should match how hard the action is to undo.

### Search IS navigation

Don't build a separate menu system. A search/filter prompt with dynamic choices IS the navigation. Type to filter, type "q" to quit, type "+" to create. The search input is the universal entry point.

### Unicode symbols, not emoji

Emoji render inconsistently across terminals, SSH sessions, and fonts. Unicode symbols (`●`, `○`, `■`, `▶`, `↻`, `✓`, `▲`, `⟵`, `↗`) are consistent everywhere and look cleaner.

### Shared display, not per-command formatting

One set of display helpers used by every command and the TUI. When you change the panel format, it changes everywhere. When the standalone command and the TUI action show the same output, users trust the tool.

### Helpers as a service layer

```
commands/     ← thin UX shells (prompts, formatting, flow)
helpers/
  api         ← what to do (business logic, mutations)
  display     ← how to show it (formatting, colors)
  prompts     ← how to ask (shared prompt config)
```

Commands contain zero business logic. If you're writing the same try/catch in multiple commands, extract it into a base class or shared helper.

---

## What doesn't work well

### Alt screen buffer + interactive prompts

The alternate screen buffer (`\x1b[?1049h`, like vim/less) would let you restore the terminal on exit. But interactive prompt libraries often conflict with it - stdin handling breaks and prompts immediately exit. If you need alt screen, you probably need fully custom rendering (no prompt library).

### clearScreen loses scrollback

`\x1b[2J\x1b[H` clears the visible screen. Adding `\x1b[3J` also clears scrollback, which is too aggressive - users can't scroll up to see previous terminal output after exiting. But without it, "previous screens" are still in scrollback which can be confusing. No perfect answer here.

### No good loading states for async operations

A frozen screen during a 5-second API call feels broken. Dots (`process.stdout.write('.')`) are primitive. A proper spinner helps but adds complexity with prompt library rendering. Plan for this early if your operations are slow.

---

## Implementation Notes (Node.js / @inquirer)

These are specific to the stack we used (`@inquirer/search`, `@inquirer/select`, oclif). The design patterns above apply regardless of stack.

### Shortcut keys with @inquirer/select

Race the select prompt against a raw stdin listener. The `selectWithShortcuts()` pattern: create an `AbortController`, launch `select()` with its signal, listen on `stdin` for shortcut keys, resolve whichever fires first. If the shortcut wins, abort the select.

Caveat: shortcut keys conflict with search input. Only use shortcuts on `select` (no typing), not on `search` (where keys are input characters).

### @inquirer/search done-line residue

When the search prompt completes, it renders a collapsed "done" line. Suppressing it with a custom theme (empty prefix, empty answer style) helps but doesn't fully eliminate it. This is a library limitation - there's no "render nothing on complete" option.

### Tab completion in @inquirer/search

The library uses `.name` for tab fill, which includes any formatting (colors, status text). We patched it (3 lines via `patch-package`) to use `.short` instead, so tab fills the clean name. Minimal patch, auto-applied on install.

### Theme consistency

The default prompt prefix is `✔` (heavy check). We overrode it globally with a shared `promptTheme` object using `✓` (light check) so all prompts - ours and the library's - look the same.

### Quitable text inputs

Wrap the input prompt: if the user types "q" or "quit" as their answer, throw a `QuitError` instead of returning the value. Catch it at the flow level to exit cleanly. Trade-off: you can't name something "q". Worth it.
