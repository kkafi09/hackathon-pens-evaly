import httpx
import pytest
from deploy import coolify


@pytest.mark.parametrize('backend_failure', [False, True])
def test_initial_webhook_deployment(monkeypatch, backend_failure):
    environment = {'COOLIFY_URL': 'https://coolify.test', 'COOLIFY_API_TOKEN': 'controlled-secret',
        'COOLIFY_BACKEND_UUID': 'backend', 'COOLIFY_FRONTEND_UUID': 'frontend',
        'BACKEND_DOMAIN': 'https://backend.test', 'FRONTEND_DOMAIN': 'https://frontend.test', 'GITHUB_SHA': 'abc'}
    for key, value in environment.items():
        monkeypatch.setenv(key, value)
    calls = []
    original = httpx.Client
    def handler(request):
        calls.append(request)
        if request.url.host == 'coolify.test':
            assert request.headers['Authorization'] == 'Bearer controlled-secret'
            if request.url.path == '/api/v1/applications/backend' and request.method == 'GET':
                return httpx.Response(200, json={'status': 'exited:unhealthy'})
            if request.url.path == '/api/v1/deploy':
                assert request.method == 'POST'
                return httpx.Response(200, json={'deployments': [{'deployment_uuid': request.url.params['uuid']}]})
            if request.url.path.startswith('/api/v1/deployments/'):
                status = 'failed' if backend_failure and request.url.path.endswith('/backend') else 'finished'
                return httpx.Response(200, json={'status': status})
            return httpx.Response(200, json={})
        assert 'Authorization' not in request.headers
        return httpx.Response(503 if request.url.path.endswith('/ready') else 200, json={'status': 'not_ready'})
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=transport, **kwargs))
    def public_get(url, **kwargs):
        with original(transport=transport) as client:
            return client.get(url, **kwargs)
    monkeypatch.setattr(httpx, 'get', public_get)
    if backend_failure:
        with pytest.raises(RuntimeError, match='BACKEND deployment failed'):
            coolify.main()
        assert not any(call.url.path == '/api/v1/deploy' and call.url.params.get('uuid') == 'frontend' for call in calls)
    else:
        coolify.main()
        patches = [call for call in calls if call.method == 'PATCH']
        assert [call.url.path for call in patches] == ['/api/v1/applications/backend', '/api/v1/applications/frontend']
        assert all(b'sha-abc' in call.content for call in patches)
    assert not any(call.url.path.endswith('/stop') for call in calls)


@pytest.mark.parametrize('backend_running', [False, True])
@pytest.mark.parametrize('failure', [None, 'backend', 'frontend', 'empty-backend'])
def test_trigger_only_queues_both_without_polling(monkeypatch, capsys, backend_running, failure):
    environment = {'COOLIFY_URL': 'https://coolify.test', 'COOLIFY_API_TOKEN': 'controlled-secret',
        'COOLIFY_BACKEND_UUID': 'backend', 'COOLIFY_FRONTEND_UUID': 'frontend',
        'BACKEND_DOMAIN': 'https://backend.test', 'GITHUB_SHA': 'abc'}
    for key, value in environment.items():
        monkeypatch.setenv(key, value)
    calls = []
    public_calls = []
    sleeps = []
    original = httpx.Client
    def handler(request):
        assert request.headers['Authorization'] == 'Bearer controlled-secret'
        calls.append(request)
        if request.method == 'GET' and request.url.path == '/api/v1/applications/backend':
            return httpx.Response(200, json={'status': 'running:healthy' if backend_running else 'exited:unhealthy'})
        if request.method == 'PATCH':
            assert b'sha-abc' in request.content
            return httpx.Response(200, json={})
        if request.url.path.endswith('/stop'):
            assert backend_running
            return httpx.Response(200, json={})
        assert request.url.path == '/api/v1/deploy', 'Trigger mode must not poll deployments.'
        assert request.method == 'POST'
        kind = request.url.params['uuid']
        if failure == kind:
            return httpx.Response(500, json={})
        return httpx.Response(200, json={'deployments': [] if failure == 'empty-backend' and kind == 'backend' else [{'deployment_uuid': kind + '-job'}]})
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    def public_get(url, **kwargs):
        public_calls.append(url)
        assert url == 'https://backend.test/api/health/ready'
        # Keep the existing active-run guard, but never poll health after triggering.
        return httpx.Response(200, json={'active_runs': 1 if len(public_calls) == 1 else 0})
    monkeypatch.setattr(httpx, 'get', public_get)
    monkeypatch.setattr(coolify.time, 'sleep', lambda seconds: sleeps.append(seconds))
    if failure:
        with pytest.raises(RuntimeError if failure == 'empty-backend' else httpx.HTTPStatusError):
            coolify.main(trigger_only=True)
    else:
        coolify.main(trigger_only=True)
    patches = [call.url.path for call in calls if call.method == 'PATCH']
    assert patches == ['/api/v1/applications/backend', '/api/v1/applications/frontend']
    first_trigger = next(i for i, call in enumerate(calls) if call.url.path == '/api/v1/deploy')
    assert sum(call.method == 'PATCH' for call in calls[:first_trigger]) == 2
    triggers = [call.url.params['uuid'] for call in calls if call.url.path == '/api/v1/deploy']
    assert triggers == (['backend'] if failure in ['backend', 'empty-backend'] else ['backend', 'frontend'])
    assert len(public_calls) == (2 if backend_running else 0)
    assert sleeps == ([10] if backend_running else [])
    stops = [call for call in calls if call.url.path.endswith('/stop')]
    assert len(stops) == int(backend_running)
    if not failure:
        output = capsys.readouterr().out
        assert 'BACKEND Deployment triggered: sha-abc' in output
        assert 'FRONTEND Deployment triggered: sha-abc' in output
        assert ' deployed:' not in output


