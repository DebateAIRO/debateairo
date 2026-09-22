const SHA256=/^[0-9a-f]{64}$/u;
const COMMIT=/^[0-9a-f]{40}$/u;
const REGISTER_VERSION=/^[1-9][0-9]*$/u;
const EXACT_SNAPSHOT_KEYS=Object.freeze([
  "schemaVersion","measuredAtUtc","finalCommit","kbVersion","supportRegisterVersion",
  "supportSchemaVersion","supportSnapshotSha256","fullSnapshotSha256",
  "supportEnabled","supportModelRef","limits","observed"
]);
const EXACT_LIMIT_KEYS=Object.freeze([
  "support_limit_anon_msgs_10m","support_limit_anon_msgs_24h",
  "support_limit_anon_sessions_1h","support_limit_session_msgs",
  "support_limit_msg_chars","support_relay_concurrency","support_queue_depth",
  "support_daily_call_cap","support_lock_after_injections","support_ip_cooldown_minutes"
]);
const EXACT_OBSERVED_KEYS=Object.freeze([
  "maxAnonSessionEvents1hByIp","maxAnonMessageEvents10mByIp",
  "maxAnonMessageEvents24hByIp","anyIpCooldownActive","callsToday",
  "liveRelayWaiters","relayState"
]);

export const GUIDE_CAPACITY_MAX_AGE_MS=120_000;
export const GUIDE_EXPECTED_SUPPORT_MODEL_REF="development:hermes-glm-5.3-flash";
export const GUIDE_CONTINUATION20_CAPACITY=Object.freeze({
  captureMessages:20,captureSessions:3,modelCallCeiling:17,
  reservedOwnerMessages:6,reservedOwnerSessions:2,deferredOwnerSessions:2,
  requiredMessageHeadroom24h:26,requiredSessionHeadroom1h:3,requiredDailyCallHeadroom:23
});

// Read-only and identifier-free. The caller supplies measuredAtUtc as $1 and
// the measured support_ip_cooldown_minutes as $2. No grouped identity leaves SQL.
export const GUIDE_COUNTS_ONLY_SQL=`
WITH bounds AS (
  SELECT $1::timestamptz AS measured_at,$2::integer AS cooldown_minutes
),
session_counts AS (
  SELECT ip_sha256,count(*)::bigint AS value
  FROM support.admission_event,bounds
  WHERE scope_kind='SESSION'
    AND at >= bounds.measured_at-interval '1 hour' AND at <= bounds.measured_at
  GROUP BY ip_sha256
),
message_10m_counts AS (
  SELECT ip_sha256,count(*)::bigint AS value
  FROM support.admission_event,bounds
  WHERE scope_kind='MESSAGE' AND identity_owner_ref IS NULL
    AND at >= bounds.measured_at-interval '10 minutes' AND at <= bounds.measured_at
  GROUP BY ip_sha256
),
message_24h_counts AS (
  SELECT ip_sha256,count(*)::bigint AS value
  FROM support.admission_event,bounds
  WHERE scope_kind='MESSAGE' AND identity_owner_ref IS NULL
    AND at >= bounds.measured_at-interval '24 hours' AND at <= bounds.measured_at
  GROUP BY ip_sha256
),
locks AS (
  SELECT ip_sha256,count(*)::bigint AS value,max(at) AS latest
  FROM support.abuse_event,bounds
  WHERE class='LOCK'
    AND at >= bounds.measured_at-interval '24 hours' AND at <= bounds.measured_at
  GROUP BY ip_sha256
),
latest_waiter AS (
  SELECT DISTINCT ON (waiter_id) waiter_id,state,lease_until
  FROM support.relay_waiter_event
  ORDER BY waiter_id,event_sequence DESC
)
SELECT
  COALESCE((SELECT max(value) FROM session_counts),0)::text AS max_anon_session_events_1h_by_ip,
  COALESCE((SELECT max(value) FROM message_10m_counts),0)::text AS max_anon_message_events_10m_by_ip,
  COALESCE((SELECT max(value) FROM message_24h_counts),0)::text AS max_anon_message_events_24h_by_ip,
  EXISTS(SELECT 1 FROM locks,bounds WHERE locks.value >= 2
    AND locks.latest > bounds.measured_at-make_interval(mins => bounds.cooldown_minutes))
    AS any_ip_cooldown_active,
  (SELECT count(*)::text FROM latest_waiter,bounds
    WHERE state='WAITING' AND lease_until >= bounds.measured_at) AS live_relay_waiters
`;

