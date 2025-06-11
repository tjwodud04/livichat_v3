import json
from typing import Any, AsyncGenerator, Awaitable, Callable
from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent
from agents.voice import VoiceWorkflowBase, VoicePipeline, VoicePipelineConfig
from agents.voice.models.openai_model_provider import OpenAIVoiceModelProvider
from agents.tool import WebSearchTool

# Agent 정의
web_search_tool = WebSearchTool()
ContentFinderAgent = Agent(
    name="ContentFinder",
    instructions=(
        "사용자 감정에 맞는 YouTube 영상 또는 음악 3개의 URL만 JSON 배열로 반환해 주세요."
    ),
    model="gpt-4o",
    tools=[web_search_tool],
)

kei_agent = Agent(
    name="Kei",
    instructions="... (이전과 동일)",
    model="gpt-4o",
)
haru_agent = Agent(
    name="Haru",
    instructions="... (이전과 동일)",
    model="gpt-4o",
)

class CustomHybridWorkflow(VoiceWorkflowBase):
    def __init__(self, selected_runner: Agent, character_name: str,
                 emotion_analyzer: Callable[[str], Awaitable[Any]], history_ref: list):
        super().__init__()
        self.selected_runner = selected_runner
        self.character_name = character_name
        self.emotion_analyzer = emotion_analyzer
        self.history = history_ref

    async def run(self, transcript: str) -> AsyncGenerator[str, None]:
        user_text = transcript
        emotion_percent, top_emotion = await self.emotion_analyzer(user_text)
        negative = {'노','애','오'}
        # 부정 감정 → 추천
        if top_emotion in negative:
            search_prompt = f"{top_emotion} 감정을 완화할 영상/음악 URL 3개만 JSON 배열로 반환해 주세요."
            search_run = await Runner.run(ContentFinderAgent, search_prompt)
            try:
                urls = json.loads(search_run.final_output)
            except:
                urls = []
            empath = f"{top_emotion} 감정이 느껴지시군요."
            yield empath
            # 최종 표시
            final = empath + "\n" + "\n".join(f"* 추천 {i+1}: {u}" for i,u in enumerate(urls))
            yield final
        else:
            # 일반 채팅 (스트리밍)
            messages = self.history.copy() + [{"role": "user", "content": user_text}]
            streaming_run = Runner.run_streamed(self.selected_runner, messages)
            ai_speech = ""
            async for event in streaming_run.stream_events():
                if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                    delta = event.data.delta or ""
                    yield delta
                    ai_speech += delta
            yield ai_speech

def create_voice_pipeline(api_key: str, character: str,
                          emotion_analyzer: Callable[[str], Awaitable[Any]],
                          history_ref: list):
    runners = {"kei": kei_agent, "haru": haru_agent}
    voices = {"kei": "alloy", "haru": "nova"}
    runner = runners.get(character, kei_agent)
    voice = voices.get(character, "alloy")

    workflow = CustomHybridWorkflow(runner, character, emotion_analyzer, history_ref)
    config = VoicePipelineConfig()
    config.stt_settings.model = "whisper-1"
    config.tts_settings.model = "tts-1-hd"
    config.tts_settings.voice = voice
    config.model_provider = OpenAIVoiceModelProvider(api_key=api_key)

    return VoicePipeline(workflow=workflow,
                         stt_model="whisper-1",
                         tts_model="tts-1-hd",
                         config=config)
