import { JSDOM } from "jsdom";
const dom = new JSDOM(`<input id="m" type="range" min="128" max="4000" step="128" value="800">`);
const el = dom.window.document.querySelector("#m");
console.log("jsdom  #maxTokens.value with min=128 step=128 value=800 ->", JSON.stringify(el.value));
el.value = "4000";
console.log("jsdom  after setting 4000 ->", JSON.stringify(el.value));
const d2 = new JSDOM(`<input id="d" type="range" min="1" max="5" step="1" value="2">`);
console.log("jsdom  treeDepth (min=1 step=1 value=2) ->", JSON.stringify(d2.window.document.querySelector("#d").value));
