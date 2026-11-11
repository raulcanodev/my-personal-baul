import {
  defaultShouldDehydrateQuery,
  QueryClient,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import SuperJSON from "superjson";
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/server/api/root";

function isUnauthorized(error: unknown) {
  return (
    error instanceof TRPCClientError &&
    (error as TRPCClientError<AppRouter>).data?.code === "UNAUTHORIZED"
  );
}

function handleSessionError(error: unknown) {
  if (
    isUnauthorized(error) &&
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/dashboard")
  ) {
    window.location.replace("/login");
  }
}

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({ onError: handleSessionError }),
    mutationCache: new MutationCache({ onError: handleSessionError }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        retry: (failureCount, error) =>
          !isUnauthorized(error) && failureCount < 3,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
