import re

def remove_empty_parentheses(text):
    return re.sub(r'\(\s*\)', '', text)

def remove_emojis(text):
    """
    이모지(Unicode 이모티콘) 및 일부 특수 아이콘을 모두 제거합니다.
    """
    emoji_pattern = re.compile(
        "["               
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\u2600-\u26FF"          # miscellaneous symbols
        "\u2700-\u27BF"          # dingbats
        "]+",
        flags=re.UNICODE
    )
    return emoji_pattern.sub("", text)

def prettify_message(text):
    text = remove_empty_parentheses(text)
    text = remove_emojis(text)
    text = re.sub(r'\s{2,}', ' ', text)
    text = re.sub(r'링크:\s*', '\n링크: ', text)
    return text.strip()

def markdown_to_html_links(text):
    return re.sub(r'\[([^\]]+)\]\((https?://[^\)]+)\)', r'<a href="\2" target="_blank">\1</a>', text)

def extract_first_markdown_url(text):
    match = re.search(r'\[([^\]]+)\]\((https?://[^\)]+)\)', text)
    if match:
        return match.group(2)
    return None 