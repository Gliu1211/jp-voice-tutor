"use client";

import { useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [message, setMessage] = useState("Ready to check the backend.");
  const [isLoading, setIsLoading] = useState(false);

  async function checkBackend() {
    setIsLoading(true);
    setMessage("Connecting...");

    try {
      if (!apiUrl) {
        throw new Error("Set NEXT_PUBLIC_API_URL in .env.local and restart Next.js.");
      }

      const response = await fetch(`${apiUrl}/greeting`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      // fetch rejects network failures, but HTTP error statuses need a check.
      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      if (typeof data?.message !== "string") {
        throw new Error("Backend response is missing a message string.");
      }
      setMessage(data.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error.";
      setMessage(`Connection failed: ${detail} Check that the backend is running.`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <h1>Japanese Voice Trainer</h1>
      <p>Milestone 1: connect the frontend to the Python backend.</p>
      <button onClick={checkBackend} disabled={isLoading}>
        {isLoading ? "Checking..." : "Greetings"}
      </button>

      <button 
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}
