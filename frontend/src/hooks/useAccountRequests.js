import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAccountRequest,
  listAccountRequests,
  reviewAccountRequest,
} from '../api/accountService.js';

/**
 * The officer's account-opening queries.
 *
 * Kept apart from the customer's own `useAccount` hook because the two answer
 * different questions over different rows: a customer can only ever see their
 * latest request, and only their own. An officer sees everyone's. Sharing one
 * module would invite a cache key to be reused across the two, and a cache
 * shared between "my request" and "the queue" serves one to the other.
 *
 * Short `staleTime` throughout. A decision is made by one officer and read by
 * another, so a queue left fresh for half a minute is a queue that can show a
 * request as pending after it has been approved elsewhere.
 */

export function accountRequestsKey(status) {
  return ['account-requests', status ?? 'all'];
}

export function useAccountRequests(status) {
  return useQuery({
    queryKey: accountRequestsKey(status),
    queryFn: () => listAccountRequests(status),
    staleTime: 5_000,
  });
}

export function useAccountRequest(requestId) {
  return useQuery({
    queryKey: ['account-requests', 'detail', requestId],
    queryFn: () => getAccountRequest(requestId),
    // Not refetched on window focus: an officer leaves this page open while
    // reading a document, and a refetch mid-decision would swap the row under
    // the decision they are about to submit.
    staleTime: 5_000,
  });
}

/**
 * Approve or reject a request.
 *
 * On success it invalidates every account-request query rather than patching the
 * one row: a decision changes the row's status, removes or adds it from the
 * filtered queue, and may add a new customer who then appears in the queue's
 * unfiltered view. Three keys are easier to keep right than one optimistic
 * update that has to be undone if the server's resulting account number differs
 * from the guess.
 */
export function useReviewAccountRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, decision, reviewNotes }) =>
      reviewAccountRequest(requestId, { decision, reviewNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-requests'] });
    },
  });
}
