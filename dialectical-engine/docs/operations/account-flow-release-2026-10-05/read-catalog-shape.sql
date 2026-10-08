WITH target AS (
 SELECT c.oid,n.nspname||'.'||c.relname AS relation
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='identity' AND c.relname IN (
 'user','session','step_up_grant','login_challenge','channel_binding','verification_token_credential',
 'verification_delivery_reservation','recovery_email_request','consumer_passkey_subject','consumer_passkey_credential',
 'consumer_passkey_challenge','consumer_totp_enrollment','consumer_security_notice','consumer_security_challenge',
 'consumer_recovery_gate','consumer_recovery_token','consumer_recovery_reservation','consumer_recovery_enrollment',
 'social_identity','social_flow','social_enrollment','password_recovery_control','password_recovery_staged_code',
 'password_recovery_retry_lock','password_recovery_source_window','password_recovery_notice','password_recovery_feed')
)
SELECT jsonb_object_agg(relation,jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=target.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) ORDER BY c.conname),'[]'::jsonb) FROM pg_constraint c WHERE c.conrelid=target.oid),
 'indexes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(i.oid),'valid',x.indisvalid) ORDER BY i.relname),'[]'::jsonb) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=target.oid)
) ORDER BY relation) AS catalog FROM target;
