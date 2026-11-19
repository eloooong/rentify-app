import type { Metadata } from "next";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { requireUser } from "@/lib/auth/session";
import {
  notificationsHref,
  parseNotificationView,
} from "@/lib/listings/notifications";

export const metadata: Metadata = {
  title: "Notifications | Rentify",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage(
  props: PageProps<"/notifications">,
) {
  const view = parseNotificationView(await props.searchParams);
  const user = await requireUser(notificationsHref(view));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <NotificationCenter userId={user.id} view={view} />
    </div>
  );
}
