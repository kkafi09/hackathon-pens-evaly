"""Select images affected by a GitHub event, without external dependencies."""
import json
import os
import subprocess
from pathlib import Path

SHARED = {'.dockerignore', '.gitattributes', '.github/workflows/release.yml', 'deploy/coolify.py', 'deploy/changes.py'}
FRONTEND = {'Dockerfile.frontend', 'package.json', 'bun.lock', 'index.html', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', '.oxlintrc.json', '.oxfmtrc.json', 'deploy/nginx.conf.template'}
BACKEND = {'Dockerfile.backend', 'requirements.txt', 'alembic.ini'}


def select_components(paths, manual=False):
    selected = set()
    for path in paths:
        if path in SHARED or path.startswith('locales/'):
            selected.update(['frontend', 'backend'])
        if path in FRONTEND or path.startswith(('src/', 'public/', 'e2e/')):
            selected.add('frontend')
        if path in BACKEND or path.startswith(('backend/', 'migrations/', 'data/')):
            selected.add('backend')
    return [kind for kind in ['frontend', 'backend'] if manual or kind in selected]


def main():
    name = os.environ['GITHUB_EVENT_NAME']
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
    paths = []
    if name != 'workflow_dispatch':
        base = event['pull_request']['base']['sha'] if name == 'pull_request' else event['before']
        command = ['git', 'diff', '--no-renames', '--name-only', '-z', base, 'HEAD'] if base.strip('0') else ['git', 'ls-files', '-z']
        paths = subprocess.check_output(command).decode('utf-8').strip('\0').split('\0')
    components = select_components(paths, manual=name == 'workflow_dispatch')
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        output.write('components=' + json.dumps(components) + '\n')
    print('Selected components: ' + (', '.join(components) or 'none (no application changes)'))


if __name__ == '__main__':
    main()
