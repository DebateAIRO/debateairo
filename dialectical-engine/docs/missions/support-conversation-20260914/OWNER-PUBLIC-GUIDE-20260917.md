# Owner steering: conversational public app guide

> While doing this task, ask yourself what a support agent should be able to guide users for.
>
> Users should be able to find anything within the app via Support Agent, and our support agent must be something more than just "click a couple pill options and you get directed to where the pill options take you."
>
> Users should be able to freely converse with the SupportAgent, within the limitations of the app as we want to avoid prompt injection and any kind of exploit that might leak data. Our Support Agent should also NOT have access to info, but it should know all the App menus

Working interpretation: Support is a free-text conversational guide to all app menus, features, prerequisites and limitations. Suggested pills are optional. It may know reviewed public descriptions/routes; it must not receive/read users' private content or account data. This later instruction supersedes any earlier requirement to expose private-status information to Support where they conflict. Preserve application ownership/privacy controls and the separate human support system; do not interpret guidance as authorization to execute account operations. Assess current architecture before proposing scoped changes. No interface redesign, runtime-model change, replacement recovery flow, credential operation, checkpoint acceptance or CP2/CP3 advancement is implied. Existing correction remains necessary and continues independently.
