# Japanese Voice Trainer

Current progress: a Next.js + TypeScript page calls Python + FastAPI for a Japanese
greeting. Browser microphone Start/Stop handlers exist; microphone status and button
guards are unfinished. There is no AI connection, audio recording/transmission,
database, or learner model yet.

Read [the current code walkthrough](CODE_WALKTHROUGH.md) alongside the explanatory
comments in the source. It maps each file to its role and describes both button flows.

## Repository location

The Git root on this machine is the **inner** folder:

```text
C:\Users\George\Downloads\jp-voice-tutor\jp-voice-tutor
```

```text
frontend/
  app/layout.tsx       HTML document wrapper and page metadata
  app/page.tsx         Home page, button, HTTP request, and React state
  app/globals.css      Small shared stylesheet
  .env.example        Public API URL template
  package.json        JavaScript dependencies and run commands
  package-lock.json   Resolved JavaScript dependency versions
  tsconfig.json       TypeScript compiler configuration
  next-env.d.ts       Framework-managed TypeScript declarations
backend/
  main.py             FastAPI application and /health endpoint
  requirements.txt    Direct Python dependencies
README.md
```

`node_modules`, `.next`, `.venv`, and `.env.local` are local/generated files
ignored by Git. Keep `package-lock.json` in Git.
Next.js also generated `frontend/AGENTS.md` and `frontend/CLAUDE.md` with guidance
for coding assistants; these are not application code.

## Run locally (Windows PowerShell)

Prerequisites: Node.js 20.9+ and Python 3.10+. This starter was set up with
Node.js 24.13.0 and Python 3.13.9. Use two terminals, one per application.

**Terminal 1: backend**

```powershell
cd C:\Users\George\Downloads\jp-voice-tutor\jp-voice-tutor\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The first two setup commands after `cd` are only needed for a fresh environment
or dependency installation. The local `.venv` has already been created here.
Calling its Python directly avoids changing PowerShell's activation policy.
`main:app` means “load the object named `app` from `main.py`.” Uvicorn listens
for HTTP requests; `--reload` restarts it when Python source changes.

Open <http://127.0.0.1:8000/health> to see:

```json
{"message":"FastAPI is running!"}
```

FastAPI also provides interactive endpoint documentation at
<http://127.0.0.1:8000/docs>.

**Terminal 2: frontend**

```powershell
cd C:\Users\George\Downloads\jp-voice-tutor\jp-voice-tutor\frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

`npm.cmd ci` installs the versions recorded in `package-lock.json`. Installation
and copying the environment template are first-time setup steps; both are already
done on this machine. Do not overwrite an edited `.env.local` on every startup.
`npm.cmd` avoids the PowerShell script execution-policy issue some Windows setups
have with `npm.ps1`.

Open <http://localhost:3000>, then click **Greetings**. You should see
**こんにちは！**. Stop either server with Ctrl+C in its terminal.

## Understand the request

```text
Browser at localhost:3000
  -> button calls checkBackend()
  -> GET http://127.0.0.1:8000/greeting
  -> FastAPI runs greeting() and serializes its dictionary as JSON
  -> browser parses JSON and calls setMessage(data.message)
  -> React updates the displayed text
```

Read `backend/main.py` first. `FastAPI()` creates the application;
`@app.get("/health")` connects a GET request at that path to `health()`.
The return annotation describes a dictionary of strings. A custom analyzer
schema is deliberately left for your later Pydantic exercise.

Then read `frontend/app/page.tsx`. `"use client"` enables interactive React code
in the browser. `useState` holds the displayed text and loading flag.
`checkBackend()` sets loading state, awaits `fetch`, checks the HTTP status,
parses JSON, and updates the message. A small runtime check verifies that
`message` is a string: TypeScript alone cannot validate network data.
The catch block displays errors; finally re-enables the button. A five-second
timeout keeps an unresponsive request from leaving the button disabled forever.

`layout.tsx` supplies the required HTML/body wrapper. `globals.css` only controls
appearance. `package.json` defines what `npm.cmd run dev` actually runs.

## Environment variables and CORS

`frontend/.env.local` contains:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

This separates the backend address from the page code. Next.js exposes values
prefixed with `NEXT_PUBLIC_` to browser code, so they are public. Never put an API
secret in such a variable. No credentials are needed for this milestone.
Restart the frontend after changing this setting; production browser values are
embedded at build time.

An origin includes protocol, host, and port. The frontend and API have different
origins, so the browser checks whether the API permits the page's origin.
`CORSMiddleware` adds the relevant response headers for `http://localhost:3000`.
CORS is a browser access rule, not authentication. Using a different frontend
hostname or port requires updating the allowed origin in `main.py`.

For this MVP, the frontend origin is a fixed local-development value in Python.
There is no separate backend environment configuration yet because the backend
has no secrets or other settings that need it.

## Why these dependencies?

| Dependency | Reason |
| --- | --- |
| Next.js | Serves the frontend and provides routing and build tooling. |
| React / React DOM | Define components and render changing UI state. |
| TypeScript / @types packages | Check source types and supply library type definitions. |
| FastAPI | Maps HTTP endpoints to Python functions and returns JSON. |
| Uvicorn | Runs the HTTP server that hosts the FastAPI application. |

FastAPI installs Pydantic as a dependency. We will define our own analysis models
when we reach the analyzer milestone. Native `fetch` is sufficient for this one
request; no HTTP client library is needed. Python direct dependencies are pinned,
but their transitive dependencies are not fully locked yet, an MVP simplification.

## Verification and troubleshooting

From `frontend`, run `npm.cmd run build` and `npm.cmd run typecheck` to check
compilation and types. To inspect the actual integration, use your browser's
Network panel, click the button, and inspect the `/greeting` request and JSON response.

- If `/health` does not open directly, check the backend terminal first.
- If `/health` opens but the page fails, check the browser console for CORS and
  verify you opened `http://localhost:3000`.
- If the page reports a missing API URL, copy `.env.example` to `.env.local` and
  restart Next.js.
- If a port is occupied, stop the existing server you started before starting
  another instance.

## Your first exercise

The initial starter was authored by Codex. Your next change should be yours.

1. Add a new `GET /greeting` endpoint returning
   `{"message": "こんにちは！"}`. Keep `/health` working.
2. Change the existing frontend button to call `/greeting` and label it
   **Get greeting**.
3. Verify the Japanese message appears. Stop the backend and click again to
   observe the failure state, then restart it and retry.

Hint: find the route decorator in Python and the URL passed to `fetch` in
TypeScript. You do not need another library or file for this exercise.

Before moving to voice, explain in your own words:
**Which process serves the page, which process handles `/greeting`, and why does
the browser need a CORS header when they both run on your computer?**

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/)
- [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/)
