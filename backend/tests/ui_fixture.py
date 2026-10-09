"""Build controlled browser fixtures without writing any production history."""
import json
from pathlib import Path
from .test_rubric import run_analysis
from backend.data import Dataset
from backend.explanations import explain_run
from .test_validation import UncertainOutlet, single_source

if __name__ == '__main__':
    data = Dataset()
    _, run = run_analysis(data)
    target = Path('runtime/e2e-v2.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(run, ensure_ascii=False), encoding='utf-8')
    _, reviewed = run_analysis(data, 'C06', UncertainOutlet())
    single = explain_run(single_source(data))
    target.with_name('e2e-validation.json').write_text(json.dumps({'reviewed': reviewed, 'single': single}, ensure_ascii=False), encoding='utf-8')
