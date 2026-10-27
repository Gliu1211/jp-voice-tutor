// Node 22.18+ can load these erasable TypeScript types without a test framework.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeTranscriptEvent, orderTranscripts } = require("./transcripts.ts");

function added(id, previous, role = "user") {
  return {
    type: "conversation.item.added",
    item: { id, type: "message", role },
    previous_item_id: previous,
  };
}

function completed(id, text, role = "user") {
  return {
    type: role === "user"
      ? "conversation.item.input_audio_transcription.completed"
      : "response.output_audio_transcript.done",
    item_id: id,
    transcript: text,
  };
}

function apply(events) {
  return events.reduce((entries, event) => mergeTranscriptEvent(entries, event, "session-A"), {});
}

test("late learner transcription keeps its position before the tutor reply", () => {
  const entries = apply([
    added("learner", null), added("tutor", "learner", "assistant"),
    completed("tutor", "いいですね", "assistant"), completed("learner", "京都に行きたい"),
  ]);
  assert.deepEqual(orderTranscripts(entries).map((entry) => entry.id), ["learner", "tutor"]);
});

test("text arriving before metadata is retained, without pretending it is a root", () => {
  const pending = apply([completed("B", "こんにちは")]);
  assert.equal(pending.B.previous_item_id, undefined);
  assert.deepEqual(orderTranscripts(pending), []);

  const withChild = mergeTranscriptEvent(pending, added("B", "A"), "session-A");
  assert.equal(withChild.B.text, "こんにちは");
  assert.deepEqual(orderTranscripts(withChild), []);

  const complete = mergeTranscriptEvent(withChild, added("A", null, "assistant"), "session-A");
  assert.deepEqual(orderTranscripts(complete).map((entry) => entry.id), ["A", "B"]);
});

test("metadata and final text can arrive in different orders with the same result", () => {
  const events = [added("A", null), completed("A", "A"), added("B", "A", "assistant"), completed("B", "B", "assistant")];
  const expected = orderTranscripts(apply(events));
  // Exercise every permutation of these four events, including delayed predecessors.
  function permutations(items) {
    if (!items.length) return [[]];
    return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((rest) => [item, ...rest]));
  }
  for (const order of permutations(events)) {
    assert.deepEqual(orderTranscripts(apply(order)), expected);
  }
});

test("repeated events do not duplicate entries or erase text", () => {
  const entries = apply([
    added("A", null), completed("A", "Hello"),
    added("A", null), completed("A", "Hello"),
  ]);
  assert.equal(Object.keys(entries).length, 1);
  assert.equal(entries.A.text, "Hello");
});

test("hidden conversation items preserve links between displayed messages", () => {
  const entries = apply([
    added("A", null),
    { type: "conversation.item.added", item: { id: "tool", type: "function_call" }, previous_item_id: "A" },
    added("B", "tool", "assistant"),
  ]);
  assert.deepEqual(orderTranscripts(entries).map((entry) => entry.id), ["A", "B"]);
});

test("a disconnected cycle stays pending instead of hanging or dropping stored entries", () => {
  const entries = apply([added("A", "B"), added("B", "A")]);
  assert.deepEqual(orderTranscripts(entries), []);
  assert.equal(Object.keys(entries).length, 2);
});

test("merging and ordering leave earlier state objects unchanged", () => {
  const before = apply([added("A", null)]);
  Object.freeze(before.A);
  Object.freeze(before);
  const after = mergeTranscriptEvent(before, completed("A", "Hello"), "session-A");
  assert.equal(before.A.text, null);
  assert.equal(after.A.text, "Hello");
  orderTranscripts(after);
  assert.equal(before.A.text, null);
});

test("unrelated or malformed events leave the dictionary unchanged", () => {
  const entries = {};
  for (const event of [null, [], { type: "session.created" }, completed("A", 123), added("A", 123)]) {
    assert.equal(mergeTranscriptEvent(entries, event, "session-A"), entries);
  }
});

test("updating a second session cannot modify a first session's dictionary", () => {
  const first = apply([added("A", null), completed("A", "First conversation")]);
  const second = mergeTranscriptEvent({}, added("B", null), "session-B");
  assert.equal(first.A.text, "First conversation");
  assert.equal(second.B.session_id, "session-B");
  assert.equal(first.B, undefined);
});

test("an empty completed transcript is preserved rather than marked pending again", () => {
  const entries = apply([completed("A", ""), added("A", null)]);
  assert.equal(entries.A.text, "");
});
