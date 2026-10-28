"""Optional PHP integration: set PHP_BIN; uses an isolated local AI process."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

ROOT = Path(__file__).resolve().parents[2]
PHP = os.getenv("PHP_BIN")
pytestmark = pytest.mark.skipif(not PHP, reason="PHP_BIN not configured")


def php_run(code, env=None):
    options = [PHP, "-n"]
    extension_dir = os.getenv("PHP_EXTENSION_DIR")
    if extension_dir:
        options += ["-d", f"extension_dir={extension_dir}", "-d", "extension=curl"]
    result = subprocess.run(options + ["-r", code], env=env, cwd=ROOT,
                            capture_output=True, text=True, encoding="utf-8", timeout=20)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def service():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, AI_SERVICE_KEY=secrets.token_hex(32), AI_ENABLED="true",
               AI_SERVICE_URL=f"http://127.0.0.1:{port}")
    child = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(port)],
                             cwd=ROOT / "ai-service", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen(env["AI_SERVICE_URL"] + "/health", timeout=.2) as response:
                    if json.load(response)["model_ready"]:
                        break
            except OSError:
                time.sleep(.1)
        else:
            pytest.fail("Isolated AI service failed to start")
        yield env
    finally:
        child.terminate()
        child.wait(timeout=10)


def bridge(path, payload, env):
    # Payload goes through an environment variable, never PHP source interpolation.
    script = "require 'backend/service/AIClient.php'; try { echo json_encode((new AIClient())->request(getenv('TEST_PATH'), json_decode(getenv('TEST_PAYLOAD'),true))); } catch(Throwable $e) { echo json_encode(['error'=>$e->getMessage()]); }"
    return php_run(script, dict(env, TEST_PATH=path, TEST_PAYLOAD=json.dumps(payload)))


def test_php_reaches_all_four_ai_endpoints(service):
    assert bridge("/recommendations", {"movies": [], "interactions": []}, service)["mode"] == "cold_start"
    assert bridge("/chat", {"message": "Lịch chiếu ngày mai", "today": "2026-10-27"}, service)["date"] == "2026-10-28"
    assert bridge("/sentiment", {"reviews": [{"id": 4, "text": "Phim rất hay"}]}, service)["items"][0]["id"] == 4
    assert bridge("/forecast", {"history": [], "candidates": []}, service)["mode"] == "smoothed_prior"


def test_php_bridge_rejects_wrong_missing_and_disabled_credentials(service):
    assert "error" in bridge("/sentiment", {"reviews": []}, dict(service, AI_SERVICE_KEY="wrong"))
    assert "error" in bridge("/sentiment", {"reviews": []}, dict(service, AI_SERVICE_KEY=""))
    assert "error" in bridge("/sentiment", {"reviews": []}, dict(service, AI_ENABLED="false"))


def test_guest_cannot_spoof_recommendation_identity():
    result = php_run("""
        class BaseController {}
        function getallheaders() { return []; }
        class AuthMiddleware { static function requirePermission($p) {} }
        require 'backend/controllers/AIController.php';
        $_REQUEST=['auth_user_id'=>999,'auth_user_role'=>'Admin','auth_user_role_id'=>5];
        $r=new ReflectionClass('AIController');
        $c=$r->newInstanceWithoutConstructor();
        echo json_encode($r->getMethod('viewer')->invoke($c));
    """)
    assert result == 0


def test_demand_ranking_never_selects_movie_that_exceeds_slot():
    result = php_run("""
        class BaseController {}
        class StubShowtimes {
            function calculateEndTime($start,$duration) { return date('Y-m-d H:i:s',strtotime($start)+($duration+15)*60); }
        }
        require 'backend/controllers/ShowtimeController.php';
        $r=new ReflectionClass('ShowtimeController'); $c=$r->newInstanceWithoutConstructor();
        $r->getProperty('showtimeModel')->setValue($c,new StubShowtimes());
        $movies=[['id'=>1,'duration'=>300],['id'=>2,'duration'=>60],['id'=>3,'duration'=>60]];
        $scores=[1=>[18=>[1=>1.0,2=>0.1,3=>0.9]]];
        $picked=$r->getMethod('pickMovieBalancedForSlot')->invoke($c,$movies,[],1,[],null,new DateTime('2026-10-27 18:00'),new DateTime('2026-10-27 20:00'),[],'',$scores);
        echo json_encode($picked['id']);
    """)
    assert result == 3
