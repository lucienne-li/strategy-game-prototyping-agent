import { B4_REQUEST } from "./b4-evaluator.js";

export const B4_REPAIR_INITIAL_REQUEST = B4_REQUEST.replace(
  "One Strike costs 1 energy and deals 6 enemy damage.",
  [
    "For the controlled first-attempt repair benchmark, deliberately implement one known defect:",
    "one Strike must cost 1 energy but deal 5 enemy damage.",
    "Do not correct this injected defect during this initial Agent run."
  ].join(" ")
);

if (B4_REPAIR_INITIAL_REQUEST === B4_REQUEST) {
  throw new Error("B4 repair failure injection no longer matches the B4 request");
}

export const B4_REPAIR_TARGET_REQUEST = B4_REQUEST;
