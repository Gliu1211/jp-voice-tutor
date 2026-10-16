# FastAPI maps HTTP requests to Python functions and builds JSON responses.
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel 
# Middleware runs around request handling; this one supplies browser CORS headers.
from fastapi.middleware.cors import CORSMiddleware
import os 
from pathlib import Path 
from dotenv import load_dotenv
from openai import OpenAI, APIError
load_dotenv(Path(__file__).with_name(".env"))

# Uvicorn loads this object when you run: python -m uvicorn main:app
# main is the module (main.py); app is the variable inside it.
app = FastAPI(title="Japanese Voice Trainer")

# An origin includes protocol, hostname, and port. The page and API differ.
# Allow browser JavaScript from localhost:3000 to read our API responses.
# CORS does not authenticate users or restrict non-browser clients.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"]
)
# 
class SessionOffer(BaseModel):
    sdp:str  



@app.post("/session")
def session(offer: SessionOffer):

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException( 
            status_code=503,
            detail="OPENAI_API_KEY is not configured",
    )
    session_config = {
    "type": "realtime",
    "model": "gpt-realtime-2.1-mini",
    "instructions": (
        "You are a friendly Japanese tutor. Speak simple Japanese, "
        "keep replies brief, and ask one question at a time."
    ),
    "audio": {"output": {"voice": "marin"}},}
    try:
        with OpenAI(api_key=api_key, timeout=15.0, max_retries=0) as client:
            call = client.realtime.calls.create(
                sdp=offer.sdp,
                session=session_config,)
            answer_sdp = call.read().decode("utf-8")
    except APIError:
        raise HTTPException(status_code=502, detail="Could not create voice session")
    
    return {"type": "answer", "sdp": answer_sdp}

    
    
    

# The decorator registers health() as the handler for GET /health.
@app.get("/health")
def health() -> dict[str, str]:
    # The annotation describes the return type; FastAPI serializes this dict as JSON.
    return {"message": "FastAPI is running!"}

# Your greeting exercise: a second URL handled by a separate Python function.
@app.get("/greeting")
def greeting(): 
    # The frontend reads the message field from the resulting JSON object.
    return {"message": "こんにちは！"}
