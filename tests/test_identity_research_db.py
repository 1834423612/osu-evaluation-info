import os
from pathlib import Path
import sys
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/rmp"))
from review_identity_research import withdraw_changed_tool_links
from sync_rmp_mappings import connect_database, load_dsn


@unittest.skipUnless(
    os.getenv("RMP_RESEARCH_DATABASE_TEST") == "1",
    "Explicit database test opt-in required",
)
class ResearchDecisionDatabaseTests(unittest.TestCase):
    def test_revises_only_contradicted_tool_decisions_and_preserves_human_overrides(
        self,
    ):
        conn = connect_database(load_dsn(None))
        schema = "rmp_research_test_" + uuid4().hex

        class Scoped:
            def execute(self, sql, params=()):
                return conn.execute(sql.replace("osu_rmp", schema), params)

        scoped = Scoped()
        try:
            conn.execute("CREATE SCHEMA " + schema)
            scoped.execute(
                """CREATE TABLE osu_rmp.professor_identity_map(
              professor_id bigint,name_dot_number text,state text,method text,score int,evidence jsonb,updated_at timestamptz default now());
              CREATE TABLE osu_rmp.mapping_decision_log(professor_id bigint,name_dot_number text,previous_state text,new_state text,reason text,decided_by text);
              CREATE TEMP TABLE identity_research_stage(professor_id bigint,state text,username text,evidence jsonb)"""
            )
            for pid in range(1, 6):
                scoped.execute(
                    "INSERT INTO osu_rmp.professor_identity_map VALUES(%s,'old.1','accepted','manual',100,%s::jsonb,now())",
                    (
                        pid,
                        (
                            "{}"
                            if pid == 2
                            else '{"reviewer":"source-assisted-research-v1"}'
                        ),
                    ),
                )
            conn.execute(
                "INSERT INTO identity_research_stage VALUES(1,'confirmed','new.2','{}'),(2,'confirmed','new.2','{}'),(3,'ambiguous',NULL,'{}'),(4,'confirmed','old.1','{}'),(5,'reserved',NULL,'{}')"
            )
            self.assertEqual(
                {pid for pid, _user in withdraw_changed_tool_links(scoped)}, {1, 3}
            )
            states = dict(
                scoped.execute(
                    "SELECT professor_id,state FROM osu_rmp.professor_identity_map"
                )
            )
            self.assertEqual(
                states,
                {1: "stale", 2: "accepted", 3: "stale", 4: "accepted", 5: "accepted"},
            )
            self.assertEqual(
                scoped.execute(
                    "SELECT count(*) FROM osu_rmp.mapping_decision_log"
                ).fetchone()[0],
                2,
            )
        finally:
            assert schema.startswith("rmp_research_test_")
            conn.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE")
            conn.close()


if __name__ == "__main__":
    unittest.main()
