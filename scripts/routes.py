# scripts/routes.py
# Simplified routes for OpenAI Realtime API integration
from flask import render_template, Blueprint, request, jsonify

from scripts.realtime import create_realtime_session

bp = Blueprint("api", __name__)

def register_routes(app, limiter):
    @app.route('/')
    def index():
        return render_template('index.html')

    # OpenAI Realtime API session endpoint
    # Returns ephemeral token for WebRTC connection
    @app.route('/api/realtime/session', methods=['POST'])
    @limiter.limit("10 per minute")
    def realtime_session():
        api_key = request.headers.get('X-API-KEY', '').strip()
        if not api_key:
            return jsonify({'error': 'X-API-KEY header is required'}), 401
        return create_realtime_session()
