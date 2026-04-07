import rawInput from '@inquirer/input'
import select from '@inquirer/select'

export const promptTheme = {
  prefix: {idle: '?', done: '\x1b[32m✓\x1b[0m'},
}

const QUIT_TERMS = ['q', 'quit']

class QuitError extends Error {
  name = 'QuitError'
}

export async function quitableInput(config: Parameters<typeof rawInput>[0]): Promise<string> {
  const value = await rawInput({...config, theme: promptTheme})
  if (QUIT_TERMS.includes(value.trim().toLowerCase())) throw new QuitError()
  return value
}

export async function quitableSelect<T>(config: Parameters<typeof select<T>>[0]): Promise<T> {
  return select({...config, theme: promptTheme})
}

export {QuitError}
