"""Read-only deployment API access diagnostics; never prints resource payloads or tokens."""
import json
import os
import urllib.error
import urllib.request


def main():
    token = os.environ['COOLIFY_API_TOKEN'].strip()
    base = os.environ['COOLIFY_URL'].rstrip('/') + '/api/v1'
    paths = ['/version', '/teams/current'] + ['/applications/' + os.environ['COOLIFY_' + kind + '_UUID'] for kind in ['BACKEND', 'FRONTEND']]
    failed = False
    for path in paths:
        request = urllib.request.Request(base + path, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                print(f'GET {path}: HTTP {response.status}')
        except urllib.error.HTTPError as error:
            failed = True
            body = error.read().decode('utf-8', errors='replace')
            try:
                message = json.loads(body).get('message', 'No message returned.')
            except (ValueError, AttributeError):
                message = 'Non-JSON response; check reverse proxy or API access controls.'
            message = str(message).replace(token, '[REDACTED]').replace('\n', ' ')[:500]
            print(f'GET {path}: HTTP {error.code} — {message}')
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
