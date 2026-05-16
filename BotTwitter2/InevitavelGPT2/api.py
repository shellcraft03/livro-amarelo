import os

import requests


BOT_API_URL = os.environ['BOT_API_URL']
BOT_API_SECRET = os.environ['BOT_API_SECRET']


def answer(question, qtype):
    response = requests.post(
        BOT_API_URL,
        json={'question': question, 'type': qtype},
        headers={'Content-Type': 'application/json', 'X-Bot-Secret': BOT_API_SECRET},
        timeout=90,
    )
    response.raise_for_status()
    return response.json().get('answer', '')


def generate_image(question, response_text, qtype):
    url = BOT_API_URL.rsplit('/bot/answer', 1)[0] + '/bot/image'
    response = requests.post(
        url,
        json={'question': question, 'answer': response_text, 'type': qtype},
        headers={'Content-Type': 'application/json', 'X-Bot-Secret': BOT_API_SECRET},
        timeout=90,
    )
    response.raise_for_status()
    return response.content
