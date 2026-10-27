# Understanding the current application

Read the commented source in this order: `backend/main.py`, `frontend/app/layout.tsx`,
then `frontend/app/page.tsx`. TODO comments identify unfinished work for you to implement.

## Three places code runs

| Place | Responsibility | How it starts |
| --- | --- | --- |
| Next.js server, using Node.js | Build and serve the page and JavaScript at localhost:3000. | `npm.cmd run dev` in frontend |
| Your browser | Run click handlers, update the UI with React, access the microphone, and request JSON. | Open localhost:3000 |
| Uvicorn server, using Python | Run FastAPI endpoints at 127.0.0.1:8000. | The backend command in README |

TypeScript is the language used to write the frontend; Next.js turns it into
runnable JavaScript. FastAPI is the Python framework, and Uvicorn is the server
that hosts it. Both servers can run on your computer; their ports identify the services.

## Opening the page

Next.js uses `app/page.tsx` for `/` and wraps it with `app/layout.tsx`.
The layout supplies `<html>`, `<body>`, metadata, and the stylesheet import.
`Home()` describes the page using JSX, the HTML-like syntax in a `.tsx` file.
Next.js can prepare initial HTML on the server. The `"use client"` directive
allows this page's interactive code to run in the browser.

Declaring a function does not automatically run it. `onClick={startButton}` gives
React the function to call on a click. The text between the opening and closing
button tags is a label; it does not execute the function.

## Clicking Greetings

1. The browser runs `checkBackend()`, sets `isLoading` to true, and displays Connecting.
2. `fetch` sends GET to the configured API address plus `/greeting`.
3. FastAPI matches that path to your `greeting()` function in `main.py`.
4. Python returns a dictionary; FastAPI sends it as JSON.
5. The browser parses the JSON with `response.json()` and checks its message field.
6. `setMessage(data.message)` tells React to update the status paragraph.
7. `finally` clears the loading flag on success or failure, enabling the button again.

`async` allows a function to use `await`. While the request is pending, the browser
can keep responding to other activity. `try` holds work that can fail; `catch`
handles failures; `finally` runs regardless of the outcome.

The browser also checks CORS because the page and API have different origins.
The allowed origin in Python permits the browser page to read the API response.

## Starting and stopping the microphone

Start calls the browser's `getUserMedia` API and waits for microphone access.
It saves the resulting `MediaStream` in `localStream.current`, adds its tracks to
a WebRTC peer connection, and sends the SDP offer to Python's `/session` endpoint.
Python makes the authenticated OpenAI call and returns the SDP answer. The browser
plays remote tutor audio and receives conversation events over the data channel.
Greeting and microphone setup feedback currently share a status paragraph.

Stop gets the saved stream's tracks, calls `stop()` on each one, clears the reference,
and displays Microphone stopped. Clearing the reference without stopping the tracks
would only forget the stream, leaving capture active.

## State and refs

React calls `Home()` again when state changes and updates the rendered page.
`useState` retains values between these calls and its setter schedules an update.
`message` controls text; `isLoading` controls the greeting button.

`useRef` retains a persistent container whose `.current` holds the microphone stream.
Changing `.current` does not schedule a render. The stream is needed by event handlers;
state supplies values that determine what the page displays.

Your `micStatus` transitions are now idle -> requesting -> active on success, and
requesting -> idle on failure. Stop changes active -> idle. Start is enabled only
while idle; Stop is enabled only while active.

`useEffect` registers a cleanup function that stops any retained microphone tracks
when the component is removed. `permission.current` remembers whether the component
is still present. If microphone permission finishes after removal, the Start handler
stops the returned stream immediately instead of keeping an orphaned microphone active.
The effect's empty dependency array means greeting/status updates do not rerun it.

In the October 1 annotation pass, Codex moved `micStatus` from outside `Home()`
into the component: React hooks cannot be called at module scope. The remaining
changes added explanations and formatting, leaving your exercise unfinished.

## Configuration and generated files

`package.json` is strict JSON and cannot contain inline comments:

- `scripts.dev` starts the development server; `build` generates the production build.
- `scripts.start` runs a production build; `typecheck` checks source types.
- `dependencies` lists app libraries; `devDependencies` lists compiler/type tooling.
- `private: true` prevents accidental publication as an npm package.

`tsconfig.json` configures TypeScript checks and accepts comments.
`requirements.txt` tells pip which Python packages to install.
`.env.example` is the address template; `.env.local` holds your local copy.
`NEXT_PUBLIC_API_URL` is public because the browser needs it for requests.
`.gitignore` keeps generated output and local configuration out of Git.
`.gitattributes` normalizes text-file line endings across platforms.

`package-lock.json` records resolved npm versions. `next-env.d.ts` is managed by
Next.js and supplies type declarations. `AGENTS.md` and `CLAUDE.md` give coding
assistants instructions. `node_modules`, `.next`, `.venv`, and Python caches are
installed/generated files. They are not extra features you have to implement.

## Current checkpoint

Voice conversations and learner/tutor transcripts are grouped into sessions in browser
memory. Transcript entries are stored in a dictionary keyed by item ID.
There is no database, analyzer, or learner model yet.

The October 27 ordering implementation was written by Codex. Its functions live in
`frontend/lib/transcripts.ts`, with focused tests in `transcripts.test.cjs`:

- `mergeTranscriptEvent` combines ordering metadata and completed text by item ID.
  Metadata arriving later preserves existing text; repeated events reuse the same key.
- `previous_item_id: undefined` means ordering metadata has not arrived. `null` means
  the item is at the start of the conversation. They are different states.
- `orderTranscripts` derives a predecessor-to-successors lookup and walks from the root.
  Items with missing ancestors stay stored and pending until their links arrive.
  Non-message items retain their links but are skipped in the visible transcript.
- `text: null` means transcription is pending; an empty completed string is preserved.

The page renders this derived order instead of relying on object insertion order.
These changes do not address final-audio draining when Stop immediately closes WebRTC,
or later features for editing/inserting/deleting conversation items.

Before adding another feature, trace this path through the commented source:
**Greetings click -> request -> Python function -> JSON -> React state -> status paragraph.**

Explain why `setMessage` updates the page while changing `localStream.current` does not.

## References

- [React rules of hooks](https://react.dev/reference/rules/rules-of-hooks)
- [React refs and state](https://react.dev/learn/referencing-values-with-refs)
