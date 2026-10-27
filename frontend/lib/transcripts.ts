export interface TranscriptEntry {
  id: string;
  // null means the transcript is pending; an empty completed transcript is still valid.
  text: string | null;
  // Non-message items still carry links in the conversation, but are not displayed.
  role: "user" | "assistant" | null;
  session_id: string;
  // undefined: metadata has not arrived; null: the server identified a root item.
  previous_item_id: string | null | undefined;
}

export type TranscriptEntries = Record<string, TranscriptEntry>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Text and ordering metadata arrive independently. Merge either into the same item.
// Returning the original object for unrelated/invalid events avoids unnecessary updates.
export function mergeTranscriptEvent(
  entries: TranscriptEntries,
  event: unknown,
  sessionId: string,
): TranscriptEntries {
  if (!isObject(event)) return entries;

  if (event.type === "conversation.item.added") {
    const item = event.item;
    if (!isObject(item) || typeof item.id !== "string" || !item.id) return entries;
    if (
      event.previous_item_id !== undefined &&
      event.previous_item_id !== null &&
      typeof event.previous_item_id !== "string"
    ) return entries;

    const role = item.type === "message" &&
      (item.role === "user" || item.role === "assistant") ? item.role : null;

    return {
      ...entries,
      [item.id]: {
        id: item.id,
        // A delayed/repeated metadata event must not erase a completed transcript.
        text: entries[item.id]?.text ?? null,
        role,
        session_id: sessionId,
        previous_item_id: event.previous_item_id ?? null,
      },
    };
  }

  if (
    event.type === "response.output_audio_transcript.done" ||
    event.type === "conversation.item.input_audio_transcription.completed"
  ) {
    if (
      typeof event.item_id !== "string" || !event.item_id ||
      typeof event.transcript !== "string"
    ) return entries;

    return {
      ...entries,
      [event.item_id]: {
        id: event.item_id,
        text: event.transcript,
        role: event.type === "response.output_audio_transcript.done" ? "assistant" : "user",
        session_id: sessionId,
        // No fallback to null: missing metadata does not mean this is the first item.
        previous_item_id: entries[event.item_id]?.previous_item_id,
      },
    };
  }

  return entries;
}

// Derive the predecessor lookup from the ID-keyed state. No second state to synchronize.
export function orderTranscripts(entries: TranscriptEntries): TranscriptEntry[] {
  const nextByPrevious = new Map<string | null, TranscriptEntry[]>();
  for (const entry of Object.values(entries)) {
    if (entry.previous_item_id === undefined) continue;
    const children = nextByPrevious.get(entry.previous_item_id) ?? [];
    children.push(entry);
    nextByPrevious.set(entry.previous_item_id, children);
  }

  const ordered: TranscriptEntry[] = [];
  const visited = new Set<string>();
  const pending = [...(nextByPrevious.get(null) ?? [])].reverse();

  while (pending.length > 0) {
    const entry = pending.pop()!;
    // Guard against malformed/repeated links; never loop indefinitely.
    if (visited.has(entry.id)) continue;
    visited.add(entry.id);

    if (entry.role !== null) ordered.push(entry);
    // Traverse hidden items too, so their visible successors remain reachable.
    const children = nextByPrevious.get(entry.id) ?? [];
    for (let index = children.length - 1; index >= 0; index--) {
      pending.push(children[index]);
    }
  }

  // Unlinked entries remain in state until their metadata/ancestors arrive.
  return ordered;
}
