# scripts/app.py
"""Flask application entry point.

Exposes the WSGI callable ``app`` used by Vercel's @vercel/python builder and by
``python scripts/app.py`` for local development.
"""
import os

from flask import Flask, send_from_directory
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from scripts.config import SERVER_HOST, SERVER_PORT
from scripts.routes import register_routes

app = Flask(
    __name__,
    static_folder="../front",
    static_url_path="",
    template_folder="../front",
)

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://",
)

# Serve Live2D model assets from the top-level /model directory.
MODEL_FOLDER = os.path.join(os.path.dirname(__file__), "..", "model")


@app.route("/model/<path:filename>")
def serve_model(filename):
    """Serve a Live2D model asset (moc3, textures, motions, physics, etc.)."""
    return send_from_directory(MODEL_FOLDER, filename)


register_routes(app, limiter)

if __name__ == "__main__":
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=True)
