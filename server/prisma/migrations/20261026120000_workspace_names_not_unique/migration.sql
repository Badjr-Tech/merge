-- Workspace names were unique across all of Merge, so a nonprofit signing up with a common
-- name ("Community Foundation", "Arts Council") was told the name was taken by a stranger,
-- mid-signup, with no way to understand why. Workspaces are keyed by id; nothing needed the
-- name to be unique.
DROP INDEX IF EXISTS "Company_name_key";
