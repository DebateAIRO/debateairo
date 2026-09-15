# Browser probes — REV(S01) p1, lens product-truth

Run against the slice head `f6c147cc` with the stack in `stub-api.mjs` + the UI dev server from a
detached worktree. Paste each block into the harness pane's `javascript_tool` on your OWN tab.

## 0. The stack (my ports; pick free ones of your own)

```sh
# stub API — GET /v1/session 200, POST /v1/asks 202, every body logged verbatim
STUB_PORT=8850 node stub-api.mjs            # logs to stub-api.log

# the UI dev server from YOUR worktree (never :3000)
cd <worktree>/dialectical-engine/apps/ui && DIALECTICAL_UI_HOST=127.0.0.1 PORT=8851 \
  DIALECTICAL_API_BASE=http://127.0.0.1:8850 NEXT_PUBLIC_API_BASE=/api node server.mjs --dev
```

**Trap that cost me two false findings:** synthetic `computer left_click` does not reach the page while
your tab is in the background (the tab is not compositing; screenshots time out with the same cause), and
after fronting, an emulated viewport larger than the pane is scaled, so `ref` coordinates land off-target.
A background click silently does nothing and looks exactly like a product that ignores clicks. **Validate
the input method before trusting any negative result** — block 1 does that.

## 1. Method validation — prove `.click()` drives the page before believing any "nothing happened"

```js
const before = document.querySelector('.ndOptionsToggle').getAttribute('aria-expanded');
document.querySelector('.ndOptionsToggle').click();
await new Promise(r=>setTimeout(r,300));
const after = document.querySelector('.ndOptionsToggle').getAttribute('aria-expanded');
// methodWorks must be true. If it is false, your harness is broken, not the product.
({ methodWorks: before !== after, before, after });
```

## 2. B1 — `Max tokens` prints 800, the control holds 768 (replays `tier01-new-plan-tier.test.tsx:324-346`)

```js
const sleep=(m)=>new Promise(r=>setTimeout(r,m));
const setI=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,String(v));
  el.dispatchEvent(new Event('input',{bubbles:true}));};
const readout=()=>{const r=[...document.querySelectorAll('.ndRow')].find(x=>x.textContent.includes('Max tokens'));
  return r? r.innerText.trim().split('\n').pop().trim():null;};
document.querySelector('.ndOptionsToggle').click(); await sleep(300);
document.querySelector('[data-value="premium"]').click(); await sleep(300);
setI(document.querySelector('#maxTokens'),'4000'); await sleep(300);
const atPremium={inputValue:document.querySelector('#maxTokens').value, readout:readout()};
document.querySelector('[data-value="free"]').click(); await sleep(400);
({ atPremium,                                   // -> {inputValue:"3968", readout:"3968"}  (4000 unreachable)
   afterFree:{ inputValue:document.querySelector('#maxTokens').value,   // -> "768"
               readout:readout(),                                       // -> "800"
               valueAttr:document.querySelector('#maxTokens').getAttribute('value') } });  // -> "800"
```

The paired jsdom half is `jsdom-range.mjs` — same control, jsdom returns `"800"` and `"4000"`, which is
why the suite is green three runs. `treeDepth` (step 1) agrees in both, so only the off-grid control diverges.

## 3. N1 — the id spans wrap without the artboards' `white-space: nowrap` (RED → GREEN → RED)

Set the viewport so an option is ~135px wide (a ~320px viewport), then:

```js
const measure=()=>[...document.querySelectorAll('.ndTierModel')]
  .map(m=>({id:m.textContent.trim(), h:Math.round(m.getBoundingClientRect().height)}));
const before=measure();                                    // claude-sonnet-5 h=27, others 14
const st=document.createElement('style'); st.id='rev-mutant';
st.textContent='.ndTierModel{white-space:nowrap;}'; document.head.appendChild(st);
await new Promise(r=>setTimeout(r,150));
const withNowrap=measure();                                // all 14
document.getElementById('rev-mutant').remove();            // REVERT IN THE SAME EVALUATION
await new Promise(r=>setTimeout(r,150));
({before, withNowrap, reverted:measure(), mutantRemoved:!document.getElementById('rev-mutant')});
```

## 4. The M-line sweep (M8 lock census — the number the artboards pin)

```js
[...document.querySelectorAll('*')]
  .filter(e=>Math.abs(parseFloat(getComputedStyle(e).opacity)-0.45)<0.001)
  .map(e=>({cls:String(e.className), label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,26),
            cursor:getComputedStyle(e).cursor, disabled:e.disabled===true}));
```

Expected, both modes: **10** collapsed Free (6 pills + depth slider + 2 steering boxes + `Start run`),
**15** expanded Free, **14** Free-again-with-a-question, **0** Premium. Cross-check against the artboards
with `grep -c 'opacity: 0.45' <artboard>.dc.html`.

## 5. Cross-surface overlap (consent bar / support widget vs S01's surface)

```js
const R=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};};
const ov=(a,b)=>{const w=Math.min(a.right,b.right)-Math.max(a.x,b.x), h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
  return (w>0&&h>0)?{w,h}:null;};
// measure at >=1440x900; at the pane's own 529x321 EVERYTHING overlaps and you will file a false finding.
```

All four overlaps (`bar × tier`, `bar × bezel`, `bar × toggle`, `bar × Start run`) are null at 1440×900.
