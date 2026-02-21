from flask import Flask, send_from_directory
import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from scripts.routes import register_routes

app = Flask(
    __name__,
    static_folder='../front',
    static_url_path='',
    template_folder='../front'
)

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://"
)

# model 폴더 static 서빙
MODEL_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'model')

@app.route('/model/<path:filename>')
def serve_model(filename):
    return send_from_directory(MODEL_FOLDER, filename)

register_routes(app, limiter)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
