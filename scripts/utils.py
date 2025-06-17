import re

def remove_empty_parentheses(text):
    return re.sub(r'\(\s*\)', '', text)

def prettify_message(text):
    text = remove_empty_parentheses(text)
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