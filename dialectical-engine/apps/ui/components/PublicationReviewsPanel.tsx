"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ContractHttpError, type PublicDebate } from "@debateai/contract";
import { createStaffApiClient, type StaffApiClient } from "../lib/staffApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import publicEnglish from "../messages/en/public.json";
import composeEnglish from "../messages/en/compose.json";
import composeRomanian from "../messages/ro/compose.json";
import { PublicDebateOverview } from "./PublicDebateOverview.js";
import "./StaffAccessPanel.css";

type Queue = Awaited<ReturnType<StaffApiClient["publicationReviews"]>>;
type Snapshot = Awaited<ReturnType<StaffApiClient["publicationReview"]>>;

function reviewError(failure: unknown): string {
  if (!(failure instanceof ContractHttpError)) return "staff.failed";
  if (failure.status === 404) return "staff.reviews.error.notFound";
  if (failure.status === 403 && failure.serverCode === "PUBLICATION_REVIEW_OWN_DEBATE") return "staff.reviews.error.ownDebate";
  if (failure.status === 403 && failure.serverCode === "PUBLICATION_REVIEW_SAME_REVIEWER") return "staff.reviews.error.sameReviewer";
  if (failure.status === 409 && failure.serverCode === "PUBLICATION_REVIEW_DECIDED") return "staff.reviews.error.decided";
  if (failure.status === 503 && failure.serverCode === "STAFF_ALERT_UNAVAILABLE") return "staff.reviews.error.locked";
  if (failure.status === 401 || failure.status === 403) return "staff.reviews.notElevated";
  if (failure.status === 503) return "staff.unavailable";
  return "staff.failed";
}

