import subprocess, os, sys

db_url = "postgresql://chemo_user:chemo_secure_password@localhost:5432/chemo_app"
env = os.environ.copy()
env['PGPASSWORD'] = 'chemo_secure_password'

# Use ASCII-only output
r = subprocess.run(
    ['psql', db_url, '-c',
     "SELECT id, treatment_date, status FROM scheduled_treatments ORDER BY treatment_date DESC, id LIMIT 10;",
     '-A', '-t'],
    env=env, capture_output=True, timeout=10
)
print("STDOUT bytes:", r.stdout[:500])
print("Decoded:", r.stdout.decode('utf-8', errors='replace'))
print("RC:", r.returncode)