@pytest.mark.parametrize('components', [('frontend',), ('backend',)])
def test_single_component_does_not_touch_other_application(monkeypatch, components):
    for key, value in {'COOLIFY_URL': 'https://coolify.test', 'COOLIFY_API_TOKEN': 'controlled-secret', 'GITHUB_SHA': 'abc'}.items():
        monkeypatch.setenv(key, value)
    for kind in ['frontend', 'backend']:
        key = 'COOLIFY_' + kind.upper() + '_UUID'
        if kind in components:
            monkeypatch.setenv(key, kind)
        else:
            monkeypatch.delenv(key, raising=False)
    calls = []
    original = httpx.Client
    def handler(request):
        calls.append(request)
        if request.url.path == '/api/v1/deploy':
            assert request.method == 'POST'
            assert request.url.params['uuid'] == components[0]
            return httpx.Response(200, json={'deployments': [{'deployment_uuid': 'job'}]})
        assert request.url.path == '/api/v1/applications/' + components[0]
        return httpx.Response(200, json={'status': 'exited:unhealthy'})
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    def unexpected(*args, **kwargs):
        pytest.fail('An unrelated backend or public health endpoint was accessed.')
    monkeypatch.setattr(httpx, 'get', unexpected)
    coolify.main(trigger_only=True, components=components)
    assert len([call for call in calls if call.method == 'PATCH']) == 1
    assert len([call for call in calls if call.url.path == '/api/v1/deploy']) == 1


@pytest.mark.parametrize('paths,expected', [
    (['src/App.tsx'], ['frontend']),
    (['public/evaly-logo.svg', 'bun.lock'], ['frontend']),
    (['deploy/nginx.conf.template'], ['frontend']),
    (['backend/app.py', 'requirements.txt'], ['backend']),
    (['migrations/versions/new.py', 'data/dataset_kasirnusa/README.md'], ['backend']),
    (['src/App.tsx', 'backend/app.py'], ['frontend', 'backend']),
    (['.github/workflows/release.yml'], ['frontend', 'backend']),
    (['deploy/coolify.py', 'deploy/changes.py'], ['frontend', 'backend']),
    (['.dockerignore', '.gitattributes'], ['frontend', 'backend']),
    (['README.md', 'DEPLOYMENT.md', 'docs/DATA_GUIDE.md', 'AGENTS.md'], []),
    ([], []),
])
def test_changed_component_selection(paths, expected):
    from deploy.changes import select_components
    assert select_components(paths) == expected
    assert select_components(paths, manual=True) == ['frontend', 'backend']


@pytest.mark.parametrize('event_name', ['push', 'pull_request', 'workflow_dispatch'])
def test_changes_event_diff_and_output(monkeypatch, tmp_path, event_name):
    import json
    from deploy import changes
    event = tmp_path / 'event.json'
    event.write_text(json.dumps({'before': 'previous', 'pull_request': {'base': {'sha': 'pr-base'}}}), encoding='utf-8')
    output = tmp_path / 'output'
    for key, value in {'GITHUB_EVENT_NAME': event_name, 'GITHUB_EVENT_PATH': str(event), 'GITHUB_OUTPUT': str(output)}.items():
        monkeypatch.setenv(key, value)
    commands = []
    def diff(command):
        commands.append(command)
        return b'src/deleted.tsx\0backend/renamed.py\0'
    monkeypatch.setattr(changes.subprocess, 'check_output', diff)
    changes.main()
    assert json.loads(output.read_text().split('=', 1)[1]) == ['frontend', 'backend']
    if event_name == 'workflow_dispatch':
        assert commands == []
    else:
        assert commands == [['git', 'diff', '--no-renames', '--name-only', '-z', 'previous' if event_name == 'push' else 'pr-base', 'HEAD']]
