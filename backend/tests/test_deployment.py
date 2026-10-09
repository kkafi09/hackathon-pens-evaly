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
