-- Nexo Assist / read-only permissions audit
-- This intentionally does NOT enable RLS or change permissions. The application
-- accesses a private schema through the PostgreSQL server-side connection.
SELECT n.nspname AS schema_name,
       has_schema_privilege('anon',n.oid,'USAGE') AS anon_schema_usage,
       has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_schema_usage
FROM pg_namespace n WHERE n.nspname='nexo';

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
       has_table_privilege('anon',c.oid,'UPDATE') AS anon_update,
       has_table_privilege('anon',c.oid,'DELETE') AS anon_delete,
       has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
       has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='nexo' AND c.relkind IN ('r','p')
ORDER BY c.relname;
