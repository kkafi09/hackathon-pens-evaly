import shutil
from unittest.mock import patch
import pytest
from sqlalchemy import select, func, text, event
from fastapi.testclient import TestClient
from backend import database
from backend.database import active, records, datasets
from backend.seed import seed
from backend.data import Dataset, SOURCE
import backend.app as module


def test_mysql_seed_parity_and_repeat(db_engine):
    first = seed(db=db_engine)
    again = seed(db=db_engine)
    assert not again['imported']
    assert first['hash'] == again['hash'] == Dataset().hash
    with db_engine.connect() as connection:
        assert connection.execute(select(func.count()).select_from(records).where(records.c.dataset_hash == first['hash'])).scalar() == sum(first['counts'].values())
    with patch.object(module, 'engine', return_value=db_engine):
        loaded = module.dataset()
        assert loaded.hash == first['hash']
        assert loaded.graph()['counts']['customers'] == 40
        assert loaded.context('C06')['source_counts']['product_usage_daily'] == 10950
        assert len(loaded.context('C02')['tickets']) == 9


def test_health_lifecycle(db_engine):
    with patch.object(database, 'engine', return_value=db_engine):
        with db_engine.begin() as connection:
            previous = connection.execute(select(active.c.dataset_hash)).scalar()
            connection.execute(active.delete())
        try:
            with TestClient(module.app) as client:
                assert client.get('/api/health/live').status_code == 200
                response = client.get('/api/health/ready')
                assert response.status_code == 503
                assert response.json()['components'] == {'database': True, 'schema': True, 'dataset': False}
        finally:
            if previous:
                with db_engine.begin() as connection:
                    connection.execute(active.insert().values(id=1, dataset_hash=previous))
        assert database.readiness()['dataset']
        with patch.dict('os.environ', {'OPENROUTER_API_KEY': ''}):
            assert database.readiness() == {'database': True, 'schema': True, 'dataset': True}


def test_health_unavailable_and_schema_missing(db_engine):
    with patch.object(database, 'engine', side_effect=RuntimeError('secret connection details')):
        with TestClient(module.app) as client:
            assert client.get('/api/health/live').status_code == 200
            result = client.get('/api/health/ready')
            assert result.status_code == 503
            assert 'secret' not in result.text
    with db_engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num='not_current'"))
    try:
        with patch.object(database, 'engine', return_value=db_engine):
            assert database.readiness() == {'database': True, 'schema': False, 'dataset': False}
    finally:
        with db_engine.begin() as connection:
            connection.execute(text('UPDATE alembic_version SET version_num=:revision'), {'revision': database.REVISION})


def test_seed_failure_preserves_active(db_engine, tmp_path):
    with db_engine.connect() as connection:
        previous = connection.execute(select(active.c.dataset_hash)).scalar()
        previous_count = connection.execute(select(func.count()).select_from(datasets)).scalar()
    source = tmp_path / 'source'
    shutil.copytree(SOURCE, source)
    employees = source / 'employees.csv'
    employees.write_bytes(employees.read_bytes() + b'\n')
    inserts = []
    def fail_during_import(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith('INSERT INTO source_records'):
            inserts.append(statement)
            if len(inserts) == 2:
                raise RuntimeError('Controlled interrupted import')
    event.listen(db_engine, 'before_cursor_execute', fail_during_import)
    try:
        with pytest.raises(RuntimeError, match='Controlled interrupted'):
            seed(source, db=db_engine)
    finally:
        event.remove(db_engine, 'before_cursor_execute', fail_during_import)
    with db_engine.connect() as connection:
        assert connection.execute(select(active.c.dataset_hash)).scalar() == previous
        assert connection.execute(select(func.count()).select_from(datasets)).scalar() == previous_count


def test_seed_lock(db_engine):
    with db_engine.connect() as connection:
        assert connection.execute(text("SELECT GET_LOCK('evaly_seed', 0)")).scalar() == 1
        try:
            with pytest.raises(ValueError, match='Seeder lain'):
                seed(db=db_engine)
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('evaly_seed')"))
