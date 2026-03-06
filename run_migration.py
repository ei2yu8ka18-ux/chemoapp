import subprocess
import os
import sys

db_url = "postgresql://chemo_user:chemo_secure_password@localhost:5432/chemo_app"
sql_file = r"C:\Dev\chemo-app\migration_new_tables.sql"

env = os.environ.copy()
env['PGPASSWORD'] = 'chemo_secure_password'
env['PGCLIENTENCODING'] = 'UTF8'

# Run migration
result = subprocess.run(
    ['psql', db_url, '-f', sql_file, '-v', 'ON_ERROR_STOP=1'],
    env=env,
    capture_output=True,
    text=True,
    timeout=30
)
print('=== Migration STDOUT ===')
print(result.stdout)
print('=== Migration STDERR ===')
print(result.stderr)
print('Return code:', result.returncode)

# Verify tables
result2 = subprocess.run(
    ['psql', db_url, '-c',
     "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"],
    env=env,
    capture_output=True,
    text=True,
    timeout=15
)
print('\n=== Tables after migration ===')
print(result2.stdout)

# Check scheduled_treatments count
result3 = subprocess.run(
    ['psql', db_url, '-c',
     "SELECT COUNT(*) as count, treatment_date FROM scheduled_treatments GROUP BY treatment_date ORDER BY treatment_date DESC LIMIT 5;"],
    env=env,
    capture_output=True,
    text=True,
    timeout=15
)
print('\n=== scheduled_treatments per date ===')
print(result3.stdout)
print(result3.stderr)
