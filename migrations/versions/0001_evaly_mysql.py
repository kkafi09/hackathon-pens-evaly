"""Initial Evaly source snapshot and analysis schema."""
from alembic import op
from backend.database import metadata

revision = '0001_evaly_mysql'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    metadata.create_all(op.get_bind())

def downgrade():
    metadata.drop_all(op.get_bind())
