// CODE-REV-S02-C8-r2 — is the .70 rung a TIE decided by the spelling of (1 - alpha)?
// The seat's root-cause refinement of my r1 B1, checked independently.
const a = 0.7, ink = 0x26 /*38, --ink green*/, shell = 0xE9 /*233, --shell green*/;
const shipped = a * ink + (1 - a) * shell;          // the shipped composite()
const handTyped = a * ink + 0.30 * shell;           // a hand re-derivation with the literal .30
console.log("1 - 0.7                       =", (1 - a).toString());
console.log("0.7*38 + (1-0.7)*233          =", shipped, "-> Math.round =", Math.round(shipped), " Math.floor =", Math.floor(shipped));
console.log("0.7*38 +   0.30 *233          =", handTyped, "-> Math.round =", Math.round(handTyped), " Math.floor =", Math.floor(handTyped));
console.log("is the shipped sum an exact tie (x*2 is an odd integer)? ", shipped * 2 === Math.trunc(shipped * 2) && Math.trunc(shipped*2) % 2 === 1);
console.log("Math.round(x) === Math.floor(x) for the hand-typed value? ", Math.round(handTyped) === Math.floor(handTyped));
// and the .65 rung, for contrast — why it reproduced for everyone
const b = 0.65;
const s65 = b*ink + (1-b)*shell, h65 = b*ink + 0.35*shell;
console.log("0.65 shipped =", s65, "round", Math.round(s65), "| hand .35 =", h65, "round", Math.round(h65), "-> same channel?", Math.round(s65)===Math.round(h65));
