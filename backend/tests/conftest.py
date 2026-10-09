import os
import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from backend.database import make_engine, runs


@pytest.fixture
def db_engine():
    url = os.environ.get('TEST_DATABASE_URL', '')
    if not url or not (make_url(url).database or '').endswith('_test'):
        pytest.fail('TEST_DATABASE_URL harus menunjuk database khusus dengan akhiran _test.')
    db = make_engine(url)
    with db.begin() as connection:
        connection.execute(runs.delete())
    yield db
    with db.begin() as connection:
        connection.execute(runs.delete())
    db.dispose()
