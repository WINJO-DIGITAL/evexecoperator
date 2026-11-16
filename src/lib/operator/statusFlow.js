// Operator status corrections.
//
// Forward status progression (Dispatched → En Route → … → Completed) is the
// DRIVER's job in the driver app. The operator can only REVERSE a job one step
// to correct a mistake, or cancel it. This map gives the previous status for a
// one-step reverse. 'Arrived' is a driver-app sub-state; reversing it drops
// back to En Route. Reversing a cancelled job reinstates it to Unassigned.
const REVERSE_STATUS = {
  Dispatched: "Unassigned",
  "En Route": "Dispatched",
  Arrived: "En Route",
  "Passenger On Board": "En Route",
  Completed: "Passenger On Board",
  Cancelled: "Unassigned",
};

// The status a one-step reverse would move this job to, or null if there's
// nothing to reverse (e.g. an Unassigned job).
export function reverseTarget(status) {
  return REVERSE_STATUS[status] ?? null;
}

// A friendly label for the reverse action.
export function reverseLabel(status) {
  const to = reverseTarget(status);
  if (!to) return null;
  if (status === "Cancelled") return "Reinstate job (→ Unassigned)";
  return `Reverse to ${to}`;
}
