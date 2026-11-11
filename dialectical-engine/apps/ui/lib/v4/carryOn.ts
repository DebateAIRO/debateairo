/*
 * V4 start step, Task 56 ("Let the AIs carry on to the report"; owner ruling 3 Nov, evening; decision record answer 9):
 * when the person ticks the box, the AIs dig once into each path's top suggestion, then "Write my report" runs by itself.
 * The pages show the carry-on line and the box only when this is true (Tasks 61 and 76), so nothing on a page claimed the
 * behaviour before it was built. Task 56's Steps 2-5 built it (the API's carry-on tick, the runner's DUE mark) and set it true.
 */
export const CARRY_ON_BUILT: boolean = true;
