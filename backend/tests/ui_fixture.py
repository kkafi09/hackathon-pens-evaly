"""Build controlled browser fixtures without writing any production history."""
import json
from pathlib import Path
from .test_rubric import run_analysis
from backend.data import Dataset

if __name__ == '__main__':
    data = Dataset()
    _, run = run_analysis(data)
    target = Path('runtime/e2e-v2.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(run, ensure_ascii=False), encoding='utf-8')
