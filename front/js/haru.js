// Haru character page — thin entry script.
// All behavior lives in the shared modules (live2dController.js, chatUI.js,
// realtimeClient.js, characterApp.js); this file only supplies Haru's config.
initCharacterApp({
    characterType: 'haru',
    modelPath: '/model/haru/haru_greeter_t05.model3.json',
    modelYRatio: 0.45,
    idleMotionName: 'idle',
    profileImg: '/img/haru_profile.PNG',
    greeting: {
        ko: '안녕하세요, 저는 하루입니다. 지금의 감정 상태가 어떠신지 이야기해주세요.',
        en: "Hello, I'm Haru. Tell me how you're feeling right now.",
    },
});
