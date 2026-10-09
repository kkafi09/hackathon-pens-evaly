"""MySQL schema and connection configuration; schema changes belong to Alembic."""
import os
from pathlib import Path
from functools import lru_cache

from dotenv import load_dotenv
from sqlalchemy import Column, ForeignKey, Index, Integer, JSON, MetaData, String, Table, create_engine, select, text
from sqlalchemy.pool import NullPool

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
REVISION = '0001_evaly_mysql'
metadata = MetaData()
datasets = Table('datasets', metadata,
    Column('hash', String(64), primary_key=True), Column('snapshot', String(10), nullable=False),
    Column('warnings', JSON, nullable=False), Column('counts', JSON, nullable=False))
records = Table('source_records', metadata,
    Column('dataset_hash', String(64), ForeignKey('datasets.hash'), primary_key=True),
    Column('table_name', String(64), primary_key=True), Column('row_index', Integer, primary_key=True),
    Column('payload', JSON, nullable=False))
active = Table('active_dataset', metadata,
    Column('id', Integer, primary_key=True), Column('dataset_hash', String(64), ForeignKey('datasets.hash'), nullable=False))
runs = Table('expansion_runs', metadata,
    Column('id', String(36), primary_key=True), Column('account_id', String(32), nullable=False),
    Column('created_at', String(40), nullable=False), Column('status', String(16), nullable=False),
    Column('payload', JSON, nullable=False), Index('ix_runs_account_created', 'account_id', 'created_at'))


def make_engine(url=None, health=False):
    url = url or os.environ.get('DATABASE_URL', '')
    if not url.startswith('mysql+pymysql://'):
        raise ValueError('DATABASE_URL harus menggunakan mysql+pymysql://.')
    options = {'poolclass': NullPool} if health else {'pool_pre_ping': True, 'pool_recycle': 1800, 'pool_size': 5, 'max_overflow': 5, 'pool_timeout': 3}
    return create_engine(url, **options, connect_args={'connect_timeout': 3 if health else 10, 'read_timeout': 3 if health else 30, 'write_timeout': 3 if health else 30}, hide_parameters=True)


@lru_cache
def engine(health=False):
    return make_engine(health=health)


def readiness():
    state = {'database': False, 'schema': False, 'dataset': False}
    try:
        with engine(True).connect() as connection:
            connection.execute(text('SELECT 1'))
            state['database'] = True
            state['schema'] = connection.execute(text('SELECT version_num FROM alembic_version')).scalar() == REVISION
            if state['schema']:
                state['dataset'] = connection.execute(select(active.c.dataset_hash).where(active.c.id == 1)).scalar() is not None
    except Exception:
        pass
    return state
