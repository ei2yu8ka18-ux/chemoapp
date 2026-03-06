import subprocess
import os

db_url = "postgresql://chemo_user:chemo_secure_password@localhost:5432/chemo_app"
env = os.environ.copy()
env['PGPASSWORD'] = 'chemo_secure_password'
env['PGCLIENTENCODING'] = 'UTF8'

def run_query(q):
    r = subprocess.run(
        ['psql', db_url, '-c', q, '-t'],
        env=env, capture_output=True, timeout=10
    )
    try:
        return r.stdout.decode('utf-8').strip()
    except:
        try:
            return r.stdout.decode('cp932').strip()
        except:
            return str(r.stdout)

print("=== scheduled_treatments count by date (top 5) ===")
print(run_query("SELECT treatment_date::text, COUNT(*) FROM scheduled_treatments GROUP BY treatment_date ORDER BY treatment_date DESC LIMIT 5"))

print("\n=== pre_consult_departments ===")
print(run_query("SELECT department_name::text, is_enabled::text FROM pre_consult_departments ORDER BY sort_order"))

print("\n=== daily_snapshots ===")
print(run_query("SELECT COUNT(*)::text FROM daily_snapshots"))

print("\n=== Server port 3001 status ===")
r2 = subprocess.run(['netstat', '-ano'], capture_output=True, timeout=5)
lines = r2.stdout.decode('cp932', errors='replace').split('\n')
for line in lines:
    if '3001' in line:
        print(line)
