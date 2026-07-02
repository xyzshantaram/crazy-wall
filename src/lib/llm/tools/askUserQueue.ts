/**
 * Queue bridging the ask_user tool's execute() call (inside the LLM agent
 * loop) to the AskUserDialog UI component. Uses the same promise-plus-setter
 * pattern as confirmationQueue.ts so the tool can block until the user replies.
 */

export interface AskUserRequest {
  question: string;
  /** Predefined choices the model wants to offer. May be empty. */
  choices: string[];
  /** Whether the user can type a freeform answer in addition to / instead of choices. */
  allowFreeform: boolean;
}

export interface QueuedAskUser extends AskUserRequest {
  resolve: (answer: string) => void;
}

let queueSetter: ((req: QueuedAskUser) => void) | null = null;

export function setAskUserQueueSetter(setter: ((req: QueuedAskUser) => void) | null): void {
  queueSetter = setter;
}

/**
 * Called by the ask_user tool's execute(). Blocks until the user submits a
 * response in AskUserDialog. Returns the user's answer as a plain string.
 * If no UI is mounted (e.g. in tests) resolves immediately with a placeholder.
 */
export function requestAskUser(req: AskUserRequest): Promise<string> {
  return new Promise((resolve) => {
    if (!queueSetter) {
      resolve("(no answer — UI not mounted)");
      return;
    }
    queueSetter({ ...req, resolve });
  });
}
