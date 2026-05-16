import logging
import os
import sys
import time
import traceback

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    stream=sys.stdout,
    force=True,
)

try:
    from InevitavelGPT2.worker import run_once
except BaseException as exc:
    logging.critical('Falha ao importar worker: %s', exc)
    traceback.print_exc(file=sys.stdout)
    sys.exit(1)

LOCAL_INTERVAL_SECONDS = 60
RAILWAY_INTERVAL_SECONDS = 300


def _is_railway():
    return any(
        os.environ.get(name)
        for name in (
            'RAILWAY_ENVIRONMENT',
            'RAILWAY_PROJECT_ID',
            'RAILWAY_SERVICE_ID',
            'RAILWAY_DEPLOYMENT_ID',
        )
    )


def _interval_seconds():
    configured = os.environ.get('IGPT2_WORKER_INTERVAL_SECONDS', '').strip()
    if configured:
        try:
            interval = int(configured)
            if interval > 0:
                return interval
        except ValueError:
            logging.warning('Ignoring invalid IGPT2_WORKER_INTERVAL_SECONDS env var: %s', configured)

    return RAILWAY_INTERVAL_SECONDS if _is_railway() else LOCAL_INTERVAL_SECONDS


INTERVAL_SECONDS = _interval_seconds()


if __name__ == '__main__':
    logging.info(
        'BotTwitter2 iniciado - ambiente=%s intervalo=%ds',
        'railway' if _is_railway() else 'local',
        INTERVAL_SECONDS,
    )
    sys.stdout.flush()

    while True:
        try:
            run_once()
        except BaseException as exc:
            logging.error('Erro: %s', exc)
            traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        time.sleep(INTERVAL_SECONDS)
