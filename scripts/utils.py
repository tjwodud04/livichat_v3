# scripts/utils.py
"""Text post-processing helpers for AI replies (emoji/whitespace/link cleanup)."""
import re


def remove_empty_parentheses(text: str) -> str:
    """Remove empty parentheses such as ``()`` or ``(  )`` from ``text``."""
    return re.sub(r"\(\s*\)", "", text)


def remove_emojis(text: str) -> str:
    """Strip emoji and assorted pictographic symbols from ``text``."""
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "☀-⛿"          # miscellaneous symbols
        "✀-➿"          # dingbats
        "]+",
        flags=re.UNICODE,
    )
    return emoji_pattern.sub("", text)


def prettify_message(text: str) -> str:
    """Normalize an AI reply: drop emojis/empty parens, collapse spaces, tidy links."""
    text = remove_empty_parentheses(text)
    text = remove_emojis(text)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"링크:\s*", "\n링크: ", text)
    return text.strip()


def markdown_to_html_links(text: str) -> str:
    """Convert markdown links ``[label](url)`` to ``<a>`` tags opening a new tab."""
    return re.sub(
        r"\[([^\]]+)\]\((https?://[^\)]+)\)",
        r'<a href="\2" target="_blank">\1</a>',
        text,
    )


def extract_first_markdown_url(text: str):
    """Return the URL of the first markdown link in ``text``, or ``None``."""
    match = re.search(r"\[([^\]]+)\]\((https?://[^\)]+)\)", text)
    if match:
        return match.group(2)
    return None
