# Supabase tools run without permission prompts (owner, 22 Nov 2026)

Decision: the owner gives sessions full access to all Supabase tools, so they
stop asking him for permission when he is away from the computer.

Condition he set: only after the nightly backup had a green run. Met:
database-backup.yml runs on 22 Nov 2026 12:50 and 12:51 UTC both succeeded (PR #138).

His standing rule is unchanged: deleting or changing members' data still
needs his explicit yes, prompt or no prompt (CLAUDE.md).