export function PublicationReviewsPanel({ client, catalog = staffEnglish, publicCatalog = publicEnglish, locale = "en" }: {
  client?: StaffApiClient;
  catalog?: MessageCatalog;
  publicCatalog?: MessageCatalog;
  locale?: LocaleCode;
}) {
  const api = useMemo(() => client ?? createStaffApiClient(), [client]);
  const router = useRouter();
  const generation = useRef(0);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notElevated, setNotElevated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reasonVisible, setReasonVisible] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const epoch = ++generation.current;
    void api.publicationReviews().then(value => {
      if (generation.current === epoch) setQueue(value);
    }, failure => {
      if (generation.current !== epoch) return;
      const key = reviewError(failure);
      if (key === "staff.reviews.notElevated") setNotElevated(true);
      else setStatus(key);
    });
    return () => { generation.current++; };
  }, [api]);

  async function open(ref: string) {
    if (busy) return;
    const epoch = generation.current;
    setBusy(true);
    setStatus(null);
    setSnapshot(null);
    setReasonVisible(false);
    setReason("");
    try {
      const value = await api.publicationReview(ref);
      if (generation.current === epoch) setSnapshot(value);
    } catch (failure) {
      if (generation.current === epoch) {
        const key = reviewError(failure);
        if (key === "staff.reviews.notElevated") setNotElevated(true);
        setStatus(key);
      }
    } finally {
      if (generation.current === epoch) setBusy(false);
    }
  }

  function leave() {
    setSnapshot(null);
    setReasonVisible(false);
    setReason("");
    setStatus(null);
    router.replace("/admin/reviews");
  }

  async function decide(outcome: "APPROVE" | "REFUSE") {
    if (snapshot === null || busy) return;
    const trimmed = reason.trim();
    if (outcome === "REFUSE" && (trimmed.length < 1 || trimmed.length > 500)) return;
    const epoch = generation.current;
    const ref = snapshot.review_ref;
    const operation_id = crypto.randomUUID();
    setBusy(true);
    setStatus(null);
    try {
      const intent = outcome === "APPROVE"
        ? { action: "PUBLICATION_REVIEW_APPROVE" as const, review_ref: ref, operation_id }
        : { action: "PUBLICATION_REVIEW_REFUSE" as const, review_ref: ref, reason: trimmed, operation_id };
      const proof = await api.proveAction(intent);
      if (generation.current !== epoch) return;
      if (outcome === "APPROVE") {
        await api.approvePublicationReview(ref, { proof_handle: proof.proof_handle, operation_id });
      } else {
        await api.refusePublicationReview(ref, { proof_handle: proof.proof_handle, operation_id, reason: trimmed });
      }
      if (generation.current !== epoch) return;
      setSnapshot(null);
      setReasonVisible(false);
      setReason("");
      setQueue(current => current === null ? current : { ...current, items: current.items.filter(item => item.review_ref !== ref) });
      setStatus(outcome === "APPROVE" ? "staff.reviews.approved" : "staff.reviews.refused");
      router.replace("/admin/reviews");
    } catch (failure) {
      if (generation.current !== epoch) return;
      setSnapshot(null);
      setReasonVisible(false);
      setReason("");
      const key = reviewError(failure);
      if (key === "staff.reviews.notElevated") setNotElevated(true);
      setStatus(key);
    } finally {
      if (generation.current === epoch) setBusy(false);
    }
  }

  const categories = (values: readonly string[]) => <ul className="staffPermissions">{values.map(category =>
    <li key={category}>{t(catalog, `staff.reviews.category.${category}`)}</li>)}</ul>;
  const entries = queue?.items.slice().sort((a, b) => a.asked_at.localeCompare(b.asked_at)) ?? [];

  return <div className="setInner staffAccess" aria-busy={busy || queue === null && !notElevated}>
    <header className="staffHeading"><h1 className="setTitle">{t(catalog, "staff.reviews.heading")}</h1></header>
    {notElevated ? <section className="setCard"><p className="setCardHint">{t(catalog, "staff.reviews.notElevated")}</p><a className="setBtn setBtnQuiet" href="/admin/team">{t(catalog, "staff.teamLink")}</a></section> : null}
    {status !== null && !notElevated ? <p className="setCardHint" role="status">{t(catalog, status)}</p> : null}
    {!notElevated && snapshot !== null ? <section className="setCard">
      <div className="staffSectionHead"><h2 className="staffSectionTitle">{snapshot.question}</h2></div>
      <p className="setCardHint">{t(catalog, "staff.reviews.askedAt", { date: formatDate(locale, snapshot.asked_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>
      {categories(snapshot.categories)}
      <PublicDebateOverview debate={snapshot as unknown as PublicDebate} catalog={publicCatalog} storyCatalog={publicCatalog} storyLocale={locale} composeCatalog={locale === "ro" ? composeRomanian : composeEnglish} viewingNote="NONE" onDetails={() => {}} onRead={() => {}} />
      <div className="staffActions">
        <button className="setBtn setBtnQuiet" type="button" disabled={busy} onClick={leave}>{t(catalog, "staff.reviews.back")}</button>
        <button className="setBtn" type="button" disabled={busy} onClick={() => { void decide("APPROVE"); }}>{t(catalog, "staff.reviews.approve")}</button>
        {!reasonVisible ? <button className="setBtn" type="button" disabled={busy} onClick={() => setReasonVisible(true)}>{t(catalog, "staff.reviews.refuse")}</button> : null}
      </div>
      {reasonVisible ? <div className="staffField">
        <label htmlFor="publication-review-reason">{t(catalog, "staff.reviews.reasonLabel")}</label>
        <textarea id="publication-review-reason" maxLength={500} value={reason} onChange={event => setReason(event.currentTarget.value)} />
        <p className="setCardHint">{t(catalog, "staff.reviews.reasonCount", { count: reason.length })}</p>
        <button className="setBtn" type="button" disabled={busy || reason.trim().length < 1 || reason.trim().length > 500} onClick={() => { void decide("REFUSE"); }}>{t(catalog, "staff.reviews.refuse")}</button>
      </div> : null}
    </section> : null}
    {!notElevated && snapshot === null && queue !== null ? <section className="setCard">
      {entries.length === 0 ? <p className="setCardHint">{t(catalog, "staff.reviews.empty")}</p> : <ul className="staffAuditList">{entries.map(item => <li key={item.review_ref}>
        <time dateTime={item.asked_at}>{t(catalog, "staff.reviews.askedAt", { date: formatDate(locale, item.asked_at, { dateStyle: "medium", timeStyle: "short" }) })}</time>
        {item.ask_ordinal === 2 ? <strong>{t(catalog, "staff.reviews.secondRequest")}</strong> : null}
        {categories(item.categories)}
        <button className="setBtn setBtnQuiet" type="button" disabled={busy} onClick={() => { void open(item.review_ref); }}>{t(catalog, "staff.reviews.open")}</button>
      </li>)}</ul>}
    </section> : null}
  </div>;
}
