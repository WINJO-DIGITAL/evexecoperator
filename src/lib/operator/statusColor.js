// Status pill colours for the (light) operator app. Dark text on a pale fill
// so every status reads clearly on white.
export function bookingStatusColor(status) {
  switch (status) {
    case "Dispatched":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "En Route":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Arrived":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "Passenger On Board":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Completed":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "Cancelled":
    case "No Show":
      return "border-slate-200 bg-slate-50 text-slate-500";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}
