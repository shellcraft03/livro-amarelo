import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _b64url_decode(value):
    padding = '=' * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode())


def _load_key():
    raw = os.environ['OAUTH_TOKEN_ENCRYPTION_KEY'].strip()

    for decoder in (
        lambda text: base64.b64decode(text),
        lambda text: bytes.fromhex(text),
    ):
        try:
            key = decoder(raw)
        except Exception:
            continue
        if len(key) == 32:
            return key

    raise RuntimeError('OAUTH_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex')


def decrypt_secret(value):
    version, iv, tag, ciphertext = str(value or '').split(':', 3)
    if version != 'v1':
        raise ValueError('Invalid encrypted secret version')

    aesgcm = AESGCM(_load_key())
    return aesgcm.decrypt(
        _b64url_decode(iv),
        _b64url_decode(ciphertext) + _b64url_decode(tag),
        None,
    ).decode('utf-8')


def encrypt_secret(value):
    iv = os.urandom(12)
    aesgcm = AESGCM(_load_key())
    encrypted = aesgcm.encrypt(iv, str(value).encode('utf-8'), None)
    ciphertext = encrypted[:-16]
    tag = encrypted[-16:]
    return 'v1:{}:{}:{}'.format(
        base64.urlsafe_b64encode(iv).rstrip(b'=').decode(),
        base64.urlsafe_b64encode(tag).rstrip(b'=').decode(),
        base64.urlsafe_b64encode(ciphertext).rstrip(b'=').decode(),
    )
