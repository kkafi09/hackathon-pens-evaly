from alembic import context
from backend.database import make_engine, metadata

with make_engine().connect() as connection:
    context.configure(connection=connection, target_metadata=metadata)
    with context.begin_transaction():
        context.run_migrations()
