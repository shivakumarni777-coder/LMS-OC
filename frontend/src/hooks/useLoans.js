import { useQuery } from '@tanstack/react-query';
import { fetchLoanSummary, listLoans } from '../api/loanService.js';

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
