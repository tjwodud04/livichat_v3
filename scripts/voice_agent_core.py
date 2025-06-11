import re
import asyncio
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict
from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent
from agents.voice import VoiceWorkflowBase
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
        user_text = transcript
        emotion_percent, top_emotion = await self.emotion_analyzer(user_text)

        negative_emotions = {'분노', '슬픔', '미움', '두려움'}
        final_text_response = ""

        if top_emotion in negative_emotions:
            # 감정 기반 콘텐츠 검색 트랙
            search_run = await Runner.run(ContentFinderAgent, f"{top_emotion} 감정을 느낄 때 듣기 좋은 노래나 위로가 되는 영상")
            search_text = search_run.final_output
            emotion_map = {
                '분노': '노(화남)', '슬픔': '애(슬픔)',
                '미움': '오(싫어함)', '두려움': '구(두려움)',
            }
            category = emotion_map.get(top_emotion, "기타")
            # 추천 멘트 생성
            tones = {
                'kei': {'suggest': f"그런 {category} 감정을 느끼실 땐, 잠시 다른 곳에 집중해보는 건 어때요? 이런 정보는 어떨까요?",
                        'empathize': f"그런 {category} 감정을 느끼셨군요. 제가 그 마음을 다 헤아릴 순 없겠지만, 함께 방법을 찾아봐요."},
                'haru': {'suggest': f"그런 {category} 감정에는 환기가 필요합니다. 다음 정보를 참고해보시는 걸 추천합니다.",
                         'empathize': f"그런 {category} 감정을 느끼셨군요. 문제 해결에 도움이 될 만한 것을 찾아보는 게 좋겠습니다."}
            }
            selected_tone = tones.get(self.character_name, tones['kei'])
            speech_text = selected_tone['empathize'] if category in ['애(슬픔)', '구(두려움)'] else selected_tone['suggest']
            # URL 추출
            urls = re.findall(r'https?://[^\s\n)]+', search_text)
            display = f"{speech_text}\n\n" + ("".join(f"* 추천 콘텐츠 {i+1}: {u}\n" for i,u in enumerate(urls[:3])) or "추천 콘텐츠를 찾지 못했어요.")
            final_text_response = display
            yield speech_text
        else:
            # 일반 채팅 스트리밍 트랙
            messages = self.history.copy() + [{"role": "user", "content": user_text}]
            streaming_run = await Runner.run_streamed(self.selected_runner, messages)
            ai_speech = ""
            async for event in streaming_run.stream_events():
                if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                    delta = event.data.delta or ""
                    yield delta
                    ai_speech += delta
            final_text_response = ai_speech

        # 결과 저장 및 반환
        self.set_result({
            "user_text": user_text,
            "ai_text": final_text_response,
            "emotion": top_emotion,
            "emotion_percent": emotion_percent,
        })
        yield final_text_response