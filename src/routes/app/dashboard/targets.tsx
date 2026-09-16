import { createFileRoute } from "@tanstack/react-router";
import TargetsPage from "@/app/app/dashboard/targets/page";

export const Route = createFileRoute("/app/dashboard/targets")({
  component: TargetsPage,
});
