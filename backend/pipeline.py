"""Candidate paths built from IDs/records, never similarity or shared ownership."""
import re


def candidates(dataset, aid, context):
    found = []
    histories = dataset.tables['contact_employment_history']
    own_history = [r for r in histories if r['account_id'] == aid and r['mulai'] <= context['snapshot']]
    deals = [r for r in dataset.tables['crm_deals'] if r['status'] == 'Terbuka']
    for deal in deals:
        target = deal['account_id']
        if target == aid:
            found.append({'kind': 'direct', 'deal': deal, 'account': dataset.accounts[target],
                          'path': [aid, deal['deal_id']], 'records': [deal], 'label': 'Deal langsung akun'})
            continue
        other_history = [r for r in histories if r['account_id'] == target and r['mulai'] <= context['snapshot']]
        for left in own_history:
            for right in other_history:
                if left['contact_id'] != right['contact_id']:
                    continue
                found.append({'kind': 'contact', 'deal': deal, 'account': dataset.accounts[target],
                              'path': [aid, left['contact_id'], target, deal['deal_id']],
                              'records': [left, right, deal], 'label': 'Riwayat kontak lintas organisasi; bukan jaminan hubungan aktif'})
        for message in context['interactions']:
            if re.search(r'\b' + re.escape(target) + r'\b|\b' + re.escape(deal['deal_id']) + r'\b', message['isi']):
                found.append({'kind': 'interaction', 'deal': deal, 'account': dataset.accounts[target],
                              'path': [aid, message['interaction_id'], target, deal['deal_id']],
                              'records': [message, deal], 'label': 'Referensi ID eksplisit dalam interaksi; relevansi bisnis perlu dievaluasi'})
    return found
