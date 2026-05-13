import logging
import os
import sys
import time
import traceback

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    stream=sys.stdout,
    force=True,
)

try:
    from InevitavelGPT.bot import buscar_e_responder
except BaseException as exc:
    logging.critical('Falha ao importar bot: %s', exc)
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
    configured = os.environ.get('BOT_INTERVAL_SECONDS', '').strip()
    if configured:
        try:
            interval = int(configured)
            if interval > 0:
                return interval
        except ValueError:
            logging.warning('Ignoring invalid BOT_INTERVAL_SECONDS env var: %s', configured)

    return RAILWAY_INTERVAL_SECONDS if _is_railway() else LOCAL_INTERVAL_SECONDS


INTERVAL_SECONDS = _interval_seconds()

if __name__ == '__main__':
    logging.info('Bot iniciado — ambiente=%s intervalo=%ds', 'railway' if _is_railway() else 'local', INTERVAL_SECONDS)
    sys.stdout.flush()

    while True:
        try:
            buscar_e_responder()
        except BaseException as exc:
            logging.error('Erro: %s', exc)
            traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        time.sleep(INTERVAL_SECONDS)
