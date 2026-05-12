import logging
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
    traceback.print_exc()
    sys.exit(1)

INTERVAL_SECONDS = 300

if __name__ == '__main__':
    logging.info('Bot iniciado — intervalo %ds', INTERVAL_SECONDS)
    sys.stdout.flush()

    while True:
        try:
            buscar_e_responder()
        except BaseException as exc:
            logging.error('Erro: %s', exc)
            traceback.print_exc()
            sys.stdout.flush()
        time.sleep(INTERVAL_SECONDS)
