# FastAPI maps HTTP requests to Python functions and builds JSON responses.
from fastapi import FastAPI
from pydantic import BaseModel 
# Middleware runs around request handling; this one supplies browser CORS headers.
from fastapi.middleware.cors import CORSMiddleware

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
    return {
        "message": "Offer received",
        "sdp_length": len(offer.sdp) }

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
