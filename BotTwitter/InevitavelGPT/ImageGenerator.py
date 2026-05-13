import os
import requests

def generate_answer_image(question, answer, qtype):
    base = os.environ['BOT_API_URL'].rsplit('/bot/answer', 1)[0]
    url = f'{base}/bot/image'
    resp = requests.post(
        url,
        json={'question': question, 'answer': answer, 'type': qtype},
        headers={'Content-Type': 'application/json', 'X-Bot-Secret': os.environ['BOT_API_SECRET']},
        timeout=90,
    )
    resp.raise_for_status()
    return resp.content
