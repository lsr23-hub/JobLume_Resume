import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "@/app/app/dashboard/profile/page";

export const Route = createFileRoute("/app/dashboard/profile")({
  component: ProfilePage,
});
