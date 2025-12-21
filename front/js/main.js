document.addEventListener('DOMContentLoaded', () => {
    // 현재 언어 감지 (영어 페이지인지 한국어 페이지인지)
    const isKorean = window.location.pathname.includes('index-ko.html') ||
                     document.documentElement.lang === 'ko';

    // 언어별 텍스트
    const texts = {
        en: {
            apiKeyChange: 'Change API Key',
            modalTitle: 'OpenAI API Key Setup',
            modalDesc: 'Please enter your OpenAI API key to start the conversation.',
            modalTitleRequired: 'OpenAI API Key Required',
            modalDescRequired: 'Please enter your OpenAI API key to use the service.',
            invalidKey: 'Please enter a valid OpenAI API key.',
            needApiKey: 'Please set up your OpenAI API key before starting a conversation.'
        },
        ko: {
            apiKeyChange: 'API 키 변경',
            modalTitle: 'OpenAI API 키 설정',
            modalDesc: '대화를 시작하기 위해 OpenAI API 키를 입력해주세요.',
            modalTitleRequired: 'OpenAI API Key가 필요합니다.',
            modalDescRequired: '서비스 이용을 위해 OpenAI API Key를 입력해주세요.',
            invalidKey: '올바른 OpenAI API 키를 입력해주세요.',
            needApiKey: '대화를 시작하기 전에 OpenAI API 키를 설정해주세요.'
        }
    };

    const t = isKorean ? texts.ko : texts.en;

    // 카드에 호버 효과 추가
    const cards = document.querySelectorAll('.card');

    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-10px)';
            card.style.transition = 'transform 0.3s ease';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });
    });

    // 페이지 로드 시 페이드인 효과
    document.querySelector('.main-container').style.opacity = '0';
    setTimeout(() => {
        document.querySelector('.main-container').style.opacity = '1';
        document.querySelector('.main-container').style.transition = 'opacity 0.5s ease';
    }, 100);

    const modal = document.getElementById('apiKeyModal');
    const setApiKeyBtn = document.getElementById('setApiKeyBtn');
    const closeModal = document.getElementById('closeModal');
    const saveApiKey = document.getElementById('saveApiKey');
    const apiKeyInput = document.getElementById('apiKeyInput');

    // 저장된 API 키가 있는지 확인
    function getSavedApiKey() {
        return localStorage.getItem('openai_api_key');
    }
    function setSavedApiKey(key) {
        localStorage.setItem('openai_api_key', key);
    }
    let savedApiKey = getSavedApiKey();
    if (savedApiKey) {
        setApiKeyBtn.textContent = t.apiKeyChange;
    }

    // 페이지 진입 시 API 키 없으면 모달 자동 오픈
    if (!savedApiKey) {
        modal.style.display = 'block';
        modal.querySelector('h2').textContent = t.modalTitleRequired;
        modal.querySelector('p').textContent = t.modalDescRequired;
    } else {
        modal.querySelector('h2').textContent = t.modalTitle;
        modal.querySelector('p').textContent = t.modalDesc;
    }

    // 모달 열기
    setApiKeyBtn.addEventListener('click', function() {
        modal.style.display = 'block';
        savedApiKey = getSavedApiKey();
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
        } else {
            apiKeyInput.value = '';
        }
        modal.querySelector('h2').textContent = t.modalTitle;
        modal.querySelector('p').textContent = t.modalDesc;
    });

    // 모달 닫기
    closeModal.addEventListener('click', function() {
        modal.style.display = 'none';
    });

    // API 키 저장
    saveApiKey.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey && apiKey.startsWith('sk-')) {
            setSavedApiKey(apiKey);
            setApiKeyBtn.textContent = t.apiKeyChange;
            modal.style.display = 'none';
        } else {
            alert(t.invalidKey);
        }
    });

    // 모달 외부 클릭 시 닫기
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // 캐릭터 선택 시 API 키 확인
    const characterLinks = document.querySelectorAll('.card:not(.disabled)');
    characterLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            if (!getSavedApiKey()) {
                event.preventDefault();
                alert(t.needApiKey);
                modal.style.display = 'block';
            }
        });
    });
});
