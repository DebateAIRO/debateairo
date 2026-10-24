"use client";
import type { JSX, RefObject } from 'react';
import { ITALY_APPROVAL_CLAUSES } from '@debateai/kernel';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import type { LegalDocument } from '@/lib/legalDocument';
import { InlineFieldMessage } from './InlineFieldMessage';

/** The clauses the box approves, in order, each titled by its own Terms heading in the document the form shows. */
export function italyClauseItems(document: LegalDocument): ReadonlyArray<Readonly<{ number: number; title: string }>> {
    return ITALY_APPROVAL_CLAUSES.map(number => ({
        number,
        title: document.sections.find(section => section.no === String(number).padStart(2, '0'))?.title ?? ''
    }));
}

/* Stands in for the number while the clause template is interpolated, so the template can be cut at the number:
   the number gets its own bold column, and whatever the template puts after it (in English a space, then the
   title) goes into the title column. That space opens a line, where CSS drops it, and it still separates the
   number from the title in the box's accessible name. */
const NUMBER_MARK = '\u0000';

function clauseCells(catalog: MessageCatalog, number: number, title: string): Readonly<{ number: string; title: string }> {
    const [before = '', ...after] = t(catalog, 'auth.signUp.italyApprovalClause', { number: NUMBER_MARK, title }).split(NUMBER_MARK);
    return { number: `${before}${number}`, title: after.join(String(number)) };
}

/**
 * The Italy approval box (mission italy-clause-approval S01; V's DONE.md 2026-10-24): the third row of the sign-up
 * consent group, under Terms. Unlike the Privacy and Terms rows, its text is a real <label for>, it holds no
 * document button and opens nothing, so a click on the box or on its label ticks it. The clause list is spans,
 * because a <label> holds phrasing content only; a visually hidden separator between clauses lets a screen reader
 * pause between them.
 */
export function ItalyApprovalBox({ idPrefix, catalog, terms, checked, onChange, disabled, error, inputRef }: Readonly<{
    idPrefix: 'signup' | 'social';
    catalog: MessageCatalog;
    terms: LegalDocument;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled: boolean;
    error: string | null;
    inputRef?: RefObject<HTMLInputElement | null>;
}>): JSX.Element {
    const inputId = `${idPrefix}-italy-approval`;
    const textId = `${inputId}-text`;
    const errorId = `${inputId}-error`;
    const separator = t(catalog, 'auth.signUp.italyApprovalClauseSeparator');
    const items = italyClauseItems(terms);
    return <>
 <div className="consentRow"><input className="consentBox" type="checkbox" name="italy-approval" id={inputId} ref={inputRef} checked={checked} disabled={disabled} aria-labelledby={textId} aria-invalid={error !== null} aria-describedby={error === null ? undefined : errorId} onChange={event => onChange(event.currentTarget.checked)}/><label className="consentText" id={textId} htmlFor={inputId}>{t(catalog, 'auth.signUp.italyApproval')} <span className="consentClauseList">{items.map((item, index) => {
            const cells = clauseCells(catalog, item.number, item.title);
            return <span className="consentClause" data-clause={item.number} key={item.number}><span className="consentClauseNumber">{cells.number}</span><span className="consentClauseTitle">{cells.title}{index < items.length - 1 ? <span className="srOnly">{separator}</span> : null}</span></span>;
        })}</span></label></div>
 <InlineFieldMessage id={errorId} message={error}/>
 </>;
}
