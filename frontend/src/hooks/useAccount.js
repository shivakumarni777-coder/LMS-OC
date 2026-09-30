import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountStatus, requestAccountOpening } from '../api/accountService.js';

/**
 * Account status, and the request that would change it.
 *
 * The loan application page asks `useAccountStatus` before rendering anything,
 * because a loan is booked against a customer account: offering the form to
 * someone with no account produces an application the backend cannot record, and
 * the failure surfaces as an opaque rejection rather than as an explanation.
 *
 * A customer with no account is therefore a state this app has to render, not an
 * error case to report.
 */

/** Query key shared by the status query and the mutation that invalidates it. */
export const ACCOUNT_STATUS_KEY = ['account', 'status'];

/**
 * Whether the caller has a bank account, plus any outstanding request.
 *
 * Deliberately short-lived: the answer changes when an officer approves, and the
 * page has to notice that on the next visit without the user reloading. Long
 * enough that moving between two pages does not refetch it.
 */
export function useAccountStatus({ enabled = true } = {}) {
  return useQuery({
    queryKey: ACCOUNT_STATUS_KEY,
    queryFn: getAccountStatus,
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Files an account-opening request.
 *
 * The status query is refetched on success rather than patched in place, because
 * the status response is a projection the backend builds - it decides which
 * request to show and whether the account now exists - and a locally
 * constructed version of it would be a second source of truth free to disagree
 * with the server about the one thing the page is about.
 */
export function useRequestAccountOpening() {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed as `mutationFn: requestAccountOpening` because
    // React Query calls the mutation function with a second argument, so the
    // bare reference would forward it to the service as an extra parameter.
    mutationFn: (panNo) => requestAccountOpening(panNo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_STATUS_KEY }),
  });
}
