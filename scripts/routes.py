# scripts/routes.py
"""Flask route registration for the LiviChat backend."""
from flask import jsonify, render_template, request

from scripts.config import SESSION_RATE_LIMIT
from scripts.realtime import create_realtime_session


def register_routes(app, limiter):
    """Register the landing page and the Realtime session endpoint on ``app``.

    Args:
        app: The Flask application.
        limiter: The Flask-Limiter instance used to throttle token creation.
    """

    @app.route("/")
    def index():
        return render_template("index.html")

    # OpenAI Realtime API session endpoint.
    # Returns an ephemeral client secret for the browser's WebRTC connection.
    @app.route("/api/realtime/session", methods=["POST"])
    @limiter.limit(SESSION_RATE_LIMIT)
    def realtime_session():
        api_key = request.headers.get("X-API-KEY", "").strip()
        if not api_key:
            return jsonify({"error": "X-API-KEY header is required"}), 401
        return create_realtime_session()
