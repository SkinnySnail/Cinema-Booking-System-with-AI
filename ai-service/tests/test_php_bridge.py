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


def test_general_chat_clears_old_movie_but_followup_keeps_it():
    result = php_run("""
        class BaseController {}
        require 'backend/controllers/AIController.php';
        $r=new ReflectionClass('AIController'); $c=$r->newInstanceWithoutConstructor();
        $resolve=$r->getMethod('resolveChatMovie');
        $context=['movie_id'=>1];
        echo json_encode([
            $resolve->invoke($c,['movie_id'=>null,'reset_movie_context'=>true],$context),
            $resolve->invoke($c,['movie_id'=>null,'reset_movie_context'=>false],$context),
            $resolve->invoke($c,['movie_id'=>5,'reset_movie_context'=>true],$context)
        ]);
    """)
    assert result == [0, 1, 5]


def test_couple_suggestions_use_available_genres_without_inventing_suitability():
    result = php_run("""
        class BaseController {}
        require 'backend/controllers/AIController.php';
        $r=new ReflectionClass('AIController'); $c=$r->newInstanceWithoutConstructor();
        $select=$r->getMethod('coupleShowtimes');
        $action=['movie_id'=>5,'genre_ids'=>'1,6'];
        $romance=['movie_id'=>1,'genre_ids'=>'3,7'];
        echo json_encode([
            'preferred'=>$select->invoke($c,[$action,$romance],[3,2],false),
            'alternative'=>$select->invoke($c,[$action],[3,2],false),
            'explicit'=>$select->invoke($c,[$action],[3,2],true),
            'empty'=>$select->invoke($c,[],[3,2],false)
        ]);
    """)
    assert [row["movie_id"] for row in result["preferred"]["shows"]] == [1]
    assert [row["movie_id"] for row in result["alternative"]["shows"]] == [5]
    assert "chưa có suất" in result["alternative"]["reply"]
    assert "thể loại bạn yêu cầu" in result["explicit"]["reply"]
    assert result["empty"]["shows"] == [] and "Chưa có suất" in result["empty"]["reply"]


def test_schedule_policy_enforces_boundaries_clips_ranges_and_resets_expired_context():
    result = php_run("""
        require 'backend/service/ChatSchedulePolicy.php';
        $explicit=fn($from,$to)=>['date_explicit'=>true,'date_from'=>$from,'date_to'=>$to];
        echo json_encode([
            'default'=>ChatSchedulePolicy::resolve([],[],'2026-11-10'),
            'last'=>ChatSchedulePolicy::resolve($explicit('2026-11-16','2026-11-16'),[],'2026-11-10'),
            'outside'=>ChatSchedulePolicy::resolve($explicit('2026-11-17','2026-11-17'),[],'2026-11-10'),
            'past'=>ChatSchedulePolicy::resolve($explicit('2026-11-09','2026-11-09'),[],'2026-11-10'),
            'partial'=>ChatSchedulePolicy::resolve($explicit('2026-11-12','2026-11-20'),[],'2026-11-10'),
            'invalid'=>ChatSchedulePolicy::resolve($explicit('2026-02-31','2026-03-01'),[],'2026-11-10'),
            'reversed'=>ChatSchedulePolicy::resolve($explicit('2026-11-14','2026-11-12'),[],'2026-11-10'),
            'context'=>ChatSchedulePolicy::resolve([],['date'=>'2026-11-12','date_to'=>'2099-01-01'],'2026-11-10'),
            'expired'=>ChatSchedulePolicy::resolve([],['date'=>'2026-11-09'],'2026-11-10'),
            'year'=>ChatSchedulePolicy::resolve([],[],'2026-12-30'),
            'short'=>ChatSchedulePolicy::resolve([],[],'2026-11-10',3)
        ]);
    """)
    assert (result["default"]["from"], result["default"]["to"]) == ("2026-11-10", "2026-11-16")
    assert result["last"]["to"] == "2026-11-16" and not result["last"]["clipped"]
    assert all("error" in result[key] for key in ("outside", "past", "invalid", "reversed"))
    assert result["partial"]["from"] == "2026-11-12" and result["partial"]["to"] == "2026-11-16" and result["partial"]["clipped"]
    assert result["context"]["to"] == "2026-11-16" and result["context"]["clipped"]
    assert result["expired"]["from"] == "2026-11-10"
    assert result["year"]["to"] == "2027-01-05" and result["short"]["to"] == "2026-11-12"


def test_chat_settings_reject_invalid_values_and_never_allow_more_than_seven_days():
    result = php_run("""
        require 'backend/service/ChatSchedulePolicy.php';
        $errors=[];
        foreach ([0,8,1.5,true,[], 'seven'] as $bad) $errors[]=ChatSchedulePolicy::validationErrors(['ai_chat_schedule_days'=>$bad]);
        echo json_encode(['errors'=>$errors,
            'default'=>ChatSchedulePolicy::settings(['ai_chat_schedule_days'=>999,'ai_chat_showtimes_per_day'=>999]),
            'valid'=>ChatSchedulePolicy::settings(['ai_chat_schedule_days'=>'3','ai_chat_showtimes_per_day'=>12])]);
    """)
    assert all(error.get("ai_chat_schedule_days") for error in result["errors"])
    assert result["default"] == {"ai_chat_schedule_days": 7, "ai_chat_showtimes_per_day": 8}
    assert result["valid"] == {"ai_chat_schedule_days": 3, "ai_chat_showtimes_per_day": 12}


def test_weekly_schedule_reply_keeps_all_dates_and_marks_truncation():
    result = php_run("""
        require 'backend/service/ChatSchedulePolicy.php';
        $groups=[];
        for ($i=10;$i<=16;$i++) {
            $date='2026-11-'.$i;
            $groups[$date]=['shows'=>[['movie_id'=>5,'title'=>'Godzilla','cinema_name'=>'Cinema',
                'hall_name'=>'Room 1','start_time'=>$date.' 19:30:00']], 'has_more'=>$i===10];
        }
        echo json_encode(ChatSchedulePolicy::groupedReply($groups,'2026-11-10','2026-11-16','',8));
    """)
    assert all(f"{day}/11:" in result["reply"] for day in range(10, 17))
    assert result["reply"].count("19:30 (Room 1)") == 7
    assert "tối đa 8 suất mỗi ngày" in result["reply"]
    assert result["links"] == [{"label": "Godzilla", "url": "/movie/5"}]
