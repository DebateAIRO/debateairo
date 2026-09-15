export const PROVIDER_FAILURE_SELECT = `SELECT provider_ref,
       count(*)::text AS total,
       count(*) FILTER (WHERE parse_status<>'PARSED')::text AS failed
FROM obs.provider_call_v
GROUP BY provider_ref
ORDER BY provider_ref`;
