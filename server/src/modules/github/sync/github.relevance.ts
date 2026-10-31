export const MIN_BODY_FOR_SOLO_THREAD = 400;
/** A single reply is rarely a decision; two or more messages are a discussion. */
export const MIN_TALK = 2;

/**
 * Cheap test for "could this thread contain a technical decision?", shared by the
 * importer (which only stores full conversations for relevant threads) and the
 * analyser (which only sends relevant threads to the model), so the two agree.
 */
export function isRelevantThread(args: {
  kind: "issue" | "pull_request" | "discussion";
  bodyLength: number;
  /** comments + reviews + inline comments (replies for discussions) */
  talk: number;
}): boolean {
  const minTalk = args.kind === "discussion" ? 1 : MIN_TALK;
  return args.talk >= minTalk || args.bodyLength >= MIN_BODY_FOR_SOLO_THREAD;
}
