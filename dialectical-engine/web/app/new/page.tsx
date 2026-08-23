import { deriveMachineAskAsOf } from "@/lib/serverAskDefaults";
import { NewQuestionForm } from "./NewQuestionForm";

export const dynamic = "force-dynamic";

export default function NewQuestionPage() {
  return <NewQuestionForm machineAsOf={deriveMachineAskAsOf()} />;
}
