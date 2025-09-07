# scripts/proactive.py
import time
import math
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

SuggestionType = Literal["music", "breathing", "timer", "memo", "info"]

@dataclass
class UserState:
    """세션/사용자별 프로액티브 상태 (메모리 DB 가정)"""
    last_suggest_ts: float = 0.0
    accepts: int = 0
    rejects: int = 0
    quiet_hours: List[int] = field(default_factory=lambda: list(range(0, 7)))  # 0~6시
    recent_reasons: List[str] = field(default_factory=list)  # 근거 설명 로그(최신 10개)
    pref_weights: Dict[SuggestionType, float] = field(default_factory=lambda: {
        "music": 1.0, "breathing": 1.0, "timer": 1.0, "memo": 1.0, "info": 1.0
    })

class BanditPersonalizer:
    """
    가장 단순한 컨텍스트 밴딧(가중치 가산/감산).
    - 수용: 해당 타입 가중치 += alpha
    - 거절: 해당 타입 가중치 -= beta (하한선 보장)
    """
    def __init__(self, alpha: float = 0.25, beta: float = 0.2, min_w: float = 0.2, max_w: float = 3.0):
        self.alpha = alpha
        self.beta = beta
        self.min_w = min_w
        self.max_w = max_w

    def update(self, state: UserState, s_type: SuggestionType, accepted: bool):
        w = state.pref_weights.get(s_type, 1.0)
        if accepted:
            w = min(self.max_w, w + self.alpha)
        else:
            w = max(self.min_w, w - self.beta)
        state.pref_weights[s_type] = w

    def best_types(self, state: UserState, topk: int = 2) -> List[SuggestionType]:
        # 가중치 상위 K개를 제안 후보로
        items = sorted(state.pref_weights.items(), key=lambda kv: kv[1], reverse=True)
        return [k for k, _ in items[:topk]]

class ProactivePolicy:
    """
    경량 프로액티브 정책:
    - 하드 가드: 쿨다운, 조용 시간, 최근 거절률
    - 소프트 스코어링: 감정/시간대/최근 대화 흐름 점수화
    - 개인화: bandit 가중치 반영
    """
    def __init__(
        self,
        cooldown_sec: int = 45 * 60,          # 45분 쿨다운
        reject_ratio_block: float = 0.6,      # 최근 거절률 60% 이상이면 차단
        base_threshold: float = 0.6           # 제안 스코어 임계치
    ):
        self.cooldown_sec = cooldown_sec
        self.reject_ratio_block = reject_ratio_block
        self.base_threshold = base_threshold
        self.bandit = BanditPersonalizer()
        self._store: Dict[str, UserState] = {}   # 세션/유저 키 -> 상태

    def state_of(self, sid: str) -> UserState:
        if sid not in self._store:
            self._store[sid] = UserState()
        return self._store[sid]

    @staticmethod
    def _hour_now() -> int:
        # 서버 시간 기반. 필요하면 KST 적용(Asia/Seoul)으로 교체.
        return time.localtime().tm_hour

    def _hard_guards(self, st: UserState) -> Optional[str]:
        now = time.time()
        if now - st.last_suggest_ts < self.cooldown_sec:
            return "cooldown"
        if self._hour_now() in st.quiet_hours:
            return "quiet_hours"
        total = st.accepts + st.rejects
        if total >= 5 and (st.rejects / total) >= self.reject_ratio_block:
            return "high_reject_ratio"
        return None

    def _soft_score(
        self,
        emotion: str,
        last_utter_silence_sec: float,
        topic: Optional[str],
        is_working_hour: bool
    ) -> float:
        """
        간단 스코어링:
        - 부정/스트레스 계열 감정: +0.3
        - 최근 침묵 길수록: +min(0.3, silence/300)
        - 업무시간 중 업무·집중 관련 주제: +0.1
        """
        score = 0.0
        emo = (emotion or "").lower()
        if any(k in emo for k in ["sad", "ang", "stres", "tired", "anx"]):
            score += 0.30
        score += min(0.30, max(0.0, last_utter_silence_sec) / 300.0)
        if is_working_hour and topic and any(k in topic.lower() for k in ["work", "task", "focus", "study"]):
            score += 0.10
        return score

    def should_suggest(
        self,
        sid: str,
        emotion: str,
        last_utter_silence_sec: float,
        topic: Optional[str]
    ) -> Dict[str, float]:
        """
        반환: {"ok": 0/1, "score": float, "guard": optional}
        """
        st = self.state_of(sid)
        guard = self._hard_guards(st)
        if guard:
            return {"ok": 0.0, "score": 0.0, "guard": guard}  # type: ignore

        hour = self._hour_now()
        is_working = 9 <= hour <= 19
        score = self._soft_score(emotion, last_utter_silence_sec, topic, is_working)

        ok = 1.0 if score >= self.base_threshold else 0.0
        return {"ok": ok, "score": score}

    def choose_suggestion_types(self, sid: str) -> List[SuggestionType]:
        st = self.state_of(sid)
        return self.bandit.best_types(st, topk=2)

    def stamp_suggested(self, sid: str, reason: str):
        st = self.state_of(sid)
        st.last_suggest_ts = time.time()
        st.recent_reasons.append(reason)
        if len(st.recent_reasons) > 10:
            st.recent_reasons.pop(0)

    def feedback(self, sid: str, s_type: SuggestionType, accepted: bool):
        st = self.state_of(sid)
        if accepted:
            st.accepts += 1
        else:
            st.rejects += 1
        self.bandit.update(st, s_type, accepted)
