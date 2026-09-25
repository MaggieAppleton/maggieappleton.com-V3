import assert from "node:assert/strict";
import test from "node:test";

import { createEditorSession } from "../../src/editor/client/session.mjs";

const documentId = "notes:cozy-web";
const worktreeId = "worktree-one";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function drain() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

function manualClock() {
  let current = 1_000;
  let nextId = 0;
  const scheduled = new Map();
  const clock = {
    now: () => current,
    setTimeout(callback, delay) {
      const id = ++nextId;
      scheduled.set(id, { at: current + delay, callback });
      return id;
    },
    clearTimeout(id) { scheduled.delete(id); },
  };
  async function advance(milliseconds) {
    const end = current + milliseconds;
    while (true) {
      const due = [...scheduled].filter(([, item]) => item.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      scheduled.delete(due[0]);
      current = due[1].at;
      due[1].callback();
      await drain();
    }
    current = end;
    await drain();
  }
  return { clock, advance, pending: () => scheduled.size };
}

function memoryStorage() {
  const values = new Map();
  return {
    values,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function deferredSaver() {
  const calls = [];
  const save = (request) => {
    const result = deferred();
    calls.push({ request, ...result });
    return result.promise;
  };
  return { save, calls };
}

function makeSession({
  source = "Original.", revision = "rev-0", writerId = "writer-one",
  storage = memoryStorage(), timer = manualClock(), save = deferredSaver().save,
  onState = () => {}, other = {},
} = {}) {
  return createEditorSession({
    documentId, worktreeId, revision, source, writerId, storage,
    clock: timer.clock, save, onState, ...other,
  });
}

function invoke(method) {
  const result = method();
  result?.catch?.(() => {});
  return result;
}

function acknowledge(call, revision, unchanged = false) {
  call.resolve({
    documentId: call.request.documentId,
    requestId: call.request.requestId,
    revision,
    unchanged,
  });
}

test("debounces completed edits for exactly 750 ms and flushes immediately", async () => {
  const timer = manualClock();
  const saver = deferredSaver();
  const session = makeSession({ timer, save: saver.save });
  session.edit("First edit.");
  assert.equal(session.snapshot().dirty, true);
  await timer.advance(749);
  assert.equal(saver.calls.length, 0);
  await timer.advance(1);
  assert.equal(saver.calls.length, 1);
  assert.equal(saver.calls[0].request.source, "First edit.");
  assert.equal(saver.calls[0].request.baseRevision, "rev-0");
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().revision, "rev-1");

  session.edit("Second edit.");
  invoke(() => session.flush());
  await drain();
  assert.equal(saver.calls.length, 2);
  assert.equal(saver.calls[1].request.source, "Second edit.");
  await timer.advance(750);
  assert.equal(saver.calls.length, 2, "immediate save cancels the debounce timer");
  acknowledge(saver.calls[1], "rev-2");
  await drain();
  assert.equal(session.snapshot().dirty, false);
  session.dispose();
});

test("queues newest text behind one in-flight request and cleans only its own generation", async () => {
  const timer = manualClock();
  const saver = deferredSaver();
  const session = makeSession({ timer, save: saver.save });
  session.edit("First generation.");
  invoke(() => session.flush());
  await drain();
  assert.equal(saver.calls.length, 1);
  session.edit("Newest generation.");
  await timer.advance(750);
  assert.equal(saver.calls.length, 1, "requests must never overlap");
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(session.snapshot().source, "Newest generation.");
  assert.equal(session.snapshot().dirty, true, "old acknowledgement cannot mark newer text saved");
  assert.equal(saver.calls.length, 2);
  assert.equal(saver.calls[1].request.source, "Newest generation.");
  assert.equal(saver.calls[1].request.baseRevision, "rev-1");
  acknowledge(saver.calls[1], "rev-2");
  await drain();
  assert.equal(session.snapshot().dirty, false);
  session.dispose();
});

test("a later generation with the same source still needs its own acknowledgement", async () => {
  const saver = deferredSaver();
  const session = makeSession({ save: saver.save });
  session.edit("Shared bytes."); // Generation 1.
  invoke(() => session.flush());
  await drain();
  session.edit("Intermediate bytes."); // Generation 2.
  session.edit("Shared bytes."); // Generation 3, equal to the pending candidate.
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(session.snapshot().source, "Shared bytes.");
  assert.notEqual(session.snapshot().status, "Saved",
    "generation 1 acknowledgement cannot certify generation 3");
  assert.equal(saver.calls.length, 2, "queued latest generation needs an equal-source acknowledgement");
  assert.equal(saver.calls[1].request.source, "Shared bytes.");
  acknowledge(saver.calls[1], "rev-1", true);
  await drain();
  assert.equal(session.snapshot().acknowledgedGeneration, session.snapshot().generation);
  assert.equal(session.snapshot().status, "Saved");
  session.dispose();
});

test("onState receives settled in-flight cleanup after a save resolves", async () => {
  const saver = deferredSaver();
  const observed = [];
  const session = makeSession({ save: saver.save, onState: (state) => observed.push(state) });
  session.edit("Saved bytes.");
  invoke(() => session.flush());
  await drain();
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(session.snapshot().inFlight, null);
  assert.equal(observed.at(-1)?.inFlight, null,
    "last pushed state must match settled snapshot so navigation/UI can unblock");
  session.dispose();
});

test("undoing to the old disk bytes while another generation saves stays recoverably unsaved", async () => {
  const storage = memoryStorage();
  const saver = deferredSaver();
  const session = makeSession({ storage, save: saver.save });
  session.edit("First generation.");
  invoke(() => session.flush());
  await drain();
  session.edit("Original."); // Undo produces a newer local generation.
  assert.equal(session.snapshot().source, "Original.");
  assert.notEqual(session.snapshot().status, "Saved");
  assert.match([...storage.values.values()].join("\n"), /Original\./);
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(saver.calls.length, 2);
  assert.equal(saver.calls[1].request.source, "Original.");
  assert.equal(saver.calls[1].request.baseRevision, "rev-1");
  acknowledge(saver.calls[1], "rev-2");
  await drain();
  assert.equal(session.snapshot().dirty, false);
  session.dispose();
});

test("foreign disk observation and explicit disk load survive a late own-save acknowledgement", async () => {
  const saver = deferredSaver();
  const session = makeSession({ save: saver.save });
  session.edit("My pending change.");
  invoke(() => session.flush());
  await drain();
  session.observeDisk({ source: "Foreign disk text.", revision: "rev-foreign" });
  assert.equal(session.snapshot().conflict?.revision, "rev-foreign");
  acknowledge(saver.calls[0], "rev-own");
  await drain();
  assert.equal(session.snapshot().conflict?.revision, "rev-foreign");
  assert.equal(session.snapshot().status, "File changed elsewhere");
  assert.notEqual(session.snapshot().revision, "rev-own",
    "a late success cannot replace the newer observed disk revision");
  assert.equal(saver.calls.length, 1);
  session.dispose();

  const another = deferredSaver();
  const accepted = makeSession({ save: another.save });
  accepted.edit("My pending change.");
  invoke(() => accepted.flush());
  await drain();
  accepted.acceptDisk({ source: "Chosen disk text.", revision: "rev-chosen" });
  acknowledge(another.calls[0], "rev-own");
  await drain();
  assert.equal(accepted.snapshot().source, "Chosen disk text.");
  assert.equal(accepted.snapshot().revision, "rev-chosen");
  assert.equal(accepted.snapshot().dirty, false);
  assert.match(JSON.stringify(accepted.snapshot().discardedCopy), /My pending change/);
  accepted.dispose();
});

test("observing the submitted source before its response is an own write, not a conflict", async () => {
  const saver = deferredSaver();
  const session = makeSession({ save: saver.save });
  session.edit("My submitted text.");
  invoke(() => session.flush());
  await drain();
  session.observeDisk({ source: "My submitted text.", revision: "rev-own" });
  assert.equal(session.snapshot().conflict, null);
  acknowledge(saver.calls[0], "rev-own");
  await drain();
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().revision, "rev-own");
  assert.equal(saver.calls.length, 1);
  session.dispose();
});

test("a clean foreign disk observation waits for explicit engine replacement", async () => {
  const storage = memoryStorage();
  const saver = deferredSaver();
  const session = makeSession({ storage, save: saver.save });
  session.observeDisk({ source: "Changed on disk.", revision: "rev-foreign" });
  assert.equal(session.snapshot().source, "Original.",
    "the live editor still holds the original engine document");
  assert.equal(session.snapshot().revision, "rev-0");
  assert.equal(session.snapshot().status, "File changed elsewhere");
  assert.equal(session.snapshot().conflict?.source, "Changed on disk.");
  assert.equal(session.recoveryCandidates().some((candidate) => candidate.source === "Original."), true);
  invoke(() => session.flush());
  await drain();
  assert.equal(saver.calls.length, 0, "the stale engine cannot save over the foreign revision");
  session.acceptDisk({ source: "Changed on disk.", revision: "rev-foreign" });
  assert.equal(session.snapshot().source, "Changed on disk.");
  assert.equal(session.snapshot().revision, "rev-foreign");
  assert.equal(session.snapshot().status, "Saved");
  session.dispose();
});

test("retries an uncertain save with its original candidate before later typing", async () => {
  const saver = deferredSaver();
  const session = makeSession({ save: saver.save });
  session.edit("Possibly saved.");
  invoke(() => session.flush());
  await drain();
  const firstRequest = saver.calls[0].request;
  session.edit("Typed after request.");
  saver.calls[0].reject(new TypeError("response lost"));
  await drain();
  assert.equal(session.snapshot().source, "Typed after request.");
  assert.equal(session.snapshot().dirty, true);
  assert.equal(saver.calls.length, 1, "later text waits for uncertain save resolution");

  invoke(() => session.retry());
  await drain();
  assert.equal(saver.calls.length, 2);
  assert.equal(saver.calls[1].request.source, firstRequest.source);
  assert.equal(saver.calls[1].request.baseRevision, firstRequest.baseRevision,
    "retry must resolve the uncertain candidate before newer text");
  acknowledge(saver.calls[1], "rev-1", true);
  await drain();
  assert.equal(saver.calls.length, 3);
  assert.equal(saver.calls[2].request.source, "Typed after request.");
  assert.equal(saver.calls[2].request.baseRevision, "rev-1");
  acknowledge(saver.calls[2], "rev-2");
  await drain();
  assert.equal(session.snapshot().dirty, false);
  session.dispose();
});

test("a late acknowledgement from a disposed session cannot clear a newer recovery buffer", async () => {
  const storage = memoryStorage();
  const saver = deferredSaver();
  const oldSession = makeSession({ storage, save: saver.save, writerId: "same-tab" });
  oldSession.edit("Old pending buffer.");
  invoke(() => oldSession.flush());
  await drain();
  oldSession.dispose();

  const currentSession = makeSession({ storage, writerId: "same-tab" });
  currentSession.edit("Newer live buffer.");
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(currentSession.snapshot().source, "Newer live buffer.");
  assert.equal(currentSession.snapshot().dirty, true);
  assert.match([...storage.values.values()].join("\n"), /Newer live buffer/);
  currentSession.dispose();
});

test("suspends autosave on conflict and retains an exportable copy when loading disk", async () => {
  const timer = manualClock();
  const storage = memoryStorage();
  const saver = deferredSaver();
  const session = makeSession({ timer, storage, save: saver.save });
  session.edit("Browser version.");
  invoke(() => session.flush());
  await drain();
  saver.calls[0].reject(Object.assign(new Error("conflict"), {
    status: 409,
    code: "document_conflict",
    details: { source: "Disk version.", revision: "rev-outside" },
  }));
  await drain();
  assert.equal(session.snapshot().source, "Browser version.");
  assert.equal(session.snapshot().dirty, true);
  assert.ok(session.snapshot().conflict);
  await timer.advance(2_000);
  assert.equal(saver.calls.length, 1, "conflicts suspend autosave");

  session.acceptDisk({ source: "Disk version.", revision: "rev-outside" });
  const after = session.snapshot();
  assert.equal(after.source, "Disk version.");
  assert.equal(after.revision, "rev-outside");
  assert.equal(after.dirty, false);
  assert.match(JSON.stringify(after.discardedCopy), /Browser version/);
  assert.match([...storage.values.values()].join("\n"), /Browser version/,
    "the discarded browser copy remains durable until explicit export or clear");
  session.dispose();
});

test("continued typing during a conflict keeps the conflict status visible", async () => {
  const session = makeSession();
  session.edit("Browser version.");
  session.observeDisk({ source: "Disk version.", revision: "rev-outside" });
  session.edit("Browser version with more typing.");
  assert.equal(session.snapshot().conflict?.revision, "rev-outside");
  assert.equal(session.snapshot().status, "File changed elsewhere",
    "typing cannot hide a conflict that still suspends saving");
  session.dispose();
});

test("loading disk keeps original recovery when discarded-copy persistence fails", () => {
  const backing = memoryStorage();
  const storage = {
    get length() { return backing.length; },
    key: (index) => backing.key(index),
    getItem: (key) => backing.getItem(key),
    removeItem: (key) => backing.removeItem(key),
    setItem(key, value) {
      if (key.includes(":discarded:")) throw new Error("quota exceeded");
      backing.setItem(key, value);
    },
  };
  const session = makeSession({ storage });
  session.edit("Only durable browser copy.");
  assert.equal(session.recoveryCandidates().length, 1);
  session.acceptDisk({ source: "Disk version.", revision: "rev-outside" });
  assert.equal(session.snapshot().storageError?.message, "quota exceeded");
  assert.equal(session.recoveryCandidates().some((candidate) =>
    candidate.source === "Only durable browser copy."), true,
  "a failed backup must not remove the last durable browser copy");
  session.dispose();
});

test("offers separate tab recovery candidates only within their worktree and restores by choice", async () => {
  const storage = memoryStorage();
  const first = makeSession({ storage, writerId: "tab-one" });
  const second = makeSession({ storage, writerId: "tab-two" });
  first.edit("First tab buffer.", { engineSnapshot: "first-engine" });
  second.edit("Second tab buffer.", { engineSnapshot: "second-engine" });
  first.dispose();
  second.dispose();

  const reopened = makeSession({ storage, writerId: "reopened" });
  assert.equal(reopened.snapshot().source, "Original.", "reopen must not auto-apply recovery");
  const candidates = reopened.recoveryCandidates();
  assert.deepEqual(new Set(candidates.map((item) => item.writerId)), new Set(["tab-one", "tab-two"]));
  assert.deepEqual(new Set(candidates.map((item) => item.source)),
    new Set(["First tab buffer.", "Second tab buffer."]));
  reopened.restoreRecovery(candidates.find((item) => item.writerId === "tab-one"));
  assert.equal(reopened.snapshot().source, "First tab buffer.");
  assert.equal(reopened.snapshot().dirty, true);
  assert.deepEqual(new Set(reopened.recoveryCandidates().map((item) => item.writerId)),
    new Set(["reopened", "tab-two"]),
    "a restored copy moves to the current writer without accumulating a duplicate");
  assert.ok([...storage.values.values()].some((raw) => raw.includes("Second tab buffer.")),
    "restoring one tab cannot erase another tab's unsaved record");

  const differentWorktree = makeSession({ storage, writerId: "other-tree", other: { worktreeId: "worktree-two" } });
  assert.deepEqual(differentWorktree.recoveryCandidates(), []);
  differentWorktree.dispose();
  reopened.dispose();
});

test("a deliberately restored closed-tab candidate retires after its source is acknowledged", async () => {
  const storage = memoryStorage();
  const closed = makeSession({ storage, writerId: "closed-tab" });
  closed.edit("Recovered and saved text.");
  closed.dispose();

  const saver = deferredSaver();
  const reopened = makeSession({ storage, writerId: "restoring-tab", save: saver.save });
  const [candidate] = reopened.recoveryCandidates();
  reopened.restoreRecovery(candidate);
  invoke(() => reopened.flush());
  await drain();
  acknowledge(saver.calls[0], "rev-1");
  await drain();
  assert.equal(reopened.snapshot().dirty, false);
  reopened.dispose();

  const later = makeSession({ storage, writerId: "later-tab", revision: "rev-1",
    source: "Recovered and saved text." });
  assert.deepEqual(later.recoveryCandidates(), [],
    "acknowledged restored content must not be offered again as stale closed-tab recovery");
  later.dispose();
});

test("stale recovery and outside disk changes never autosave over the disk", async () => {
  const timer = manualClock();
  const storage = memoryStorage();
  const saver = deferredSaver();
  const old = makeSession({ storage, writerId: "old-tab" });
  old.edit("Unsaved before outside edit.");
  old.dispose();
  const reopened = makeSession({ storage, writerId: "new-tab", revision: "rev-outside",
    source: "Outside edit.", timer, save: saver.save });
  const [candidate] = reopened.recoveryCandidates();
  assert.equal(candidate.baseRevision, "rev-0");
  assert.equal(reopened.snapshot().source, "Outside edit.");
  reopened.restoreRecovery(candidate);
  assert.equal(reopened.snapshot().source, "Unsaved before outside edit.");
  assert.ok(reopened.snapshot().conflict, "stale recovery requires a deliberate conflict choice");
  await timer.advance(2_000);
  assert.equal(saver.calls.length, 0);

  const observing = makeSession({ timer: manualClock(), save: saver.save, writerId: "observer" });
  observing.edit("Local unsaved text.");
  observing.observeDisk({ source: "Outside edit.", revision: "rev-outside" });
  assert.equal(observing.snapshot().source, "Local unsaved text.");
  assert.ok(observing.snapshot().conflict);
  observing.dispose();
  reopened.dispose();
});

test("storage failure keeps live text and exposes recovery loss; undo still advances generation", async () => {
  const storage = memoryStorage();
  const session = makeSession({ storage });
  session.edit("An edit.");
  const firstGeneration = session.snapshot().generation;
  session.edit("Original."); // Engine undo is still a new local transaction.
  assert.ok(session.snapshot().generation > firstGeneration);
  session.dispose();

  const failingStorage = {
    ...memoryStorage(),
    setItem() { throw new Error("quota exceeded"); },
  };
  const failing = makeSession({ storage: failingStorage, writerId: "quota-tab" });
  failing.edit("Text surviving quota failure.");
  const state = failing.snapshot();
  assert.equal(state.source, "Text surviving quota failure.");
  assert.equal(state.dirty, true);
  assert.ok(state.error || state.storageError || state.recoveryAvailable === false,
    "recovery failure must be visible to the UI");
  failing.dispose();
});

test("a throwing global localStorage getter cannot prevent the live session from opening", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw Object.assign(new Error("storage unavailable"), { name: "SecurityError" }); },
  });
  let session;
  try {
    session = createEditorSession({
      documentId, worktreeId, revision: "rev-0", source: "Original.",
      writerId: "storage-denied", clock: manualClock().clock,
      save: deferredSaver().save,
    });
    session.edit("Live text despite denied storage.");
    assert.equal(session.snapshot().source, "Live text despite denied storage.");
    assert.equal(session.snapshot().dirty, true);
    assert.ok(session.snapshot().storageError || session.snapshot().recoveryAvailable === false);
  } finally {
    session?.dispose();
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("restoring a conversion failure retains the newer engine snapshot and unsaved state", () => {
  const storage = memoryStorage();
  const original = makeSession({ storage, writerId: "failed-conversion" });
  original.conversionFailed({ engineSnapshot: { doc: "newer unsavable typing" },
    error: new Error("MDX conversion failed") });
  original.dispose();

  const reopened = makeSession({ storage, writerId: "reopened" });
  const [candidate] = reopened.recoveryCandidates();
  assert.deepEqual(candidate.engineSnapshot, { doc: "newer unsavable typing" });
  assert.equal(candidate.source, "Original.", "last valid source remains available");
  reopened.restoreRecovery(candidate);
  const restored = reopened.snapshot();
  assert.deepEqual(restored.engineSnapshot, { doc: "newer unsavable typing" });
  assert.equal(restored.lastValidSource, "Original.");
  assert.equal(restored.dirty, true,
    "newer engine text must stay unsaved even when its last valid source equals disk");
  assert.notEqual(restored.status, "Saved");
  reopened.dispose();
});

test("composition saves only completed input and conversion failure keeps the newer engine snapshot", async () => {
  const timer = manualClock();
  const storage = memoryStorage();
  const saver = deferredSaver();
  const session = makeSession({ timer, storage, save: saver.save });
  session.compositionStart();
  session.edit("中", { engineSnapshot: "incomplete" });
  invoke(() => session.flush());
  await timer.advance(1_000);
  assert.equal(saver.calls.length, 0, "incomplete composition must not be submitted");
  session.compositionEnd("中文", { engineSnapshot: "complete" });
  await timer.advance(750);
  assert.equal(saver.calls.length, 1);
  assert.equal(saver.calls[0].request.source, "中文");
  acknowledge(saver.calls[0], "rev-1");
  await drain();

  session.conversionFailed({ engineSnapshot: "newer-unserializable-engine",
    error: new Error("conversion failed") });
  const state = session.snapshot();
  assert.equal(state.lastValidSource, "中文");
  assert.equal(state.dirty, true);
  assert.match([...storage.values.values()].join("\n"), /newer-unserializable-engine/);
  await timer.advance(2_000);
  assert.equal(saver.calls.length, 1, "a stale last-valid source must not save over newer engine text");
  session.dispose();
});

test("a rejected candidate does not spin, and a later valid edit can save", async () => {
  const timer = manualClock();
  const calls = [];
  const session = makeSession({ timer, save: async (request) => {
    calls.push(request);
    if (request.source === "Rejected.") {
      throw Object.assign(new Error("Invalid source"), { status: 422, code: "invalid_source" });
    }
    return { revision: "rev-1" };
  } });
  session.edit("Rejected.");
  invoke(() => session.flush());
  await drain();
  assert.equal(session.snapshot().status, "Couldn't save");
  assert.equal(session.snapshot().uncertain, false, "a definitive 422 is not a lost acknowledgement");
  await timer.advance(2_000);
  assert.equal(calls.length, 1, "the same rejected generation must not retry automatically");

  session.edit("Valid edit.");
  await timer.advance(750);
  assert.deepEqual(calls.map((request) => request.source), ["Rejected.", "Valid edit."]);
  assert.equal(session.snapshot().status, "Saved");
  session.dispose();
});
