import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveLoan, fetchLoanSummary, getLoan, listLoans } from '../api/loanService.js';

/**
 * Loan aggregate for the current caller.
 *
 * `staleTime` keeps the summary from being refetched on every navigation
 * within its freshness window, which matters because the dashboard and the
 * loans list both read the same underlying data.
 */
export function useLoanSummary() {
  return useQuery({
    queryKey: ['loans', 'summary'],
    queryFn: fetchLoanSummary,
    staleTime: 30_000,
  });
}

/** The caller's visible loans: all for an admin, their own otherwise. */
export function useLoans() {
  return useQuery({
    queryKey: ['loans'],
    queryFn: listLoans,
    staleTime: 30_000,
  });
}

/**
 * One loan, for the review screen.
 *
 * Served by the same owner-or-admin endpoint the customer uses, rather than a
 * second admin-only one. The read needs no extra authority - an officer is
 * already allowed to see every loan - so a second path would be a second
 * contract to keep in step with the first, with nothing gained.
 *
 * No `staleTime`: a review is a decision, and the status shown has to be the
 * status the approval call will be judged against.
 */
export function useLoan(loanId) {
  return useQuery({
    queryKey: ['loan', loanId],
    queryFn: () => getLoan(loanId),
    enabled: Boolean(loanId),
  });
}

/**
 * Approve a loan, setting its tenure and storing the recalculated EMI.
 *
 * The two loan queries are invalidated together. The detail screen's own row is
 * left to refetch on its own terms, but the list and the dashboard both count
 * approved loans in their totals, and leaving either stale shows an officer a
 * loan still in the pending queue seconds after approving it.
 */
export function useApproveLoan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loanId, tenureMonths }) => approveLoan(loanId, { tenureMonths }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loan'] });
    },
  });
}
