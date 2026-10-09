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
        assert not any('/applications/frontend' in str(call.url) for call in calls)
    else:
        coolify.main()
        patches = [call for call in calls if call.method == 'PATCH']
        assert [call.url.path for call in patches] == ['/api/v1/applications/backend', '/api/v1/applications/frontend']
        assert all(b'sha-abc' in call.content for call in patches)
    assert not any(call.url.path.endswith('/stop') for call in calls)
