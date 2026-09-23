DO $support_language_constraints$
DECLARE
  language_constraint record;
BEGIN
  FOR language_constraint IN
    SELECT namespace.nspname AS schema_name,
      relation.relname AS table_name,
      constraint_row.conname AS constraint_name
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid=constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid=relation.oid
      AND attribute.attname='language'
      AND NOT attribute.attisdropped
    WHERE namespace.nspname='support'
      AND relation.relname IN ('session','message','case')
      AND constraint_row.contype='c'
      AND constraint_row.conkey=ARRAY[attribute.attnum]::smallint[]
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      language_constraint.schema_name,
      language_constraint.table_name,
      language_constraint.constraint_name
    );
  END LOOP;
END
$support_language_constraints$;

ALTER TABLE support.session
  ADD CONSTRAINT support_session_language_check CHECK (language IN (
    'bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt',
    'mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi',
    'ar','he','tr'
  ));

ALTER TABLE support.message
  ADD CONSTRAINT support_message_language_check CHECK (language IN (
    'bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt',
    'mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi',
    'ar','he','tr'
  ));

ALTER TABLE support."case"
  ADD CONSTRAINT support_case_language_check CHECK (language IN (
    'bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt',
    'mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi',
    'ar','he','tr'
  ));

COMMENT ON COLUMN support.session.language IS
  'Interface locale selected when the support session was created.';
COMMENT ON COLUMN support.message.language IS
  'Answer locale copied from the owning support session.';
COMMENT ON COLUMN support."case".language IS
  'Interface locale copied from the support session that opened the case.';
