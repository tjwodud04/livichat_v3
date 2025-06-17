from flask import render_template, request
from services import process_chat

def register_routes(app):
    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/scripts/chat', methods=['POST'])
    async def chat():
        return await process_chat(request) 