// Enable React state, click handlers, and browser APIs in this component.
// Next.js can prepare initial HTML on the server; button handlers run in the browser.
"use client";

// Hooks let React retain values when it calls Home() again to update the page.
import { useState, useRef } from "react";

// Next.js loads this public backend address from frontend/.env.local.
// NEXT_PUBLIC_ values are visible in the browser, so never use them for secret keys.
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// Next.js uses app/page.tsx as the page for the root URL (/).
// React calls this function again when state changes to describe the updated UI.
export default function Home() {
  // useState returns [the current value, a function that updates that value].
  // setMessage schedules a render so the status paragraph shows new text.
  const [message, setMessage] = useState("Ready to check the backend.");

  // This loading flag belongs to the greeting HTTP request.
  const [isLoading, setIsLoading] = useState(false);

  // Hooks must be inside a React component (or custom hook), before its return.
  // The TypeScript union permits only these strings; "idle" is the initial value.
  // TODO (your exercise): this state is declared but not yet updated or displayed.
  const [micStatus, setMicStatus] = useState<
    "idle" | "requesting" | "active"
  >("idle");

  // A ref is a persistent container; .current holds the actual microphone stream.
  // MediaStream | null means a stream or nothing yet.
  // Changing .current does not trigger a render, but the container survives renders.
  const localStream = useRef<MediaStream | null>(null);

  // React calls this handler when the user clicks the microphone Start button.
  async function startButton() {
    if (micStatus !== "idle") return; 
    setMicStatus("requesting")
    try {
      // navigator is a browser API. Request microphone audio, without camera video.
      // await waits for permission/device access without blocking the browser UI.
      // Save the stream so the Stop handler can access its tracks later.
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      // This logs the ref container in browser developer tools, not on the page.
      // Log localStream.current to inspect just the actual stream.
      console.log("Microphone access granted:", localStream);

      // TODO: mark the mic active and display success on the page.
      setMicStatus("active")
      setMessage("Success")
      // This code does not record a file or send audio to our Python backend.
    } catch (error) {
      // Permission denial or an unavailable device can land here.
      // TODO: show the error on the page as well as in the developer console.
      setMessage("Could not access the microphone. Check microphone permission")
      setMicStatus("idle")
      console.log("error: " + error);
    }
    // TODO: prevent another Start while permission is pending or a stream is active.
    // Otherwise the ref can be overwritten while an earlier stream keeps running.
  }

  // There is no await here, so this could also be a plain (non-async) function.
  async function stopButton() {
    // Check the stream inside the ref. The ref container itself always exists.
    if (localStream.current) {
      // getTracks() returns an array; forEach calls this callback for every track.
      // stop() ends a track and releases this stream's use of the microphone.
      localStream.current.getTracks().forEach((track) => {
        track.stop();
      });

      // Forget the stopped stream. Clearing the ref alone would not stop its tracks.
      localStream.current = null;

      // Update the shared status paragraph and schedule a React render.
      setMessage("Microphone stopped.");
      // TODO: reset micStatus to "idle" when you implement its transitions.
      setMicStatus("idle")
    }
  }

  // Despite its original name, this handler now requests your /greeting endpoint.
  async function checkBackend() {
    // Disable the greeting button and display progress while the request is pending.
    setIsLoading(true);
    setMessage("Connecting...");

    try {
      if (!apiUrl) {
        throw new Error("Set NEXT_PUBLIC_API_URL in .env.local and restart Next.js.");
      }

      // The browser sends a GET request to Python on port 8000.
      // Backticks and ${...} combine the configured address with /greeting.
      const response = await fetch(`${apiUrl}/greeting`, {
        cache: "no-store", // Ask for a fresh response instead of a cached one.
        signal: AbortSignal.timeout(5000), // Cancel after five seconds.
      });

      // fetch rejects network failures, but HTTP errors (such as 404) need this check.
      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}.`);
      }

      // Parse the JSON response text into a JavaScript value.
      const data = await response.json();

      // TypeScript cannot validate network data; check the actual value at runtime.
      if (typeof data?.message !== "string") {
        throw new Error("Backend response is missing a message string.");
      }

      // For /greeting, display the Japanese string returned by Python.
      setMessage(data.message);
    } catch (error) {
      // Caught values might not be Error objects, so check before reading .message.
      const detail = error instanceof Error ? error.message : "Unknown error.";
      setMessage(`Connection failed: ${detail} Check that the backend is running.`);
    } finally {
      // Runs on both success and failure, allowing the user to retry.
      setIsLoading(false);
    }
  }

  // JSX describes the page. Curly braces insert JavaScript values/expressions.
  return (
    <main>
      <h1>Japanese Voice Trainer</h1>
      <p>Milestone 1: connect the frontend to the Python backend.</p>

      {/* Pass the handler to onClick. checkBackend() would call it during render. */}
      <button onClick={checkBackend} disabled={isLoading}>
        {/* condition ? valueIfTrue : valueIfFalse chooses the button text. */}
        {isLoading ? "Checking..." : "Greetings"}
      </button>

      {/* startButton() below is visible text because it is outside curly braces. */}
      {/* TODO: choose readable labels and use micStatus to disable these buttons. */}
      <button onClick={startButton} 
      disabled={micStatus === "requesting" || micStatus === "active"}>
       
        Start Microphone
      </button>

      <button onClick={stopButton}
        disabled={micStatus !== "active"}>
        Stop Microphone
      </button>

      {/* Both features currently write to this shared message. */}
      {/* The accessibility attributes help screen readers announce status updates. */}
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}
