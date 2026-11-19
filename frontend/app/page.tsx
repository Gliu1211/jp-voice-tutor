// Enable React state, click handlers, and browser APIs in this component.
// Next.js can prepare initial HTML on the server; button handlers run in the browser.
"use client";

// Hooks let React retain values when it calls Home() again to update the page.
import { useState, useRef, useEffect } from "react";
import { mergeTranscriptEvent, orderTranscripts, type TranscriptEntries } from "../lib/transcripts";

// Next.js loads this public backend address from frontend/.env.local.
// NEXT_PUBLIC_ values are visible in the browser, so never use them for secret keys.
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// One Start→Stop voice conversation with the tutor.
// A new one is added to `sessions` each time the WebRTC data channel opens.
interface ConversationSession {
  session_id: string;              // Generated in the browser (crypto.randomUUID), not by OpenAI.
  start_time: string;              // ISO timestamp from when the data channel opened.
  end_time: string | null;         // null while the session is still running.
  transcripts: TranscriptEntries;  // Keyed by item ID; see lib/transcripts.ts for merge/order logic.
  session_status: "active" | "complete";
  analysis: SessionAnalysis | null
}
interface GrammarCorrection {
  utter_id: string;               // The transcript entry ID that was corrected.
  correction: string;         // The corrected Japanese sentence.
  original: string;
  explanation: string;            // A short English explanation of the mistake.
  category: string;               // "particle", "conjugation", "word choice", etc.
}
interface SessionAnalysis {
  session_id: string;             // Copied from the request.
  correction_list: GrammarCorrection[];  // Empty if no mistakes were found.
}

