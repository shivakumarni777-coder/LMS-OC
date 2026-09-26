import { useQuery } from '@tanstack/react-query';
import {
  getCustomerByAccount,
  getCustomerLoans,
  listBranches,
} from '../api/customerService.js';

/**
 * Customer details plus their loan portfolio.
 *
 * The two requests are independent, so they are issued together by two query
 * hooks rather than one handler awaiting them in sequence. React Query starts
 * each on mount, which removes the waterfall.
 *
 * @param accountNumber string - the number typed by the user; kept as a string
 *   so a 12-digit value never passes through a float.
 */
export function useCustomer(accountNumber) {
  const loans = useCustomerLoans(accountNumber);

  const customer = useQuery({
    queryKey: ['customer', accountNumber],
    queryFn: () => getCustomerByAccount(accountNumber),
    enabled: Boolean(accountNumber),
    staleTime: 60_000,
  });

  return { customer, loans };
}

export function useCustomerLoans(accountNumber) {
  return useQuery({
    queryKey: ['customer', accountNumber, 'loans'],
    queryFn: () => getCustomerLoans(accountNumber),
    enabled: Boolean(accountNumber),
    staleTime: 30_000,
  });
}

/**
 * Branches offered in the registration form's dropdown.
 *
 * Served by the API rather than hardcoded, because the form's value has to
 * satisfy a foreign key into the same table. A list written into the bundle can
 * only be a guess at what is in that table, and the guess is invisible until an
 * insert fails on the constraint.
 *
 * Reference data that changes rarely, so it is cached for the life of the tab
 * and never refetched on focus.
 */
export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: listBranches,
    staleTime: Infinity,
  });
}
