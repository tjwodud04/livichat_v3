import re
import asyncio
from typing import Any, AsyncGenerator, Awaitable, Callable

from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent
from agents.voice import VoiceWorkflowBase, VoicePipeline, VoicePipelineConfig
from agents.voice.events import VoiceStreamEventAudio, VoiceStreamEventLifecycle
from agents.voice.models.openai_model_provider import OpenAIVoiceModelProvider
from agents.tool import WebSearchTool

# 검색 Tool 및 Agent 정의
web_search_tool = WebSearchTool()
ContentFinderAgent = Agent(
    name="ContentFinder",
    instructions=(
        "사용자의 감정 상태와 관련된 키워드를 사용하여, 한국 사용자에게 적합한 YouTube 영상이나 음악 3개를 찾아 링크 목록을 반환합니다."
        "각 결과는 제목과 URL을 포함해야 합니다. 다른 말은 하지 말고 결과만 반환하세요."
    ),
    model="gpt-4o",
    tools=[web_search_tool],
)

kei_agent = Agent(
    name="Kei",
    instructions=(
        "당신은 창의적이고 현대적인 감각을 지닌 캐릭터로, 독특한 은발과 에메랄드빛 눈동자가 특징입니다. "
        "사용자의 이야기에서 감정을 파악하고, 이 감정에 공감 기반이되 실용적인 관점을 놓치지 않고, 따뜻하고 세련된 톤으로 2문장 이내의 답변을 제공해주세요."
    ),
    model="gpt-4o",
)

haru_agent = Agent(
    name="Haru",
    instructions=(
        "당신은 비즈니스 환경에서 일하는 전문적이고 자신감 있는 여성 캐릭터입니다."
        "사용자의 이야기에서 감정을 파악하고, 이 감정에 공감하면서도 실용적인 관점에서 명확하고 간단한 해결책을 2문장 이내로 제시해주세요."
    ),
    model="gpt-4o",
)

class CustomHybridWorkflow(VoiceWorkflowBase):
    def __init__(
        self,
        selected_runner: Agent,
        character_name: str,
        emotion_analyzer: Callable[[str], Awaitable[Any]],
        history_ref: list
    ):
        super().__init__()
        self.selected_runner = selected_runner
        self.character_name = character_name
        self.emotion_analyzer = emotion_analyzer
        self.history = history_ref

    async def run(self, transcript: str) -> AsyncGenerator[str, None]:
        # 1) 감정 추출
        user_text = transcript
        emotion_percent, top_emotion = await self.emotion_analyzer(user_text)

        negative_emotions = {'분노', '슬픔', '미움', '두려움'}
        final_text_response = ""

        if top_emotion in negative_emotions:
            # 2) 감정 기반 추천 트랙
            # 에이전트 호출 (동기 실행)
            search_prompt = f"{top_emotion} 감정을 느낄 때 듣기 좋은 노래나 위로가 되는 영상"
            search_run = Runner.run(ContentFinderAgent, search_prompt)
            search_text = search_run.final_output

            # 감정별 카테고리 매핑
            emotion_map = {
                '분노': '노(화남)', '슬픔': '애(슬픔)',
                '미움': '오(싫어함)', '두려움': '구(두려움)',
            }
            category = emotion_map.get(top_emotion, '기타')

            # 톤 별 메시지 선택
            tones = {
                'kei': {
                    'suggest': f"그런 {category} 감정일 때 잠시 집중을 돌려보세요. 아래 정보가 도움이 될 거예요.",
                    'empathize': f"그런 {category} 감정을 느끼셨군요. 제가 다 이해할 순 없지만, 함께 위로해드릴게요." 
                },
                'haru': {
                    'suggest': f"그 {category} 감정에는 잠시 환기가 필요합니다. 아래 링크를 확인해보세요.",
                    'empathize': f"그 {category} 감정에 공감합니다. 도움이 될 만한 자료를 소개할게요."
                }
            }
            tone = tones.get(self.character_name, tones['kei'])
            # 기분에 따라 추천/공감 문구 설정
            if top_emotion in ['슬픔', '두려움']:
                speech_text = tone['empathize']
            else:
                speech_text = tone['suggest']

            # URL 파싱
            urls = re.findall(r'https?://[^\s\n)]+', search_text)
            # 응답 조합
            display_text = f"{speech_text}\n"
            if urls:
                for i, url in enumerate(urls[:3], 1):
                    display_text += f"* 추천 콘텐츠 {i}: {url}\n"
            else:
                display_text += "추천 콘텐츠를 찾지 못했어요."

            final_text_response = display_text
            # 사용자에게 먼저 요약된 speech_text 전달
            yield speech_text

        else:
            # 3) 일반 채팅 트랙 (스트리밍)
            messages = self.history.copy() + [{"role": "user", "content": user_text}]
            streaming_run = Runner.run_streamed(self.selected_runner, messages)
            ai_speech = ""
            async for event in streaming_run.stream_events():
                if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                    delta = event.data.delta or ""
                    yield delta
                    ai_speech += delta
            final_text_response = ai_speech

        # 4) 최종 결과 저장 및 반환
        self.set_result({
            "user_text": user_text,
            "ai_text": final_text_response,
            "emotion": top_emotion,
            "emotion_percent": emotion_percent,
        })
        yield final_text_response

# 파이프라인 생성 함수

def create_voice_pipeline(
    api_key: str,
    character: str,
    emotion_analyzer: Callable[[str], Awaitable[Any]],
    history_ref: list
):
    runners = {"kei": kei_agent, "haru": haru_agent}
    voice_map = {"kei": "alloy", "haru": "nova"}
    selected_runner = runners.get(character, kei_agent)
    selected_voice = voice_map.get(character, "alloy")

    workflow = CustomHybridWorkflow(
        selected_runner=selected_runner,
        character_name=character,
        emotion_analyzer=emotion_analyzer,
        history_ref=history_ref
    )

    config = VoicePipelineConfig()
    config.stt_settings = config.stt_settings or {}
    config.tts_settings = config.tts_settings or {}
    config.stt_settings.model = "whisper-1"
    config.tts_settings.model = "tts-1-hd"
    config.tts_settings.voice = selected_voice
    config.model_provider = OpenAIVoiceModelProvider(api_key=api_key)

    pipeline = VoicePipeline(
        workflow=workflow,
        stt_model="whisper-1",
        tts_model="tts-1-hd",
        config=config,
    )
    return pipeline