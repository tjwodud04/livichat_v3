# scripts/routes.py
# Simplified routes for OpenAI Realtime API integration
from flask import render_template, Blueprint

from scripts.realtime import create_realtime_session

bp = Blueprint("api", __name__)

def register_routes(app):
    @app.route('/')
    def index():
        return render_template('index.html')

    # OpenAI Realtime API session endpoint
    # Returns ephemeral token for WebRTC connection
    @app.route('/api/realtime/session', methods=['POST'])
    def realtime_session():
        return create_realtime_session()
