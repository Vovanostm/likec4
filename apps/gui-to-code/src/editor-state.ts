import type { Compilation } from './compiler'
import type { EditorCommand } from './document'
import { applyCommand } from './document'
import { userError, userMessages } from './user-messages'

export interface EditorRuntimeState {
  source: string
  compilation: Compilation
  lastValidModel: Compilation['model']
}

export type Compiler = (source: string) => Promise<Compilation>

export type CommandApplicationResult =
  | { status: 'applied'; state: EditorRuntimeState }
  | { status: 'rejected'; state: EditorRuntimeState; message: string }

export function applyDraftCompilation(
  state: EditorRuntimeState,
  source: string,
  compilation: Compilation,
): EditorRuntimeState {
  return {
    source,
    compilation,
    lastValidModel: compilation.model ?? state.lastValidModel,
  }
}

export async function applyEditorCommand(
  state: EditorRuntimeState,
  command: EditorCommand,
  compiler: Compiler,
): Promise<CommandApplicationResult> {
  try {
    const source = applyCommand(state.source, command)
    const compilation = await compiler(source)
    if (!compilation.model) {
      return {
        status: 'rejected',
        state,
        message: userError(userMessages.commandInvalidDsl, compilation.errors[0]),
      }
    }
    return {
      status: 'applied',
      state: {
        source,
        compilation,
        lastValidModel: compilation.model,
      },
    }
  } catch (error) {
    return {
      status: 'rejected',
      state,
      message: userError(userMessages.commandFailed, error instanceof Error ? error.message : String(error)),
    }
  }
}

export class CompilationSequence {
  private latest = 0

  next(): number {
    this.latest += 1
    return this.latest
  }

  isCurrent(sequence: number): boolean {
    return sequence === this.latest
  }
}
