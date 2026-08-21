// Compatibility import surface only: every wire shape remains declared once in
// packages/contract and arrives here through its generated client artifact.
export type {
  Answer,
  AnswerIndex,
  AskAccepted,
  AskRequest,
  ConditionMark,
  ContractClient,
  Deployment,
  Edge,
  ExecutionLedgerDigest,
  Inspection,
  Node,
  RunEvent,
  Session,
  StalenessState
} from "@debateai/contract";
