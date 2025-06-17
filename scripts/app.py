from flask import Flask
from routes import register_routes

app = Flask(
    __name__,
    static_folder='../front',
    static_url_path='',
    template_folder='../front'
)

register_routes(app)

if __name__ == '__main__':
    app.run(port=8001, debug=True) 