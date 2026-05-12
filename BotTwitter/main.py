import logging
import time

from InevitavelGPT.bot import buscar_e_responder

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)

INTERVAL_SECONDS = 300

if __name__ == '__main__':
    logging.info('Bot iniciado — intervalo %ds', INTERVAL_SECONDS)
    while True:
        try:
            buscar_e_responder()
        except Exception as exc:
            logging.error('Erro não tratado: %s', exc)
        time.sleep(INTERVAL_SECONDS)