// Next.js uses app/page.tsx as the page for the root URL (/).
// React calls this function again when state changes to describe the updated UI.
export default function Home() {
  // useState returns [the current value, a function that updates that value].
  // setMessage schedules a render so the status paragraph shows new text.
  const [message, setMessage] = useState("Ready to check the backend.");
  // Every conversation so far (past and current). Rendered as a list at the bottom of the page.
  const [sessions, setSessions] = useState<ConversationSession[]>([]);

  // This loading flag belongs to the greeting HTTP request.
  const [isLoading, setIsLoading] = useState(false);

  // Hooks must be inside a React component (or custom hook), before its return.
  // The TypeScript union permits only these strings; "idle" is the initial value.
  // Lifecycle: idle → (Start clicked) requesting → (handshake done) active → (Stop clicked) idle.
  // On any setup error it falls back to idle. The buttons' disabled state is driven by this.
  const [micStatus, setMicStatus] = useState<
    "idle" | "requesting" | "active"
  >("idle");






  // A ref is a persistent container; .current holds the actual microphone stream.
  // MediaStream | null means a stream or nothing yet.
  // Changing .current does not trigger a render, but the container survives renders.
  // The WebRTC connection to OpenAI Realtime (audio both ways + the "oai-events" data channel).
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null);
  // audioRef is used for the audio element to play the remote audio stream from the peer connection.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // "Is this component still mounted?" flag (NOT microphone permission, despite the name).
  // Async code checks it after each await so it never touches state/refs after the page unmounts.
  const permission = useRef(true)

  // Runs once on mount (empty [] deps). The returned function runs on unmount and
  // releases everything: mic tracks, the peer connection, and the audio element.
  useEffect(() => {
    permission.current = true
    // Keep this element available to cleanup even after React clears the ref.
    const audioElement = audioRef.current;
    return () => {
      permission.current = false
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop())
        localStream.current = null;
      }
      if (peerConnection.current) {
        peerConnection.current.close()
        peerConnection.current = null
      }
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
    };
  }, []);
  // React calls this handler when the user clicks the microphone Start button.
  // Overall flow:
  //   1. Get the mic stream.
  //   2. Build an RTCPeerConnection: send mic audio, receive tutor audio, open a data channel.
  //   3. Create an SDP offer and POST it to our backend's /session endpoint.
  //   4. The backend forwards it to OpenAI and returns the SDP answer; apply it.
  //   5. WebRTC connects; the data channel opens and a new session entry is created.
  async function startButton() {

    // Ignore double clicks / clicks while a session is already starting or running.
    if (micStatus !== "idle") return;
    setMicStatus("requesting")
    try {
      // navigator is a browser API. Request microphone audio, without camera video.
      // await waits for permission/device access without blocking the browser UI.
      // Save the stream so the Stop handler can access its tracks later.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // This logs the ref container in browser developer tools, not on the page.
      // Log localStream.current to inspect just the actual stream.
      console.log("Microphone access granted:", localStream);

      // Our own ID for this conversation. The closures below capture it so incoming
      // transcript events are written into the right session.
      const session_id = crypto.randomUUID()

      // If the page unmounted while the permission prompt was open, release the mic and bail.
      if (!permission.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStream.current = stream
      const pc = new RTCPeerConnection()
      // Fires when the tutor's audio track arrives; route it into the <audio> element to play it.
      pc.ontrack = (event) => {
        if (!permission.current || !audioRef.current) return;
        // A remote track may arrive without an associated stream.
        audioRef.current.srcObject =
          event.streams[0] ?? new MediaStream([event.track]);
      };

      peerConnection.current = pc;

      // Send our microphone audio to the tutor.
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream)
      });
      // Data channel for OpenAI Realtime JSON events (transcripts, response status, etc.).
      // The name "oai-events" is what the Realtime API expects.
      const dc = pc.createDataChannel("oai-events")

      // Every Realtime event arrives here as a JSON string.
      // mergeTranscriptEvent picks out the transcript-related ones and ignores the rest.
      dc.addEventListener("message", (event) => {
        if (!permission.current) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          console.warn("Ignored a Realtime message with invalid JSON.");
          return;
        }

        // Update only this session's transcripts. If the event changed nothing,
        // return the same array so React can skip a re-render.
        setSessions((previousSessions) => {
          let changed = false;
          const nextSessions = previousSessions.map((session) => {
            if (session.session_id !== session_id) return session;
            const transcripts = mergeTranscriptEvent(session.transcripts, parsed, session_id);
            if (transcripts === session.transcripts) return session;
            changed = true;
            return { ...session, transcripts };
          });
          return changed ? nextSessions : previousSessions;
        });
      });

      // The channel opens once WebRTC is fully connected, so this is when the
      // conversation actually starts. Create the session entry here.
      dc.addEventListener("open", () => {
        if (!permission.current) return
        console.log("data channel open")
        setMessage("Microphone active. Speak now.")
        const session: ConversationSession = {
          session_id: session_id,
          start_time: new Date().toISOString(),
          end_time: null,
          transcripts: {},
          session_status: "active",
          analysis: null
        }
        setSessions((prevSessions) => [...prevSessions, session])


      })





      // --- SDP handshake ---
      // The offer describes what we send and receive (audio codecs, data channel, network info).
      const offer = await pc.createOffer()
      if (!permission.current) return
      await pc.setLocalDescription(offer)
      if (!permission.current) return


      // response consists of a JSON object with the answer SDP from the backend. SDP is a text format that describes the media capabilities of the peer connection.
      // The backend holds the OpenAI API key and talks to OpenAI for us, so the key never reaches the browser.
      // NOTE: unlike checkBackend, this doesn't check that apiUrl is set.
      const response = await fetch(`${apiUrl}/session`, {

        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sdp: offer.sdp })

      })

      if (!response.ok) {
        throw new Error(`POST failed ${response.status}`)
      }

      const data = await response.json();

      if (!permission.current) return;

      // Debug logging of our offer; safe to remove.
      console.log(offer.type);
      console.log(offer.sdp);

      // Reject an unexpected response before applying the remote description.
      // String length is a number property, so it is read without parentheses.
      if (
        data?.type !== "answer" ||
        typeof data?.sdp !== "string" ||
        data.sdp.trim().length === 0
      ) {
        throw new Error("Invalid session response");
      }

      setMessage("Connecting...")
      // Applying the answer completes the handshake. WebRTC then connects in the background,
      // and the data channel "open" handler above fires when it's ready.
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp })

      if (!permission.current) return;

      // NOTE: there is no pc.onconnectionstatechange handler yet, so if the connection
      // drops later, the UI will still say "active".

      setMicStatus("active")
    } catch (error) {



      // Microphone, HTTP, and WebRTC setup errors all reach this cleanup.
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop())
        localStream.current = null
      }
      peerConnection.current?.close()
      peerConnection.current = null

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.srcObject = null;
      }

      if (!permission.current) return;
      const detail = error instanceof Error ? error.message : "Unknown error.";
      setMessage(`Could not start the session: ${detail}`);
      setMicStatus("idle")
      console.error("Session setup failed:", error);
    }
  }

  // Ends the current conversation: release the mic, close WebRTC, silence the audio,
  // and mark the active session complete. (The same teardown appears in the
  // unmount cleanup and startButton's catch; it could become one helper.)
  // There is no await here, so this could also be a plain (non-async) function.
  async function stopButton() {
    // Check the stream inside the ref. The ref container itself always exists.
    if (localStream.current) {
      // getTracks() returns an array; forEach calls this callback for every track.
      // stop() ends a track and releases this stream's use of the microphone.
      localStream.current.getTracks().forEach((track) => {
        track.stop();

      });
    }
    // peerConnection is a ref to the RTCPeerConnection object. If it exists, close it and clear the ref.
    if (peerConnection.current) {
      peerConnection.current?.close();
      peerConnection.current = null;
    }
    // Forget the stopped stream. Clearing the ref alone would not stop its tracks.
    localStream.current = null;

    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.pause();
    }
    // update the session status to complete, update end time
    const endTime = new Date().toISOString();

    setSessions((prevSessions) =>
      prevSessions.map((session) => {
        if (session.session_status === "active") {
          return {
            ...session,
            session_status: "complete",
            end_time: endTime,
          }
        } else {
          return session;
        }
      })
    );

    // Update the shared status paragraph and schedule a React render.
    setMessage("Microphone stopped.");

    setMicStatus("idle")
  }

  async function analyzeSession(session: ConversationSession) {
    try {
      const orderedTranscripts = orderTranscripts(session.transcripts);
      const utterances = orderedTranscripts.filter((entry) => entry.text != null).map((entry) => ({
        utter_id: entry.id,
        role: entry.role,
        text: entry.text,
      }))

      const response = await fetch(`${apiUrl}/analyze`, {
        method: "POST", headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ session_id: session.session_id, utterances: utterances })
      })
      if (!response.ok) {
        throw new Error(`POST failed ${response.status}`)
      }
      const data: SessionAnalysis = await response.json();
      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.session_id === session.session_id) {
            return { ...s, analysis: data };
          }
          return s;
        })
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error.";
      setMessage(`Analysis failed: ${detail}`);
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


      {/* Pass the handler to onClick. checkBackend() would call it during render. */}
      <button onClick={checkBackend} disabled={isLoading}>
        {/* condition ? valueIfTrue : valueIfFalse chooses the button text. */}
        {isLoading ? "Checking..." : "Greetings"}
      </button>

      {/* Start is clickable only when idle; Stop only while a session is active. */}
      <button onClick={startButton}
        disabled={micStatus === "requesting" || micStatus === "active"}>

        Start Microphone
      </button>

      <button onClick={stopButton}
        disabled={micStatus !== "active"}>
        Stop Microphone
      </button>
      {/*map is like the for i in array from python, use to render elements*/}
      <div>

        {sessions.map((session) => {
          // Transcript entries that can be placed in conversation order (see lib/transcripts.ts).
          const orderedEntries = orderTranscripts(session.transcripts);
          // Entries whose speaker (user/tutor) is known...
          const visibleCount = Object.values(session.transcripts).filter(
            (entry) => entry.role !== null,
          ).length;
          // ...minus those already ordered = entries still waiting for ordering info.
          const pendingCount = visibleCount - orderedEntries.length;
          return (
            <div key={session.session_id}>
              <h2>Session {session.session_id}</h2>
              <p>Start Time: {session.start_time}</p>
              <p>End Time: {session.end_time ?? "In Progress"}</p>

              <div>
                {orderedEntries.map((entry) => (
                  <p key={entry.id}>
                    {entry.role === "user" ? "You" : "Tutor"}: {entry.text ?? "Waiting for transcript…"}
                  </p>
                ))}
                {pendingCount > 0 && (
                  <p role="status">{pendingCount} message(s) waiting for conversation details…</p>
                )}
              </div>
              <button
                onClick={() => analyzeSession(session)}
                disabled={session.session_status !== "complete" || session.analysis !== null}
              >
                Analyze Session

              </button>

              {session.analysis && (
                <div>
                  {session.analysis.correction_list.map((c) => (
                    <div key={c.utter_id}>
                      <p>Original: {c.original}</p>
                      <p>Correction: {c.correction}</p>
                      <p>Explanation: {c.explanation}</p>
                    </div>
                  ))}

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Plays the tutor's voice. pc.ontrack sets its srcObject; autoPlay starts it automatically. */}
      <audio ref={audioRef} autoPlay controls />

      {/* Both features currently write to this shared message. */}
      {/* The accessibility attributes help screen readers announce status updates. */}
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}
