from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Japanese Voice Trainer")

# The browser page and API run on different ports, so they have different origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"message": "FastAPI is running!"}

@app.get("/greeting")
def greeting(): 
    return {"message": "こんにちは！"}