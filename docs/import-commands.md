# From the repository root

python scripts/import_osu_sei_ssle_postgres.py `  --file .\data\raw\blue-sei-ssle-su22-su26\osu_sei_ssle_all.jsonl`
--schema .\db\schema.sql `  --dsn "postgresql://osu_app:CHANGE_THIS_PASSWORD@localhost:5432/osu_data"`
--init-schema `
--expected-rows 68729
