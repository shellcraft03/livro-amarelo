import os

import psycopg2
import psycopg2.extras


def connect():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def dict_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
