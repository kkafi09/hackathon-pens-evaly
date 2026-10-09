"""Localized Markdown from a presentation copy; raw evidence and answers stay intact."""
import json
from .localization import score_label
from .pdf_reports import rupiah, time_label


def markdown(run, lang='en'):
    result = run['result']
    summary = result.get('validation_summary') or {}
    calc = result['calculation']
    score = result.get('expansion_score')
    lines = [f"# Account Expansion: {run['account_name']} ({run['account_id']})", '',
        summary.get('title', result['title']), '', summary.get('summary', ''), '',
        f"- Validation status: {summary.get('status', run['status'])}",
        f"- Conclusion rules: {summary.get('version', '-')}",
        f"- Signal type: {summary.get('signal_type', '-')}",
        f"- Evidence: {summary.get('supporting_record_count', 0)} supporting records; {summary.get('source_count', 0)} distinct sources; {summary.get('evaluated_record_count', 0)} evaluated records",
        f"- Estimate: {summary.get('estimate_label', '-')}",
        f"- Evaluation: {time_label(run['created_at'], lang)}", f"- Model: {run['model']}",
        f"- Rubric: {run['rubric_version']}", f"- Dataset hash: {run['dataset_hash']}",
        f"- Snapshot: {run['snapshot']}", f"- Different dataset version: {run['stale']}", '']
    lines += ['- ' + note for note in summary.get('limitations', [])]
    if score:
        lines += ['', '## Expansion support score', '', score_label(score, lang), '', score['note'], '',
            f"Rules: {score['version']} | Active group weight: {score['active_group_weight']}% | Valid answers: {score['evaluated_count']}/{score['applicable_count']}",
            f"Base score: {score['base_score']} | Evidence cap: {score['cap_score']} | Limiting parameters: {', '.join(score['limiting_parameter_ids']) or 'None'}", '',
            '### How the score is calculated', '',
            'Base score = weighted group average; final score = 100 × min(base score/100, OI-1, EP-1, EP-4).', '']
        for group in score['groups']:
            lines.append(f"- {group['label']}: policy weight {group['policy_weight']}%; effective weight {group['effective_weight']:.6f}; value {group['value']}; applicable: {group['applicable']}")
        lines += ['', '| Parameter | Raw contribution | Applicable / limits | Sources |', '| --- | --- | --- | --- |']
        for p in score['parameters']:
            lines.append(f"| {p['id']} | {p['raw_value']} | {p['applicable']}: {'; '.join(p['adjustments'])} | {'; '.join(p['source_ids'])} |")
    lines += ['', '## Results', '', f"- Additional outlets: {calc['additional_outlets']}",
        f"- Target outlets: {calc['target_outlets']}", f"- Annualized gross (IDR): {rupiah(calc['gross_annual'], lang)}",
        f"- Scenario net (IDR): {rupiah(calc['net_annual_scenario'], lang)}", f"- Formula: {calc['formula']}",
        f"- Action: {summary.get('action_label', result['action_label'])}",
        f"- Owner: {(result.get('owner') or {}).get('nama', 'Not assigned')}", '', '## Items to review', '']
    lines += ['- ' + reason['message'] for reason in run.get('review_reasons', [])] or ['No review triggers for this result.']
    lines += ['', '## Proposed after verification' if summary.get('status') == 'review' else '## Next steps', '']
    for step in run.get('next_steps', []):
        lines.append(f"- {step['action']} | Owner: {step['owner']} | Confirm: {'; '.join(step['confirmations'])} | Expected outcome: {step['expected_outcome']}")
    lines += ['', '## Assumptions and concerns', ''] + ['- ' + note for note in calc.get('assumptions', []) + result.get('concerns', [])]
    lines += ['', '## Rubric evaluation', '']
    for key, entry in (run.get('rubric') or {}).items():
        lines += [f"### {key}: {entry['text']}", '', f"- Type: {entry['type']}", f"- Status: {entry['status']}",
            f"- Result: {entry.get('label', 'Not assessed')}", f"- Note: {entry.get('note', '')}",
            f"- Evaluated data: {'; '.join(entry['source_ids'])}",
            '- Original answer: ' + json.dumps(entry['answer'], ensure_ascii=False),
            '- Code checks: ' + json.dumps(entry['checks'], ensure_ascii=False), '']
    lines += ['', '## Evidence — original text', '']
    for record in result.get('source_evidence', []):
        lines.append(f"- {record['interaction_id']} | {record['tanggal']} | interactions.jsonl | {record['isi']}")
    lines += ['', '## Saved provenance', '', 'Gateway: ' + (run.get('gateway') or 'typesafe'), '']
    for label, records in [('Supporting evidence', result.get('provenance', [])), ('Evaluated data', result.get('evaluated_provenance', []))]:
        lines += ['### ' + label, '']
        lines += [f"- {item['id']} | {item['source']} | {item['role']} | {json.dumps(item['record'], ensure_ascii=False)}" for item in records]
    lines += ['', 'Confidence describes assessment certainty, not the probability of winning a deal.', '']
    return '\n'.join(lines)
