"""Manual, atomic and repeatable source import. Never imports analysis history."""
import argparse
import csv
import json
from sqlalchemy import select, text
from .data import Dataset, SOURCE, SNAPSHOT
from .database import engine, datasets, records, active


def seed(source=SOURCE, db=None):
    source_data = Dataset(source)
    if source_data.warnings:
        raise ValueError('Validasi dataset gagal: ' + '; '.join(source_data.warnings))
    tables = {}
    for file in sorted(source_data.source.iterdir()):
        if file.suffix == '.csv':
            with file.open(encoding='utf-8-sig', newline='') as stream:
                tables[file.stem] = list(csv.DictReader(stream))
        elif file.suffix == '.jsonl':
            tables[file.stem] = [json.loads(line) for line in file.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    counts = {name: len(rows) for name, rows in tables.items()}
    with (db or engine()).connect() as connection:
        if connection.execute(text("SELECT GET_LOCK('evaly_seed', 0)")).scalar() != 1:
            raise ValueError('Seeder lain masih berjalan.')
        connection.commit()
        try:
            with connection.begin():
                exists = connection.execute(select(datasets.c.hash).where(datasets.c.hash == source_data.hash)).scalar()
                if not exists:
                    connection.execute(datasets.insert().values(hash=source_data.hash, snapshot=SNAPSHOT, warnings=source_data.warnings, counts=counts))
                    for name, rows in tables.items():
                        for offset in range(0, len(rows), 500):
                            connection.execute(records.insert(), [{'dataset_hash': source_data.hash, 'table_name': name, 'row_index': i, 'payload': row} for i, row in enumerate(rows[offset:offset+500], offset)])
                connection.execute(active.delete().where(active.c.id == 1))
                connection.execute(active.insert().values(id=1, dataset_hash=source_data.hash))
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('evaly_seed')"))
            connection.commit()
    return {'hash': source_data.hash, 'counts': counts, 'warnings': source_data.warnings, 'imported': not bool(exists)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=str(SOURCE))
    args = parser.parse_args()
    try:
        print(json.dumps(seed(args.source), ensure_ascii=False, indent=2))
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else 'Impor gagal. Periksa migration, koneksi MySQL, dan file sumber.'
        parser.exit(1, message + '\n')

if __name__ == '__main__':
    main()
