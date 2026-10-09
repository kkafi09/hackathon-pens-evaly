"""Deploy immutable images through authenticated Coolify webhooks."""
import argparse
import os
import time
import httpx


def main(trigger_only=False):
    base = os.environ['COOLIFY_URL'].rstrip('/') + '/api/v1'
    tag = 'sha-' + os.environ['GITHUB_SHA']
    with httpx.Client(headers={'Authorization': 'Bearer ' + os.environ['COOLIFY_API_TOKEN']}, timeout=30) as client:
        current = client.get(base + '/applications/' + os.environ['COOLIFY_BACKEND_UUID'])
        current.raise_for_status()
        backend_running = current.json().get('status', '').startswith('running')
        # Never replace a backend while its in-process analysis is still running.
        deadline = time.monotonic() + 600
        while backend_running:
            health = httpx.get(os.environ['BACKEND_DOMAIN'].rstrip('/') + '/api/health/ready', timeout=10)
            if health.status_code in (404, 502, 503) or (health.is_success and health.json().get('active_runs', 0) == 0):
                break
            if time.monotonic() > deadline:
                raise RuntimeError('Backend belum aman untuk diganti; deployment dibatalkan.')
            time.sleep(10)
        for kind in ['BACKEND', 'FRONTEND']:
            uuid = os.environ[f'COOLIFY_{kind}_UUID']
            response = client.patch(base + '/applications/' + uuid, json={'docker_registry_image_tag': tag})
            response.raise_for_status()
        for kind in ['BACKEND', 'FRONTEND']:
            uuid = os.environ[f'COOLIFY_{kind}_UUID']
            if kind == 'BACKEND' and backend_running:
                # Stop first: startup recovery must never mark another instance's work failed.
                stopped = client.post(base + '/applications/' + uuid + '/stop')
                stopped.raise_for_status()
            response = client.get(base + '/deploy', params={'uuid': uuid, 'force': 'true'})
            response.raise_for_status()
            jobs = response.json().get('deployments', [])
            if not jobs:
                raise RuntimeError('Coolify tidak mengembalikan ID deployment.')
            deployment = jobs[0]['deployment_uuid']
            if trigger_only:
                print(f'{kind} Deployment triggered: {tag} ({deployment})')
                continue
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline:
                response = client.get(base + '/deployments/' + deployment)
                response.raise_for_status()
                status = response.json().get('status')
                if status == 'finished':
                    break
                if status in ['failed', 'cancelled', 'cancelled-by-user']:
                    raise RuntimeError(kind + ' deployment ' + status)
                time.sleep(10)
            else:
                raise RuntimeError(kind + ' deployment timeout.')
            domain = os.environ[f'{kind}_DOMAIN'].rstrip('/')
            path = '/api/health/live' if kind == 'BACKEND' else '/healthz'
            for attempt in range(30):
                try:
                    response = httpx.get(domain + path, timeout=10)
                    if response.is_success:
                        break
                except httpx.RequestError:
                    pass
                time.sleep(5)
            else:
                raise RuntimeError(kind + ' liveness belum berhasil.')
            print(kind + ' deployed: ' + tag)
        if trigger_only:
            return
        response = httpx.get(os.environ['BACKEND_DOMAIN'].rstrip('/') + '/api/health/ready', timeout=10)
        if response.status_code == 503:
            print('Container hidup; readiness belum siap. Jalankan migration/seeder manual melalui docker exec.')
        else:
            response.raise_for_status()
            print('Backend readiness: ready')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--trigger-only', action='store_true', help='Queue both deployments without waiting for completion or health checks.')
    main(trigger_only=parser.parse_args().trigger_only)
