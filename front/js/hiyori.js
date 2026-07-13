// Hiyori character page — thin entry script.
// All behavior lives in the shared modules (live2dController.js, chatUI.js,
// realtimeClient.js, characterApp.js); this file only supplies Hiyori's config.
initCharacterApp({
    characterType: 'hiyori',
    modelPath: '/model/hiyori/hiyori_pro_t11.model3.json',
    modelYRatio: 0.4,
    idleMotionName: 'Idle',
    profileImg: '/img/momose_profile.PNG',
    greeting: {
        ko: '안녕! 나는 히요리야 😊 지금의 감정 상태가 어떤지 이야기해줘~',
        en: "Hi! I'm Hiyori 😊 Tell me how you're feeling right now~",
    },
});
