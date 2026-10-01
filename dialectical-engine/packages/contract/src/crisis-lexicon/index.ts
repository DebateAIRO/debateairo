// Every language the interface speaks has a list; every list is tried on every question.
import type { CrisisLexicon } from "./types.js";
import { AR } from "./ar.js";
import { BG } from "./bg.js";
import { CS } from "./cs.js";
import { DA } from "./da.js";
import { DE } from "./de.js";
import { EL } from "./el.js";
import { EN } from "./en.js";
import { ES } from "./es.js";
import { ET } from "./et.js";
import { FI } from "./fi.js";
import { FR } from "./fr.js";
import { GA } from "./ga.js";
import { HE } from "./he.js";
import { HI } from "./hi.js";
import { HR } from "./hr.js";
import { HU } from "./hu.js";
import { ID } from "./id.js";
import { IT } from "./it.js";
import { JA } from "./ja.js";
import { KO } from "./ko.js";
import { LT } from "./lt.js";
import { LV } from "./lv.js";
import { MT } from "./mt.js";
import { NL } from "./nl.js";
import { PL } from "./pl.js";
import { PT } from "./pt.js";
import { RO } from "./ro.js";
import { RU } from "./ru.js";
import { SK } from "./sk.js";
import { SL } from "./sl.js";
import { SV } from "./sv.js";
import { TR } from "./tr.js";
import { UK } from "./uk.js";
import { VI } from "./vi.js";
import { ZH } from "./zh.js";

export type { CrisisLexicon, CrisisSignal } from "./types.js";

export const CRISIS_LEXICONS: readonly CrisisLexicon[] = Object.freeze([
  EN,
  AR,
  BG,
  CS,
  DA,
  DE,
  EL,
  ES,
  ET,
  FI,
  FR,
  GA,
  HE,
  HI,
  HR,
  HU,
  ID,
  IT,
  JA,
  KO,
  LT,
  LV,
  MT,
  NL,
  PL,
  PT,
  RO,
  RU,
  SK,
  SL,
  SV,
  TR,
  UK,
  VI,
  ZH
]);
