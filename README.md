## Live2D Character Chat

This project demonstrates a character chat application using OpenAI's voice recognition and generation capabilities integrated with Live2D avatars. Users can engage in voice-based conversations with characters, with responses tailored to the user's emotions.

### Video
<video src="prototype_video/Prototype_Video.mp4" controls width="300">
  <track kind="subtitles" src="prototype_video/Prototype_Video.srt" srclang="en" label="English">
</video>

[Watch Prototype Video](prototype_video/Prototype_Video.mp4)

### Installation and Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd <folder>
   ```

2. Create a Python virtual environment and install dependencies:

   ```bash
   python -m venv venv
   source venv/bin/activate  # (Windows: venv\Scripts\activate)
   pip install -r requirements.txt
   ```

3. (For local execution) Run the server:

   ```bash
   python scripts/app.py
   ```

   - Default port: 8001

4. Access the application at `http://localhost:8001` in your browser.


## Usage

1. Select a character (Kei, Haru) from the main page.
2. Enter your OpenAI API key (first time only, stored locally in the browser).
3. Allow microphone access.
4. Click the "Talk" button to speak, and click again to stop recording.
5. The character will respond with voice and text.

## Project Structure

```
.
├── front/
│   ├── index.html, kei.html, haru.html
│   ├── js/
│   │   ├── chat.js (for Kei)
│   │   ├── haru.js (for Haru)
│   │   └── main.js (main/API key input)
│   └── css/
├── model/
│   ├── kei/ (Live2D model, sounds, etc.)
│   └── haru/ (Live2D model, motions, etc.)
├── scripts/
│   ├── app.py (Flask backend entry point)
│   ├── routes.py (Flask routes)
│   ├── services.py (OpenAI and Vercel integration)
│   ├── utils.py (Utility functions)
│   └── config.py (Configuration and constants)
├── requirements.txt
├── vercel.json
```

## Limitations and Considerations

- **OpenAI API Key Required**: An API key is mandatory to use the service (no free provision).
- **Vercel Free Plan**: Deployment may be slow due to large audio/model files.
- **Demo/Research Purpose**: The code is intended for demonstration and research purposes, not for large-scale deployment.

## FAQ

- **Q: Where do I get the API key?**  
  A: Obtain it directly from the [OpenAI website](https://platform.openai.com).

- **Q: How does emotion analysis work?**  
  A: User speech is transcribed to text, then analyzed for emotions using GPT-4o.

- **Q: The character doesn't greet immediately!**  
  A: The greeting appears after the Live2D model is fully loaded, with a slight delay.

- **Q: My voice isn't recognized!**  
  A: Check microphone permissions, internet connection, API key, and browser compatibility.
