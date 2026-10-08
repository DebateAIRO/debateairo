// @vitest-environment jsdom
import { act } from "react";
import { expect,it,vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import {mount,unmount} from "./task11-harness.js";
it("actual requestSubmit renders associated inline errors, focuses email and makes zero requests",async()=>{ const client={register:vi.fn(),checkAge:vi.fn()};const {host,root}=await mount(<SignUpFlow client={client}/>);try {const form=host.querySelector("form")!;expect(form.noValidate).toBe(true);await act(async()=>form.requestSubmit());expect(host.querySelector("input[name=email]")?.getAttribute("aria-invalid")).toBe("true");expect(document.activeElement).toBe(host.querySelector("input[name=email]"));expect(host.querySelector("input[name=phone]")).not.toBeNull();expect(host.querySelectorAll("input[name=confirm-email],input[name=confirm-password],input[name=recovery-email]")).toHaveLength(0);expect(client.register).not.toHaveBeenCalled();expect(client.checkAge).not.toHaveBeenCalled();}finally {await unmount(root,host);}});
