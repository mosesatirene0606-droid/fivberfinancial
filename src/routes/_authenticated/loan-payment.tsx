import { createFileRoute } from "@tanstack/react-router";
import { IntensivePaymentPage } from "./intensive-payment";

// Legacy route kept so old /loan-payment links do not break.
// New withdrawal links should use /intensive-payment.
export const Route = createFileRoute("/_authenticated/loan-payment")({ component: IntensivePaymentPage });
