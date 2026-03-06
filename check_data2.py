import subprocess
import os

db_url = "postgresql://chemo_user:chemo_secure_password@localhost:5432/chemo_app"
env = os.environ.copy()
env['PGPASSWORD'] = 'chemo_secure_password'
env['PGCLIENTENCODING'] = 'UTF8'

def run_query(label, q):
    r = subprocess.run(
        ['psql', db_url, '-c', q, '-t', '-A'],
        env=env, capture_output=True, timeout=10
    )
    out = r.stdout.decode('utf-8', errors='replace').strip()
    err = r.stderr.decode('utf-8', errors='replace').strip()
    print(f"\n=== {label} ===")
    if out:
        print(out)
    if err:
        print(f"ERR: {err}")

run_query("Total scheduled_treatments", "SELECT COUNT(*) FROM scheduled_treatments")
run_query("Total patients", "SELECT COUNT(*) FROM patients")
run_query("Total users", "SELECT COUNT(*) FROM users")
run_query("Dates in scheduled_treatments", "SELECT DISTINCT treatment_date::text FROM scheduled_treatments ORDER BY 1 DESC LIMIT 10")
run_query("drug_route column exists", "SELECT column_name FROM information_schema.columns WHERE table_name='interventions' AND column_name='drug_route'")