function exactKeys(value,keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function numberFrom(value,code) {
  const number=typeof value === "string" && /^[0-9]+$/u.test(value) ? Number(value) : value;
  if (!safeInteger(number)) throw new Error(code);
  return number;
}

export function projectGuideRuntimeCapacity({ status,counts,finalCommit,measuredAtUtc }) {
  const snapshot=status?.configuration?.snapshot;
  const values=snapshot?.values;
  if (status?.configuration?.kind !== "AVAILABLE" || !COMMIT.test(finalCommit)
    || typeof measuredAtUtc !== "string" || !Number.isFinite(Date.parse(measuredAtUtc))
    || !SHA256.test(status?.kb_version) || !REGISTER_VERSION.test(snapshot?.supportRegisterVersion)
    || snapshot?.schemaVersion !== 1 || !SHA256.test(snapshot?.supportSnapshotSha256)
    || !SHA256.test(snapshot?.fullSnapshotSha256) || typeof values !== "object"
    || counts === null || typeof counts !== "object" || Array.isArray(counts)) {
    throw new Error("GUIDE_HARNESS_CAPACITY_SOURCE_INVALID");
  }
  const limits=Object.freeze({
    support_limit_anon_msgs_10m:numberFrom(values.supportLimitAnonMessages10m,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_limit_anon_msgs_24h:numberFrom(values.supportLimitAnonMessages24h,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_limit_anon_sessions_1h:numberFrom(values.supportLimitAnonSessions1h,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_limit_session_msgs:numberFrom(values.supportLimitSessionMessages,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_limit_msg_chars:numberFrom(values.supportLimitMessageCharacters,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_relay_concurrency:numberFrom(values.supportRelayConcurrency,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_queue_depth:numberFrom(values.supportQueueDepth,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_daily_call_cap:numberFrom(values.supportDailyCallCap,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_lock_after_injections:numberFrom(values.supportLockAfterInjections,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    support_ip_cooldown_minutes:numberFrom(values.supportIpCooldownMinutes,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID")
  });
  const observed=Object.freeze({
    maxAnonSessionEvents1hByIp:numberFrom(counts.max_anon_session_events_1h_by_ip,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    maxAnonMessageEvents10mByIp:numberFrom(counts.max_anon_message_events_10m_by_ip,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    maxAnonMessageEvents24hByIp:numberFrom(counts.max_anon_message_events_24h_by_ip,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    anyIpCooldownActive:counts.any_ip_cooldown_active,
    callsToday:numberFrom(status.calls_today,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    liveRelayWaiters:numberFrom(counts.live_relay_waiters,"GUIDE_HARNESS_CAPACITY_SOURCE_INVALID"),
    relayState:status.relay_state
  });
  if (typeof observed.anyIpCooldownActive !== "boolean" || typeof observed.relayState !== "string") {
    throw new Error("GUIDE_HARNESS_CAPACITY_SOURCE_INVALID");
  }
  return Object.freeze({
    schemaVersion:1,measuredAtUtc,finalCommit,kbVersion:status.kb_version,
    supportRegisterVersion:snapshot.supportRegisterVersion,
    supportSchemaVersion:snapshot.schemaVersion,
    supportSnapshotSha256:snapshot.supportSnapshotSha256,
    fullSnapshotSha256:snapshot.fullSnapshotSha256,
    supportEnabled:values.supportEnabled,supportModelRef:values.supportModelRef,
    limits,observed
  });
}

export async function readGuideRuntimeCapacity({
  readSupportedStatus,readCountsOnly,finalCommit,clock=() => new Date()
}) {
  const measuredAt=clock();
  if (!(measuredAt instanceof Date) || !Number.isFinite(measuredAt.getTime())) {
    throw new Error("GUIDE_HARNESS_CAPACITY_CLOCK_INVALID");
  }
  const status=await readSupportedStatus();
  const cooldown=status?.configuration?.snapshot?.values?.supportIpCooldownMinutes;
  if (!safeInteger(cooldown)) throw new Error("GUIDE_HARNESS_CAPACITY_SOURCE_INVALID");
  const counts=await readCountsOnly(GUIDE_COUNTS_ONLY_SQL,[measuredAt,cooldown]);
  return projectGuideRuntimeCapacity({
    status,counts,finalCommit,measuredAtUtc:measuredAt.toISOString()
  });
}

export function validateGuideRuntimeCapacity(value,expected) {
  if (!exactKeys(value,EXACT_SNAPSHOT_KEYS) || value.schemaVersion !== 1
    || !exactKeys(value.limits,EXACT_LIMIT_KEYS) || !exactKeys(value.observed,EXACT_OBSERVED_KEYS)
    || !COMMIT.test(value.finalCommit) || !SHA256.test(value.kbVersion)
    || !REGISTER_VERSION.test(value.supportRegisterVersion)
    || value.supportSchemaVersion !== 1 || !SHA256.test(value.supportSnapshotSha256)
    || !SHA256.test(value.fullSnapshotSha256)
    || typeof value.supportEnabled !== "boolean" || typeof value.supportModelRef !== "string"
    || !Object.values(value.limits).every(safeInteger)
    || !Object.entries(value.observed).every(([key,item]) =>
      key === "anyIpCooldownActive" ? typeof item === "boolean"
      : key === "relayState" ? typeof item === "string" : safeInteger(item))) {
    throw new Error("GUIDE_HARNESS_CAPACITY_INVALID");
  }
  const measuredAt=Date.parse(value.measuredAtUtc);
  const nowMs=expected.nowMs ?? Date.now();
  if (typeof value.measuredAtUtc !== "string" || !Number.isFinite(measuredAt) || !Number.isFinite(nowMs)
    || measuredAt > nowMs+5_000 || nowMs-measuredAt > GUIDE_CAPACITY_MAX_AGE_MS
    || value.finalCommit !== expected.finalCommit || value.kbVersion !== expected.kbVersion
    || value.supportEnabled !== true || value.supportModelRef !== GUIDE_EXPECTED_SUPPORT_MODEL_REF) {
    throw new Error("GUIDE_HARNESS_CAPACITY_BINDING_INVALID");
  }
  const limits=value.limits;
  const observed=value.observed;
  if (!Number.isSafeInteger(expected.modelRows) || expected.modelRows < 0 || expected.modelRows > 42
    || limits.support_limit_anon_sessions_1h-observed.maxAnonSessionEvents1hByIp
      < GUIDE_CONTINUATION20_CAPACITY.requiredSessionHeadroom1h
    || observed.maxAnonMessageEvents10mByIp !== 0
    || limits.support_limit_anon_msgs_24h-observed.maxAnonMessageEvents24hByIp
      < GUIDE_CONTINUATION20_CAPACITY.requiredMessageHeadroom24h
    || limits.support_limit_session_msgs < 14 || limits.support_limit_msg_chars < 84
    || limits.support_relay_concurrency < 1 || limits.support_queue_depth < 1
    || limits.support_daily_call_cap-observed.callsToday
      < Math.max(expected.modelRows+GUIDE_CONTINUATION20_CAPACITY.reservedOwnerMessages,
        GUIDE_CONTINUATION20_CAPACITY.requiredDailyCallHeadroom)
    || limits.support_lock_after_injections < 2
    || observed.anyIpCooldownActive !== false || observed.liveRelayWaiters !== 0
    || observed.relayState !== "AVAILABLE") {
    throw new Error("GUIDE_HARNESS_CAPACITY_INSUFFICIENT");
  }
  return Object.freeze(value);
}
