"""Assertions on `docker compose config --format json` (RF-OPS-06, RNF-SEC-04): run with the JSON on stdin."""
import json
import sys

cfg = json.load(sys.stdin)
services = cfg["services"]
failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))
    if not ok:
        failures.append(name)


check("only api and web", set(services) == {"api", "web"}, str(set(services)))
api, web = services["api"], services["web"]
for name, svc in (("api", api), ("web", web)):
    check(f"{name}: no container_name", "container_name" not in svc)
    check(f"{name}: read_only", svc.get("read_only") is True)
    check(f"{name}: cap_drop ALL", svc.get("cap_drop") == ["ALL"], str(svc.get("cap_drop")))
    check(f"{name}: no-new-privileges", "no-new-privileges:true" in svc.get("security_opt", []), str(svc.get("security_opt")))
    check(f"{name}: healthcheck", "healthcheck" in svc and svc["healthcheck"].get("test"))
    check(f"{name}: no expose", "expose" not in svc)
check("api publishes nothing", not api.get("ports"), str(api.get("ports")))
ports = web.get("ports", [])
check("web publishes exactly one port", len(ports) == 1, str(ports))
if ports:
    check("web target 8080", ports[0].get("target") == 8080, str(ports[0]))
    check("web published port", ports[0].get("published") == sys.argv[1] if len(sys.argv) > 1 else True, str(ports[0]))
tmpfs = {entry.split(":")[0]: entry for entry in web.get("tmpfs", [])}
check("web tmpfs /tmp size=64m", tmpfs.get("/tmp", "").endswith("size=64m"), str(web.get("tmpfs")))
check("web tmpfs /etc/nginx/conf.d", "/etc/nginx/conf.d" in tmpfs, str(web.get("tmpfs")))
env = api.get("environment", {})
check("api CALC_SHUTDOWN_DRAIN=2s", env.get("CALC_SHUTDOWN_DRAIN") == "2s", str(env))
check("api CALC_SHUTDOWN_TIMEOUT=15s", env.get("CALC_SHUTDOWN_TIMEOUT") == "15s", str(env))
check("api stop_grace_period >= 20s", api.get("stop_grace_period") in ("25s", "30s", "20s", "1m0s", "35s", "40s"), str(api.get("stop_grace_period")))
dep = web.get("depends_on", {}).get("api", {})
check("web depends_on api service_healthy", dep.get("condition") == "service_healthy", str(dep))
check("web depends_on api restart true", dep.get("restart") is True, str(dep))
check("web environment API_UPSTREAM", web.get("environment", {}).get("API_UPSTREAM") == "api:8081", str(web.get("environment")))
check("no admin 9091 anywhere in published ports", all(p.get("target") != 9091 for s in services.values() for p in s.get("ports", [])))
sys.exit(1 if failures else 0)
