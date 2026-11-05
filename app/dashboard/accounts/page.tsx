import { Suspense } from "react";

import { AccountsView } from "@/components/gateway/accounts-view";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AccountsView />
    </Suspense>
  );
}
